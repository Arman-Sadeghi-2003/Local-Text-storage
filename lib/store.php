<?php
/**
 * Store — The only code that touches stored files.
 *
 * Included by api.php, which defines the constants used here.
 */

defined('TFS_APP') or exit;

function store_init(): bool
{
    if (is_dir(STORAGE_DIR)) {
        return true;
    }
    return @mkdir(STORAGE_DIR, 0755, true) || is_dir(STORAGE_DIR);
}

/**
 * Resolve an existing file's name to an absolute path inside STORAGE_DIR.
 * Returns null when the name is unusable — traversal, wrong extension, hidden file.
 */
function store_path(string $filename)
{
    $name = basename(trim($filename));

    if ($name === '' || $name === '.' || $name === '..' || $name[0] === '.') {
        return null;
    }
    if (strtolower(substr($name, -4)) !== '.txt') {
        return null;
    }

    return STORAGE_DIR . '/' . $name;
}

function store_list(): array
{
    if (!is_dir(STORAGE_DIR)) {
        return [];
    }

    $entries = @scandir(STORAGE_DIR);
    if ($entries === false) {
        return [];
    }

    $files = [];
    foreach ($entries as $entry) {
        if ($entry[0] === '.') {
            continue;                       // skip dotfiles and .versions/ (Phase 2)
        }
        $path = STORAGE_DIR . '/' . $entry;
        if (!is_file($path) || strtolower(substr($entry, -4)) !== '.txt') {
            continue;
        }
        $files[] = $entry;
    }

    sort($files, SORT_NATURAL | SORT_FLAG_CASE);
    return $files;
}

/** Like store_list(), but with the metadata the sidebar shows and sorts on. */
function store_list_meta(): array
{
    $index = index_reconcile();

    $out = [];
    foreach (store_list() as $name) {
        $path = STORAGE_DIR . '/' . $name;
        $entry = $index[$name] ?? [];

        $out[] = [
            'name'     => $name,
            'title'    => isset($entry['title']) && $entry['title'] !== ''
                ? (string) $entry['title']
                : title_default($name),
            'tags'     => tags_normalize($entry['tags'] ?? []),
            'size'     => (int) @filesize($path),
            'modified' => (int) @filemtime($path),
        ];
    }
    return $out;
}

function store_exists(string $filename): bool
{
    $path = store_path($filename);
    return $path !== null && is_file($path);
}

/** Returns the file contents, or null when it cannot be read. */
function store_read(string $filename)
{
    $path = store_path($filename);
    if ($path === null || !is_file($path)) {
        return null;
    }
    $content = @file_get_contents($path);
    return $content === false ? null : $content;
}

/**
 * Opaque token identifying a file's exact content.
 *
 * Content-derived rather than mtime-derived, so a rewrite that changes
 * nothing does not provoke a false conflict, and one-second filesystem
 * timestamp resolution cannot hide a change.
 */
function store_version(string $content): string
{
    return hash('sha256', $content);
}

/** Current version token of a stored file, or null when it does not exist. */
function store_version_of(string $filename)
{
    $content = store_read($filename);
    return $content === null ? null : store_version($content);
}

/** Writes content to an already-resolved name. Returns false on failure. */
function store_write(string $filename, string $text): bool
{
    if (!store_init()) {
        return false;
    }
    $path = store_path($filename);
    if ($path === null) {
        return false;
    }
    return @file_put_contents($path, $text, LOCK_EX) !== false;
}

function store_delete(string $filename): bool
{
    $path = store_path($filename);
    if ($path === null || !is_file($path)) {
        return false;
    }
    return @unlink($path);
}
