/**
 * Service worker — offline app shell.
 *
 * Only the static shell is cached. Requests to api.php are never touched:
 * caching them would serve stale files, hide auth failures behind a stale
 * 200, and risk leaking one session's data into another's cache.
 *
 * Bump CACHE_VERSION whenever the shell changes, or clients will keep
 * serving the old bundle from cache.
 */

const CACHE_VERSION = 'tfs-v5';

const SHELL = [
    './',
    './index.html',
    './manifest.webmanifest',
    './assets/icon.svg',

    './assets/css/tokens.css',
    './assets/css/layout.css',
    './assets/css/panel.css',
    './assets/css/markdown.css',
    './assets/css/overlays.css',
    './assets/css/components.css',
    './assets/css/auth.css',
    './assets/css/responsive.css',
    './assets/css/print.css',

    './assets/vendor/marked.min.js',

    './assets/js/core.js',
    './assets/js/stores.js',
    './assets/js/boot.js',
    './assets/js/auth.js',
    './assets/js/ui.js',
    './assets/js/list.js',
    './assets/js/viewer.js',
    './assets/js/editor.js',
    './assets/js/drafts.js',
    './assets/js/actions.js',
    './assets/js/transfer.js',
    './assets/js/markdown.js',
    './assets/js/app.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') {
        return;
    }

    const url = new URL(request.url);

    // Same-origin only, and never the API
    if (url.origin !== self.location.origin || url.pathname.endsWith('/api.php')) {
        return;
    }

    /*
     * Cache-first for the shell: it is small, versioned, and this is what
     * makes the app open offline. A background revalidate keeps the cache
     * fresh without blocking the response.
     */
    event.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request).then((response) => {
                if (response && response.ok && response.type === 'basic') {
                    const copy = response.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
                }
                return response;
            }).catch(() => cached);

            return cached || network;
        })
    );
});
