<?php
/**
 * Search — Content and metadata search.
 *
 * Included by api.php, which defines the constants used here.
 */

defined('TFS_APP') or exit;

/**
 * Finds a needle in one file's content.
 *
 * Returns null when absent, otherwise a snippet with a little context on
 * either side and the total number of occurrences. The /u flag keeps the
 * cut on character boundaries; files that are not valid UTF-8 fall back
 * to a byte-wise match so they are still findable.
 */
function search_in_content(string $content, string $needle)
{
    $quoted = preg_quote($needle, '/');
    $context = '/(.{0,40})(' . $quoted . ')(.{0,90})/isu';

    if (@preg_match($context, $content, $m) !== 1) {
        $context = '/(.{0,40})(' . $quoted . ')(.{0,90})/is';
        if (preg_match($context, $content, $m) !== 1) {
            return null;
        }
    }

    // Collapse runs of whitespace so a snippet stays on one line
    $snippet = preg_replace('/\s+/', ' ', $m[1] . $m[2] . $m[3]);

    $count = @preg_match_all('/' . $quoted . '/iu', $content);
    if ($count === false) {
        $count = preg_match_all('/' . $quoted . '/i', $content);
    }

    return [
        'snippet' => trim((string) $snippet),
        'matches' => (int) $count,
    ];
}

function search_files(string $needle): array
{
    $results = [];

    foreach (store_list_meta() as $entry) {
        $content = store_read($entry['name']);
        if ($content === null) {
            continue;
        }

        $hit = search_in_content($content, $needle);

        $inMeta = stripos($entry['name'], $needle) !== false
            || stripos($entry['title'], $needle) !== false
            || stripos(implode(' ', $entry['tags']), $needle) !== false;

        if ($hit === null && !$inMeta) {
            continue;
        }

        $results[] = array_merge($entry, [
            'snippet' => $hit === null ? '' : $hit['snippet'],
            'matches' => $hit === null ? 0 : $hit['matches'],
        ]);
    }

    // Filename hits first, then by how often the term appears
    usort($results, function ($a, $b) {
        if (($a['matches'] === 0) !== ($b['matches'] === 0)) {
            return $a['matches'] === 0 ? -1 : 1;
        }
        return $b['matches'] - $a['matches'];
    });

    return $results;
}
