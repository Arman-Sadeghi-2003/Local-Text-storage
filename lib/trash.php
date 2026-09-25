<?php
/**
 * Trash — Soft deletes and restore.
 *
 * Included by api.php, which defines the constants used here.
 */

defined('TFS_APP') or exit;

/**
 * Trash entries are named "<stamp>__<original>.txt" so the original
 * name survives and two deletes of one file cannot collide.
 */
function trash_id_split(string $id)
{
    $name = basename(trim($id));
    $sep = strpos($name, '__');

    if ($sep === false || $name === '' || $name[0] === '.') {
        return null;
    }
    if (strtolower(substr($name, -4)) !== '.txt') {
        return null;
    }

    $stamp = substr($name, 0, $sep);
    $original = substr($name, $sep + 2);

    if (!stamp_is_valid($stamp) || $original === '' || $original[0] === '.') {
        return null;
    }
    return ['id' => $name, 'stamp' => $stamp, 'original' => $original];
}

function trash_path(string $id)
{
    $parts = trash_id_split($id);
    return $parts === null ? null : TRASH_DIR . '/' . $parts['id'];
}

function trash_init(): bool
{
    if (is_dir(TRASH_DIR)) {
        return true;
    }
    return @mkdir(TRASH_DIR, 0755, true) || is_dir(TRASH_DIR);
}

/** Moves a stored file into the trash. Returns the new trash id, or null. */
function trash_move(string $filename)
{
    $source = store_path($filename);
    if ($source === null || !is_file($source) || !trash_init()) {
        return null;
    }

    $id = stamp_new() . '__' . basename($source);
    if (!@rename($source, TRASH_DIR . '/' . $id)) {
        return null;
    }

    trash_purge();
    return $id;
}

/**
 * Moves an entry back into storage. When the original name is taken,
 * the restored copy is suffixed rather than overwriting the live file.
 */
function trash_restore(string $id)
{
    $parts = trash_id_split($id);
    $source = trash_path($id);

    if ($parts === null || $source === null || !is_file($source) || !store_init()) {
        return null;
    }

    $target = $parts['original'];
    if (store_exists($target)) {
        $base = substr($target, 0, -4);
        $n = 2;
        do {
            $target = $base . '-restored-' . $n . '.txt';
            $n++;
        } while (store_exists($target) && $n < 100);
    }

    $destination = store_path($target);
    if ($destination === null || !@rename($source, $destination)) {
        return null;
    }
    return $target;
}

/** Removes one entry for good, along with the revisions of that name. */
function trash_destroy(string $id): bool
{
    $parts = trash_id_split($id);
    $path = trash_path($id);

    if ($parts === null || $path === null || !is_file($path)) {
        return false;
    }

    $removed = @unlink($path);
    if ($removed && !store_exists($parts['original'])) {
        versions_destroy($parts['original']);
        index_forget($parts['original']);
    }
    return $removed;
}

function trash_list(): array
{
    if (!is_dir(TRASH_DIR)) {
        return [];
    }

    $entries = @scandir(TRASH_DIR);
    if ($entries === false) {
        return [];
    }

    $out = [];
    foreach ($entries as $entry) {
        $parts = trash_id_split($entry);
        if ($parts === null || !is_file(TRASH_DIR . '/' . $entry)) {
            continue;
        }
        $out[] = [
            'id'      => $parts['id'],
            'name'    => $parts['original'],
            // index_entry(), not index_reconcile() — reconcile calls us
            'title'   => index_entry($parts['original'])['title'],
            'deleted' => stamp_time($parts['stamp']),
            'size'    => (int) @filesize(TRASH_DIR . '/' . $entry),
        ];
    }

    usort($out, function ($a, $b) {
        return $b['deleted'] - $a['deleted'];    // newest first
    });
    return $out;
}

function trash_purge()
{
    $cutoff = time() - TRASH_TTL_SECONDS;
    foreach (trash_list() as $entry) {
        if ($entry['deleted'] > 0 && $entry['deleted'] < $cutoff) {
            trash_destroy($entry['id']);
        }
    }
}
