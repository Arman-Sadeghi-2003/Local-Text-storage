<?php
/**
 * Versions — Revision snapshots.
 *
 * Included by api.php, which defines the constants used here.
 */

defined('TFS_APP') or exit;

/** Timestamped, collision-proof identifier: 20260816-142530-9f3a */
function stamp_new(): string
{
    return date('Ymd-His') . '-' . bin2hex(random_bytes(2));
}

function stamp_is_valid(string $stamp): bool
{
    return (bool) preg_match('/^\d{8}-\d{6}-[0-9a-f]{4}$/', $stamp);
}

/** Parses a stamp back into a unix timestamp; 0 when unparseable. */
function stamp_time(string $stamp): int
{
    $parsed = date_create_from_format('Ymd-His', substr($stamp, 0, 15));
    return $parsed === false ? 0 : $parsed->getTimestamp();
}

/** Directory holding one file's revisions, or null for an unusable name. */
function versions_dir(string $filename)
{
    $path = store_path($filename);
    if ($path === null) {
        return null;
    }
    $slug = preg_replace('/[^a-zA-Z0-9_-]/', '_', substr(basename($path), 0, -4));
    return $slug === '' ? null : VERSIONS_DIR . '/' . $slug;
}

/** Copies the current content aside. Called before any overwrite. */
function versions_snapshot(string $filename): bool
{
    $current = store_read($filename);
    if ($current === null) {
        return false;                       // nothing to snapshot yet
    }

    $dir = versions_dir($filename);
    if ($dir === null) {
        return false;
    }
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        return false;
    }

    $written = @file_put_contents($dir . '/' . stamp_new() . '.txt', $current, LOCK_EX) !== false;
    versions_prune($filename);
    return $written;
}

/** Keeps the newest MAX_VERSIONS revisions and drops the rest. */
function versions_prune(string $filename)
{
    $dir = versions_dir($filename);
    if ($dir === null || !is_dir($dir)) {
        return;
    }

    $stamps = versions_stamps($dir);
    $excess = count($stamps) - MAX_VERSIONS;
    if ($excess <= 0) {
        return;
    }

    // versions_stamps() is newest-first, so the tail is the oldest
    foreach (array_slice($stamps, MAX_VERSIONS) as $stamp) {
        @unlink($dir . '/' . $stamp . '.txt');
    }
}

/** Bare stamp names inside a revision directory, newest first. */
function versions_stamps(string $dir): array
{
    $entries = @scandir($dir);
    if ($entries === false) {
        return [];
    }

    $stamps = [];
    foreach ($entries as $entry) {
        if (strtolower(substr($entry, -4)) !== '.txt') {
            continue;
        }
        $stamp = substr($entry, 0, -4);
        if (stamp_is_valid($stamp)) {
            $stamps[] = $stamp;
        }
    }

    rsort($stamps);                          // stamps sort chronologically as strings
    return $stamps;
}

function versions_list(string $filename): array
{
    $dir = versions_dir($filename);
    if ($dir === null || !is_dir($dir)) {
        return [];
    }

    $out = [];
    foreach (versions_stamps($dir) as $stamp) {
        $out[] = [
            'stamp' => $stamp,
            'saved' => stamp_time($stamp),
            'size'  => (int) @filesize($dir . '/' . $stamp . '.txt'),
        ];
    }
    return $out;
}

/** Content of one revision, or null when it does not exist. */
function version_read(string $filename, string $stamp)
{
    $dir = versions_dir($filename);
    if ($dir === null || !stamp_is_valid($stamp)) {
        return null;
    }

    $path = $dir . '/' . $stamp . '.txt';
    if (!is_file($path)) {
        return null;
    }

    $content = @file_get_contents($path);
    return $content === false ? null : $content;
}

function versions_destroy(string $filename)
{
    $dir = versions_dir($filename);
    if ($dir === null || !is_dir($dir)) {
        return;
    }
    foreach (versions_stamps($dir) as $stamp) {
        @unlink($dir . '/' . $stamp . '.txt');
    }
    @rmdir($dir);
}
