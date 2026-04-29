const CACHE_NAME = 'pwa-cache-v3';
const IMAGE_CACHE = 'image-cache-v3';
//const OFFLINE_URL = '/offline.html';

// Files to precache (core app shell)
const CORE_ASSETS = [
    '/',
    '/static/css/styles.css',
    //'/static/js/app.js',
    //'/static/js/conversation/conversation.js',
    "/static/icons/icon-192x192.png"
    //OFFLINE_URL
];

// Cache core assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
    );
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
});

// Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME && key !== IMAGE_CACHE)
                    .map((key) => caches.delete(key))
            )
        )
    );
    // Take control of all existing tabs immediately 
    self.clients.claim();
});

// Fetch: network-first for HTML/JS, cache-first for images, fallback for others
self.addEventListener('fetch', (event) => {
    const { request } = event;

    //see if programatically fetching HTML through endpoint, with Accept': 'text/html added to fetch call header
    const fetchingHTML =
        request.headers.get('accept')?.includes('text/html');

    // Cache-first strategy for images
    if (request.destination === 'image') {
        event.respondWith(
            caches.open(IMAGE_CACHE).then(async (cache) => {
                const cachedResponse = await cache.match(request);
                if (cachedResponse) return cachedResponse;

                try {
                    const response = await fetch(request);
                    if (response.ok) {
                        cache.put(request, response.clone());
                    }
                    return response;
                } catch (err) {
                    return new Response(null, { status: 404 });
                }
            })
        );
        return;
    }

    // Network-first strategy for HTML, JS, and CSS
    if (
        request.destination === 'document' ||
        request.destination === 'script' ||
        request.destination === 'style' ||
        fetchingHTML
    ) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        if (response.ok) {
                            cache.put(request, response.clone());
                        }
                        return response;
                    });
                })
                .catch(async () => {
                    const cache = await caches.open(CACHE_NAME);
                    return cache.match(request) || cache.match(OFFLINE_URL);
                })
        );
        return;
    }

    // Default strategy: try network, fallback to cache or offline page
    event.respondWith(
        fetch(request).catch(async () => {
            const cache = await caches.open(CACHE_NAME);
            return cache.match(request) || cache.match(OFFLINE_URL);
        })
    );
});