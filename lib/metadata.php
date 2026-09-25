<?php
/**
 * Metadata — Display titles, tags, and the slug index.
 *
 * Included by api.php, which defines the constants used here.
 */

defined('TFS_APP') or exit;

/** Fallback title for a file that predates the index. */
function title_default(string $slug): string
{
    return substr($slug, -4) === '.txt' ? substr($slug, 0, -4) : $slug;
}

function tags_normalize($raw): array
{
    if (is_string($raw)) {
        $raw = explode(',', $raw);
    }
    if (!is_array($raw)) {
        return [];
    }

    $tags = [];
    foreach ($raw as $tag) {
        $tag = trim(strtolower((string) $tag));
        $tag = preg_replace('/\s+/', ' ', $tag);

        if ($tag === '' || in_array($tag, $tags, true)) {
            continue;
        }
        $tags[] = substr($tag, 0, MAX_TAG_LENGTH);

        if (count($tags) >= MAX_TAGS) {
            break;
        }
    }
    return $tags;
}

function index_load(): array
{
    if (!is_file(INDEX_FILE)) {
        return [];
    }
    $data = json_decode((string) @file_get_contents(INDEX_FILE), true);
    return is_array($data) ? $data : [];
}

function index_write(array $index): bool
{
    if (!store_init()) {
        return false;
    }
    $json = json_encode($index, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return @file_put_contents(INDEX_FILE, $json, LOCK_EX) !== false;
}

/**
 * Brings the index back in line with the filesystem: files added by hand
 * gain an entry, and entries whose file is neither live nor in the trash
 * are dropped. Without this, dropping a .txt into datasets/ would leave it
 * invisible to anything that reads titles.
 */
function index_reconcile(): array
{
    $index = index_load();
    $before = $index;

    $live = store_list();
    foreach ($live as $slug) {
        if (!isset($index[$slug]) || !is_array($index[$slug])) {
            $index[$slug] = ['title' => title_default($slug), 'tags' => []];
        }
    }

    // Trashed files keep their entry so a restore keeps its title
    $trashed = [];
    foreach (trash_list() as $entry) {
        $trashed[$entry['name']] = true;
    }

    foreach (array_keys($index) as $slug) {
        if (!in_array($slug, $live, true) && !isset($trashed[$slug])) {
            unset($index[$slug]);
        }
    }

    if ($index !== $before) {
        index_write($index);
    }
    return $index;
}

/** Metadata for one slug, with defaults filled in. */
function index_entry(string $slug): array
{
    $entry = index_load()[$slug] ?? [];
    return [
        'title' => isset($entry['title']) && $entry['title'] !== ''
            ? (string) $entry['title']
            : title_default($slug),
        'tags'  => tags_normalize($entry['tags'] ?? []),
    ];
}

/** Writes title and/or tags for a slug; null leaves a field untouched. */
function index_update(string $slug, $title = null, $tags = null)
{
    $index = index_load();
    $entry = $index[$slug] ?? ['title' => title_default($slug), 'tags' => []];

    if ($title !== null && trim((string) $title) !== '') {
        $entry['title'] = substr(trim((string) $title), 0, MAX_TITLE_LENGTH);
    }
    if ($tags !== null) {
        $entry['tags'] = tags_normalize($tags);
    }

    $index[$slug] = $entry;
    index_write($index);
}

function index_forget(string $slug)
{
    $index = index_load();
    if (isset($index[$slug])) {
        unset($index[$slug]);
        index_write($index);
    }
}

/**
 * Derives a filesystem-safe slug from a display title, suffixing until it
 * is free. Two different titles can reduce to the same slug, so this is
 * what stops them landing on the same file.
 */
function slug_from_title(string $title): string
{
    $base = preg_replace('/[^a-zA-Z0-9_-]/', '_', $title);
    $base = trim((string) preg_replace('/_{2,}/', '_', $base), '_-');

    if ($base === '') {
        $base = 'file';
    }
    $base = substr($base, 0, 60);

    $slug = $base . '.txt';
    $n = 2;
    while (store_exists($slug) && $n < 1000) {
        $slug = $base . '-' . $n . '.txt';
        $n++;
    }
    return $slug;
}
