<?php
/**
 * Auth — Session authentication and CSRF tokens.
 *
 * Included by api.php, which defines the constants used here.
 */

defined('TFS_APP') or exit;

function auth_is_active(): bool
{
    return !empty($_SESSION['authenticated']);
}

function auth_begin()
{
    session_regenerate_id(true);
    $_SESSION['authenticated'] = true;
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function auth_end()
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
    }
    session_destroy();
}

function csrf_token(): string
{
    return (string) ($_SESSION['csrf'] ?? '');
}

/** Aborts unless the caller holds a valid session. */
function require_auth()
{
    if (!auth_is_active()) {
        fail('Please sign in to continue.', 401, 'unauthenticated');
    }
}

/** Aborts unless the request carries the session's CSRF token. */
function require_csrf()
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf'] ?? '');
    if ($sent === '' || !hash_equals(csrf_token(), (string) $sent)) {
        fail('Security token missing or expired. Reload the page and try again.', 403, 'csrf');
    }
}
