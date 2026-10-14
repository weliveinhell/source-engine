/* Render360 Portal staging service worker.
 *
 * GitHub Pages cannot set COOP/COEP response headers itself. This worker
 * injects them after the first controlled reload so the upstream pthread /
 * SharedArrayBuffer runtime can be exercised on static hosting.
 *
 * Portal's Source runtime still requests the original same-origin
 * `chunks/<map>.data` path. Keep the original web port's packed data as the
 * authoritative first choice. A locally generated VPK chunk is the fallback.
 *
 * Phase 2 keeps the first-frame boot overlay under a strict memory budget and
 * stores later shader families as map-scoped delta packs. When Source requests
 * chunks/<map>.data this worker appends that map's shader records as a
 * backpressure-aware stream. The browser never needs to materialize the whole
 * map chunk merely to attach a small shader pack.
 *
 * No retail game data is committed to GitHub Pages.
 */

const LOCAL_CHUNK_CACHE = 'render360-portal-local-chunks-v2';
const OLD_LOCAL_CHUNK_CACHE = 'render360-portal-local-chunks-v1';
const BOOT_OVERLAY_CACHE = 'render360-portal-boot-overlay-v3';
const OLD_BOOT_OVERLAY_CACHES = [
  'render360-portal-boot-overlay-v2',
  'render360-portal-boot-overlay-v1'
];
const MAP_SHADER_CACHE = 'render360-portal-map-shaders-v1';
const BOOT_OVERLAY_PATH = './render360-bootstrap-overlay.data';
const UPSTREAM_CHUNK_BASE = 'https://yikes.pw/portal/chunks/';
const UPSTREAM_TIMEOUT_MS = 8000;
const UPSTREAM_RETRY_COOLDOWN_MS = 60000;
const MUTABLE_RUNTIME_RE = /\.(?:html?|js|mjs|wasm|so|json|data)$/i;

const REBUILD_LOCAL_CHUNKS_ON_ACTIVATE = false;
let upstreamUnavailableUntil = 0;

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all([
      caches.delete(OLD_LOCAL_CHUNK_CACHE),
      ...OLD_BOOT_OVERLAY_CACHES.map(name => caches.delete(name))
    ]);
    if (REBUILD_LOCAL_CHUNKS_ON_ACTIVATE) {
      await caches.delete(LOCAL_CHUNK_CACHE);
      console.info('[Render360 Pages SW] cleared local Portal chunks for clean runtime rebuild');
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'RENDER360_CLEAR_LOCAL_CHUNKS') {
    event.waitUntil(Promise.all([
      caches.delete(LOCAL_CHUNK_CACHE),
      caches.delete(OLD_LOCAL_CHUNK_CACHE)
    ]));
  }
  if (event.data.type === 'RENDER360_CLEAR_BOOT_OVERLAY') {
    event.waitUntil(Promise.all([
      caches.delete(BOOT_OVERLAY_CACHE),
      caches.delete(MAP_SHADER_CACHE),
      ...OLD_BOOT_OVERLAY_CACHES.map(name => caches.delete(name))
    ]));
  }
});

function isolationHeaders(headers, extraHeaders = {}) {
  const out = new Headers(headers);
  out.set('Cross-Origin-Opener-Policy', 'same-origin');
  out.set('Cross-Origin-Embedder-Policy', 'require-corp');
  out.set('Cross-Origin-Resource-Policy', 'same-origin');
  for (const [key, value] of Object.entries(extraHeaders)) out.set(key, value);
  return out;
}

function withIsolationHeaders(response, extraHeaders = {}) {
  if (!response || response.status === 0) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: isolationHeaders(response.headers, extraHeaders)
  });
}

async function fetchUpstreamChunk(upstreamUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('upstream chunk timeout'), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(upstreamUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function concatenateResponseBodies(responses) {
  const bodies = responses.map(response => response?.body).filter(Boolean);
  let bodyIndex = 0;
  let reader = null;

  return new ReadableStream({
    async pull(controller) {
      while (bodyIndex < bodies.length) {
        if (!reader) reader = bodies[bodyIndex].getReader();
        const next = await reader.read();
        if (next.done) {
          try { reader.releaseLock(); } catch (_) {}
          reader = null;
          bodyIndex++;
          continue;
        }
        controller.enqueue(next.value);
        return;
      }
      controller.close();
    },
    async cancel(reason) {
      if (reader) {
        try { await reader.cancel(reason); } catch (_) {}
      }
      for (let i = bodyIndex + (reader ? 1 : 0); i < bodies.length; i++) {
        try { await bodies[i].cancel(reason); } catch (_) {}
      }
    }
  });
}

async function appendMapShaderPack(baseResponse, chunkName, source) {
  if (!baseResponse || !baseResponse.ok) return baseResponse;
  const cache = await caches.open(MAP_SHADER_CACHE);
  const packUrl = new URL(`./shader-packs/${chunkName}`, self.location.href).href;
  const pack = await cache.match(packUrl, { ignoreSearch: true });

  const headers = isolationHeaders(baseResponse.headers, {
    'Cache-Control': 'no-store, max-age=0',
    'X-Render360-Chunk-Source': source
  });
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.delete('ETag');

  if (!pack || !pack.ok || !pack.body) {
    return new Response(baseResponse.body, {
      status: baseResponse.status,
      statusText: baseResponse.statusText,
      headers
    });
  }

  headers.set('X-Render360-Map-Shader-Pack', 'map-v1');
  headers.set('X-Render360-Shader-Records', pack.headers.get('X-Render360-Shader-Records') || '0');
  headers.set('X-Render360-Shader-Bytes', pack.headers.get('X-Render360-Shader-Bytes') || '0');
  const families = pack.headers.get('X-Render360-Shader-Families');
  if (families) headers.set('X-Render360-Shader-Families', families);

  return new Response(concatenateResponseBodies([baseResponse, pack]), {
    status: baseResponse.status,
    statusText: baseResponse.statusText,
    headers
  });
}

async function servePortalChunk(request, url) {
  const name = url.pathname.split('/').pop();
  const cache = await caches.open(LOCAL_CHUNK_CACHE);
  const upstreamUrl = UPSTREAM_CHUNK_BASE + encodeURIComponent(name);

  if (Date.now() >= upstreamUnavailableUntil) {
    try {
      const upstream = await fetchUpstreamChunk(upstreamUrl);
      if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
      upstreamUnavailableUntil = 0;
      return appendMapShaderPack(upstream, name, 'upstream-yikes');
    } catch (error) {
      upstreamUnavailableUntil = Date.now() + UPSTREAM_RETRY_COOLDOWN_MS;
      console.warn('[Render360 Pages SW] original Portal chunk unavailable; trying local VPK fallback', upstreamUrl, error);
    }
  }

  const local = await cache.match(request, { ignoreSearch: true });
  if (local && local.ok) {
    return appendMapShaderPack(local, name, 'local-vpk');
  }

  return withIsolationHeaders(new Response(
    'Portal chunk unavailable from the original Source web-port host and the local VPK cache.',
    { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  ), {
    'X-Render360-Chunk-Source': 'unavailable'
  });
}

async function serveBootOverlay() {
  const cache = await caches.open(BOOT_OVERLAY_CACHE);
  const overlayUrl = new URL(BOOT_OVERLAY_PATH, self.location.href).href;
  const overlay = await cache.match(overlayUrl, { ignoreSearch: true });
  if (!overlay || !overlay.ok) {
    return withIsolationHeaders(new Response('Render360 Phase 2 first-frame boot/shader overlay not prepared', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    }), {
      'Cache-Control': 'no-store, max-age=0',
      'X-Render360-Chunk-Source': 'local-boot-missing'
    });
  }

  return withIsolationHeaders(overlay, {
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store, max-age=0',
    'X-Render360-Chunk-Source': 'local-boot-overlay-manifest'
  });
}

async function fetchRuntimeFresh(request) {
  const freshRequest = new Request(request, { cache: 'no-store' });
  const response = await fetch(freshRequest);
  return withIsolationHeaders(response, {
    'Cache-Control': 'no-store, max-age=0',
    'X-Render360-Runtime-Fresh': '1'
  });
}

async function fetchLauncherDataDirect(request) {
  return fetch(new Request(request, {
    cache: 'no-store',
    credentials: 'same-origin'
  }));
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith((async () => {
    if (request.method === 'GET' && url.pathname.endsWith('/render360-bootstrap-overlay.data')) {
      return serveBootOverlay();
    }
    if (request.method === 'GET' && /\/chunks\/[^/]+\.data$/i.test(url.pathname)) {
      return servePortalChunk(request, url);
    }
    if (request.method === 'GET' && url.pathname.endsWith('/hl2_launcher.data')) {
      return fetchLauncherDataDirect(request);
    }
    if (request.method === 'GET' && MUTABLE_RUNTIME_RE.test(url.pathname)) {
      return fetchRuntimeFresh(request);
    }
    return withIsolationHeaders(await fetch(request));
  })().catch(error => {
    console.error('[Render360 Pages SW] fetch failed', request.url, error);
    return new Response('Render360 staging fetch failed: ' + String(error), {
      status: 502,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  }));
});