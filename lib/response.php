<?php
/**
 * Response — JSON response helpers.
 *
 * Included by api.php, which defines the constants used here.
 */

defined('TFS_APP') or exit;

function respond(array $payload, int $status = 200)
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function ok(array $payload = [])
{
    respond(array_merge(['success' => true], $payload));
}

function fail(string $message, int $status = 400, string $code = '', array $extra = [])
{
    $payload = ['success' => false, 'error' => $message];
    if ($code !== '') {
        $payload['code'] = $code;
    }
    respond(array_merge($payload, $extra), $status);
}
