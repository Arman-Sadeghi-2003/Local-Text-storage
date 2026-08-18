<?php
/**
 * Text File Storage — JSON API
 *
 * Requires PHP 7.3+ (SameSite cookie support).
 *
 * Layout:
 *   config.php         password hash, created on first run (git-ignored)
 *   datasets/          stored .txt files
 *   datasets/.versions/<name>/<stamp>.txt   prior revisions
 *   datasets-trash/    soft-deleted files, purged after 30 days
 *   .auth/             failed-login counters
 *
 * Every action except `status`, `ping`, `setup` and `login` requires a session.
 * Every state-changing action additionally requires a CSRF token.
 */

declare(strict_types=1);

define('STORAGE_DIR', __DIR__ . '/datasets');
define('INDEX_FILE', STORAGE_DIR . '/.index.json');
define('VERSIONS_DIR', STORAGE_DIR . '/.versions');
define('TRASH_DIR', __DIR__ . '/datasets-trash');
define('CONFIG_FILE', __DIR__ . '/config.php');
define('AUTH_DIR', __DIR__ . '/.auth');
define('ATTEMPTS_FILE', AUTH_DIR . '/attempts.json');

define('MAX_ATTEMPTS', 5);
define('LOCKOUT_SECONDS', 300);
define('MIN_PASSWORD_LENGTH', 8);

define('MAX_VERSIONS', 20);
define('TRASH_TTL_SECONDS', 30 * 24 * 60 * 60);

define('MAX_TAGS', 10);
define('MAX_TAG_LENGTH', 24);
define('MAX_TITLE_LENGTH', 120);

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

/* Guard: lib/ files refuse to run unless included from here */
define('TFS_APP', true);

require_once __DIR__ . '/lib/response.php';
require_once __DIR__ . '/lib/session.php';
require_once __DIR__ . '/lib/settings.php';
require_once __DIR__ . '/lib/throttle.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/store.php';
require_once __DIR__ . '/lib/metadata.php';
require_once __DIR__ . '/lib/search.php';
require_once __DIR__ . '/lib/versions.php';
require_once __DIR__ . '/lib/trash.php';

/* ============================================================
   Request handling
   ============================================================ */

start_session();

$action = $_GET['action'] ?? $_POST['action'] ?? '';

/** Content is required, but "0" is a legitimate body. */
function required_text(string $value): string
{
    if (trim($value) === '') {
        fail('Content is required.');
    }
    return $value;
}

function required_name(string $value, string $label = 'A filename'): string
{
    if (trim($value) === '') {
        fail($label . ' is required.');
    }
    return $value;
}

switch ($action) {

    /* -------- public -------- */

    case 'status':
        ok([
            'configured'    => config_is_set(),
            'authenticated' => auth_is_active(),
            'csrf'          => auth_is_active() ? csrf_token() : null,
        ]);
        break;

    case 'ping':
        // Retained for compatibility with older clients
        ok();
        break;

    case 'setup':
        if (config_is_set()) {
            fail('A password has already been set.', 409, 'already_configured');
        }

        $password = (string) ($_POST['password'] ?? '');
        if (strlen($password) < MIN_PASSWORD_LENGTH) {
            fail('Password must be at least ' . MIN_PASSWORD_LENGTH . ' characters.');
        }

        if (!config_write(password_hash($password, PASSWORD_DEFAULT))) {
            fail('Could not write config.php. Check that the application directory is writable.', 500);
        }

        auth_begin();
        ok(['csrf' => csrf_token()]);
        break;

    case 'login':
        $config = config_load();
        if ($config === null) {
            fail('No password has been set yet.', 409, 'not_configured');
        }

        $wait = throttle_remaining();
        if ($wait > 0) {
            fail('Too many failed attempts. Try again in ' . ceil($wait / 60) . ' minute(s).', 429, 'rate_limited');
        }

        if (!password_verify((string) ($_POST['password'] ?? ''), $config['password_hash'])) {
            throttle_record_failure();
            fail('Incorrect password.', 401, 'bad_credentials');
        }

        throttle_clear();
        auth_begin();
        ok(['csrf' => csrf_token()]);
        break;

    /* -------- password management (admin) -------- */

    case 'password_change':
        require_auth();
        require_csrf();

        $config = config_load();
        if ($config === null) {
            fail('No password is set on this server.', 409, 'not_configured');
        }

        // Throttled like login: a session is not licence to guess the password
        $wait = throttle_remaining();
        if ($wait > 0) {
            fail('Too many failed attempts. Try again in ' . ceil($wait / 60) . ' minute(s).', 429, 'rate_limited');
        }

        if (!password_verify((string) ($_POST['current'] ?? ''), $config['password_hash'])) {
            throttle_record_failure();
            fail('Current password is incorrect.', 401, 'bad_credentials');
        }

        $next = (string) ($_POST['password'] ?? '');
        if (strlen($next) < MIN_PASSWORD_LENGTH) {
            fail('New password must be at least ' . MIN_PASSWORD_LENGTH . ' characters.');
        }

        if (!config_write(password_hash($next, PASSWORD_DEFAULT))) {
            fail('Could not write config.php. Check that the application directory is writable.', 500);
        }

        throttle_clear();
        auth_begin();          // fresh session id and CSRF token after a credential change
        ok(['csrf' => csrf_token()]);
        break;

    case 'password_remove':
        require_auth();
        require_csrf();

        $config = config_load();
        if ($config === null) {
            fail('No password is set on this server.', 409, 'not_configured');
        }

        $wait = throttle_remaining();
        if ($wait > 0) {
            fail('Too many failed attempts. Try again in ' . ceil($wait / 60) . ' minute(s).', 429, 'rate_limited');
        }

        if (!password_verify((string) ($_POST['current'] ?? ''), $config['password_hash'])) {
            throttle_record_failure();
            fail('Current password is incorrect.', 401, 'bad_credentials');
        }

        if (!config_clear()) {
            fail('Could not delete config.php. Check file permissions.', 500);
        }

        throttle_clear();
        auth_end();            // no password means no valid session
        ok();
        break;

    /* -------- authenticated, read-only -------- */

    case 'logout':
        require_auth();
        require_csrf();
        auth_end();
        ok();
        break;

    case 'list':
        require_auth();
        ok(['files' => store_list_meta()]);
        break;

    case 'export':
        require_auth();

        /*
         * A JSON bundle rather than a zip of .txt files: titles and tags live
         * in the index, and a zip would drop them on the floor. This round
         * trips losslessly back through import.
         */
        $bundle = [
            'format'   => 'text-file-storage',
            'version'  => 3,
            'exported' => time(),
            'files'    => [],
        ];

        foreach (store_list_meta() as $entry) {
            $content = store_read($entry['name']);
            if ($content === null) {
                continue;
            }
            $bundle['files'][] = [
                'name'     => $entry['name'],
                'title'    => $entry['title'],
                'tags'     => $entry['tags'],
                'modified' => $entry['modified'],
                'content'  => $content,
            ];
        }

        ok(['bundle' => $bundle]);
        break;

    case 'search':
        require_auth();

        $needle = trim((string) ($_GET['q'] ?? ''));
        if ($needle === '') {
            ok(['results' => [], 'query' => '']);
        }
        ok(['results' => search_files($needle), 'query' => $needle]);
        break;

    case 'read':
        require_auth();
        $filename = required_name((string) ($_GET['filename'] ?? ''));

        $content = store_read($filename);
        if ($content === null) {
            fail('File not found.', 404, 'not_found');
        }
        $meta = index_entry(basename($filename));
        ok([
            'filename' => basename($filename),
            'content'  => $content,
            'version'  => store_version($content),
            'title'    => $meta['title'],
            'tags'     => $meta['tags'],
        ]);
        break;

    /* -------- authenticated, state-changing -------- */

    case 'save':
        require_auth();
        require_csrf();

        // `title` is the display name; `filename` is accepted for older clients
        $title = trim((string) ($_POST['title'] ?? $_POST['filename'] ?? ''));
        if ($title === '') {
            fail('A title is required.');
        }

        $text = required_text((string) ($_POST['text'] ?? ''));
        $target = slug_from_title($title);

        if (!store_write($target, $text)) {
            fail('Failed to save the file.', 500);
        }

        index_update($target, $title, $_POST['tags'] ?? []);
        $meta = index_entry($target);

        ok([
            'filename' => $target,
            'version'  => store_version($text),
            'title'    => $meta['title'],
            'tags'     => $meta['tags'],
        ]);
        break;

    case 'update':
        require_auth();
        require_csrf();

        $filename = required_name((string) ($_POST['filename'] ?? ''));
        $text = required_text((string) ($_POST['text'] ?? ''));

        $base = (string) ($_POST['base'] ?? '');

        $current = store_read($filename);
        if ($current === null) {
            fail('File not found.', 404, 'not_found');
        }

        /*
         * Optimistic concurrency: the caller sends the version it started
         * from. If the stored content has moved on since, refuse the write
         * and hand back what is actually there so the client can offer a
         * choice rather than silently discarding somebody's work.
         */
        $currentVersion = store_version($current);
        if ($base !== '' && !hash_equals($currentVersion, $base)) {
            fail(
                'This file changed since you opened it.',
                409,
                'conflict',
                ['current' => $current, 'version' => $currentVersion]
            );
        }

        versions_snapshot($filename);     // keep the outgoing content

        if (!store_write($filename, $text)) {
            fail('Failed to update the file.', 500);
        }

        /*
         * Renaming changes the title in the index, never the slug on disk —
         * the slug is what revisions and trash entries point at, so moving
         * it would orphan them.
         */
        index_update(
            basename($filename),
            array_key_exists('title', $_POST) ? $_POST['title'] : null,
            array_key_exists('tags', $_POST) ? $_POST['tags'] : null
        );
        $meta = index_entry(basename($filename));

        ok([
            'filename' => basename($filename),
            'version'  => store_version($text),
            'title'    => $meta['title'],
            'tags'     => $meta['tags'],
        ]);
        break;

    case 'delete':
        require_auth();
        require_csrf();

        $filename = required_name((string) ($_POST['filename'] ?? ''));

        if (!store_exists($filename)) {
            fail('File not found.', 404, 'not_found');
        }

        $id = trash_move($filename);
        if ($id === null) {
            fail('Failed to move the file to the trash.', 500);
        }
        ok(['id' => $id, 'filename' => basename($filename)]);
        break;

    /* -------- trash -------- */

    case 'trash_list':
        require_auth();
        trash_purge();
        ok(['entries' => trash_list()]);
        break;

    case 'restore':
        require_auth();
        require_csrf();

        $id = required_name((string) ($_POST['id'] ?? ''), 'A trash entry id');

        $parts = trash_id_split($id);
        $original = $parts === null ? '' : $parts['original'];
        $title = $original === '' ? null : index_entry($original)['title'];
        $tags = $original === '' ? null : index_entry($original)['tags'];

        $restored = trash_restore($id);
        if ($restored === null) {
            fail('That trash entry no longer exists.', 404, 'not_found');
        }

        // A name clash restores under a new slug; carry the title across
        if ($restored !== $original) {
            index_update($restored, $title, $tags);
        }

        ok(['filename' => $restored, 'title' => index_entry($restored)['title']]);
        break;

    case 'trash_delete':
        require_auth();
        require_csrf();

        $id = required_name((string) ($_POST['id'] ?? ''), 'A trash entry id');

        if (!trash_destroy($id)) {
            fail('That trash entry no longer exists.', 404, 'not_found');
        }
        ok();
        break;

    /* -------- revisions -------- */

    case 'versions':
        require_auth();
        $filename = required_name((string) ($_GET['filename'] ?? ''));
        ok(['versions' => versions_list($filename)]);
        break;

    case 'version_read':
        require_auth();
        $filename = required_name((string) ($_GET['filename'] ?? ''));
        $stamp = required_name((string) ($_GET['stamp'] ?? ''), 'A revision stamp');

        $content = version_read($filename, $stamp);
        if ($content === null) {
            fail('That revision no longer exists.', 404, 'not_found');
        }
        ok(['filename' => basename($filename), 'stamp' => $stamp, 'content' => $content]);
        break;

    default:
        fail('Unknown action.', 404);
}
