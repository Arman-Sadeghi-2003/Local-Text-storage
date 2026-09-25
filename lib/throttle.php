<?php
/**
 * Throttle — Failed-login counters and lockout.
 *
 * Included by api.php, which defines the constants used here.
 */

defined('TFS_APP') or exit;

function client_key(): string
{
    return hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

function attempts_load(): array
{
    if (!file_exists(ATTEMPTS_FILE)) {
        return [];
    }
    $data = json_decode((string) file_get_contents(ATTEMPTS_FILE), true);
    return is_array($data) ? $data : [];
}

function attempts_save(array $data)
{
    if (!is_dir(AUTH_DIR)) {
        if (!@mkdir(AUTH_DIR, 0700, true) && !is_dir(AUTH_DIR)) {
            return;
        }
        // Belt and braces for Apache; the leading dot already hides it on most setups
        @file_put_contents(AUTH_DIR . '/.htaccess', "Require all denied\n");
    }

    // Drop expired entries so the file cannot grow without bound
    $now = time();
    foreach ($data as $key => $entry) {
        if (($entry['seen'] ?? 0) < $now - LOCKOUT_SECONDS * 4) {
            unset($data[$key]);
        }
    }

    @file_put_contents(ATTEMPTS_FILE, json_encode($data), LOCK_EX);
}

/** Seconds remaining before this client may try again; 0 when not locked out. */
function throttle_remaining(): int
{
    $entry = attempts_load()[client_key()] ?? null;
    if ($entry === null || ($entry['count'] ?? 0) < MAX_ATTEMPTS) {
        return 0;
    }
    return max(0, (int) ($entry['seen'] ?? 0) + LOCKOUT_SECONDS - time());
}

function throttle_record_failure()
{
    $data = attempts_load();
    $key = client_key();
    $entry = $data[$key] ?? ['count' => 0, 'seen' => 0];

    // A lockout that has expired resets the counter
    if (($entry['count'] ?? 0) >= MAX_ATTEMPTS && time() - (int) $entry['seen'] > LOCKOUT_SECONDS) {
        $entry = ['count' => 0, 'seen' => 0];
    }

    $entry['count'] = (int) $entry['count'] + 1;
    $entry['seen'] = time();
    $data[$key] = $entry;
    attempts_save($data);
}

function throttle_clear()
{
    $data = attempts_load();
    unset($data[client_key()]);
    attempts_save($data);
}
