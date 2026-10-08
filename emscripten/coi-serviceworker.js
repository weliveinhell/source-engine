/*
 * Cross-origin isolation via service worker.
 *
 * The engine is built with threads, so it needs SharedArrayBuffer, which a
 * browser only hands to a cross-origin isolated page -- one served with
 * Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy. Some hosts
 * cannot set response headers at all. GitHub Pages is the notable one.
 *
 * A service worker sits between the page and the network, so it can add those
 * headers to responses on the way in. The first visit loads uncontrolled,
 * registers the worker and reloads once; from then on the page is isolated.
 *
 * This is the well-known coi-serviceworker technique (Guido Zuidhof's
 * coi-serviceworker popularised it); this is an independent implementation.
 *
 * Caveats worth knowing before relying on it:
 *   - It costs one extra page load the first time, and after a hard reload.
 *   - Service workers need HTTPS. GitHub Pages is HTTPS, so that is fine.
 *   - Safari Private Browsing disables service workers entirely; there is no
 *     way to make an isolated page there.
 *   - Cross-origin subresources still have to be fetchable. The worker adds
 *     Cross-Origin-Resource-Policy to what it passes through, but the remote
 *     host must still allow the request with CORS.
 *
 * A host that sends the real headers is always more reliable. Use the bundled
 * _headers file (Netlify, Cloudflare Pages) or serve.py where you can.
 */

if (typeof window === 'undefined') {
    // ---------------------------------------------------------------- worker

    self.addEventListener('install', () => self.skipWaiting());

    self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener('message', (event) => {
        if (!event.data) return;
        if (event.data.type === 'deregister') {
            self.registration.unregister()
                .then(() => self.clients.matchAll())
                .then((clients) => clients.forEach((client) => client.navigate(client.url)));
        }
    });

    self.addEventListener('fetch', (event) => {
        const request = event.request;

        // Range requests and cache-only probes must pass through untouched;
        // rewriting them breaks media playback and the navigation preload.
        if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

        event.respondWith(
            fetch(request)
                .then((response) => {
                    // An opaque response has no readable body or headers, so
                    // there is nothing to rewrite. Handing it back unchanged
                    // lets COEP reject it, which is the correct outcome.
                    if (response.status === 0) return response;

                    const headers = new Headers(response.headers);
                    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
                    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
                    // Lets COEP accept subresources the host did not mark up.
                    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: headers
                    });
                })
                .catch((err) => {
                    console.error('[coi] fetch failed:', request.url, err);
                    throw err;
                })
        );
    });
} else {
    // ------------------------------------------------------------------ page

    window.coiServiceWorker = { reloading: false, state: 'idle', reason: '' };

    (function register() {
        const coi = window.coiServiceWorker;

        if (window.crossOriginIsolated) {
            coi.state = 'isolated';
            return;
        }

        if (!window.isSecureContext) {
            coi.state = 'unavailable';
            coi.reason = 'The page is not a secure context. Service workers, and ' +
                'therefore this workaround, need HTTPS or localhost.';
            return;
        }

        if (!('serviceWorker' in navigator)) {
            coi.state = 'unavailable';
            coi.reason = 'This browser has no service worker support. In Safari, ' +
                'check that you are not in a Private Browsing tab.';
            return;
        }

        // Reloading to pick up the worker is only safe if we can remember that
        // we did it. Reading storage can throw outright (Safari in private
        // browsing, third-party cookie blocking), and a reload we cannot record
        // is a reload that repeats forever, so treat "don't know" as "don't".
        const KEY = 'coi-reloaded';

        let alreadyTried;            // true | false | null when storage is unusable
        try {
            alreadyTried = sessionStorage.getItem(KEY) === '1';
        } catch (e) {
            alreadyTried = null;
        }

        if (alreadyTried === null) {
            coi.state = 'unavailable';
            coi.reason = 'sessionStorage is not usable, so the page cannot safely ' +
                'reload itself without risking a reload loop. This usually means a ' +
                'private browsing window.';
            return;
        }

        if (alreadyTried) {
            coi.state = 'failed';
            coi.reason = 'The service worker was registered but the page is still ' +
                'not cross-origin isolated. Some hosts and browser settings block ' +
                'this workaround; serve the page with real COOP/COEP headers instead.';
            return;
        }

        // Records the attempt first and only reloads if that stuck.
        function reloadOnce() {
            try {
                sessionStorage.setItem(KEY, '1');
            } catch (e) {
                coi.state = 'failed';
                coi.reason = 'Could not record the reload attempt, so the page is ' +
                    'not reloading to avoid looping forever.';
                return;
            }
            coi.reloading = true;
            window.location.reload();
        }

        coi.state = 'registering';

        // currentScript is null for deferred, async and module scripts, so fall
        // back to the conventional filename next to the page.
        const scriptUrl = (document.currentScript && document.currentScript.src) ||
                          'coi-serviceworker.js';

        navigator.serviceWorker.register(scriptUrl, {
            scope: './'
        }).then((registration) => {
            registration.addEventListener('updatefound', reloadOnce);

            // Registered and active but not controlling this load: one reload
            // puts the page under the worker, and it comes back isolated.
            if (registration.active && !navigator.serviceWorker.controller) {
                reloadOnce();
            }
        }).catch((err) => {
            coi.state = 'failed';
            coi.reason = 'Could not register the service worker: ' + err;
            console.error('[coi] registration failed:', err);
        });
    })();
}
