# Hosting the web build

## The one hard requirement: cross-origin isolation

The engine is linked with pthreads (`-sUSE_PTHREADS -sSHARED_MEMORY=1
-sPROXY_TO_PTHREAD`). Threads need `SharedArrayBuffer`, and browsers only hand
one out to a **cross-origin isolated** document. Two response headers make a
page isolated:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Serve the build without them and it never starts, on any browser. The shell now
detects this and says so on screen instead of leaving a black page.

Isolation also requires a **secure context**: `https://` or `http://localhost`.
A plain `http://192.168.1.x` address is not secure, so opening the dev server's
LAN address directly on a phone will never work no matter what headers you send.

### Local

```sh
python3 emscripten/serve.py --dir build/install
# http://localhost:8080/hl2_launcher.html
```

### Testing on a real iPhone

The phone needs HTTPS, so tunnel the local server:

```sh
python3 emscripten/serve.py --dir build/install &
cloudflared tunnel --url http://localhost:8080
# or: ssh -R 80:localhost:8080 nokey@localhost.run
```

Open the resulting `https://` URL on the phone.

### Netlify / Cloudflare Pages

Copy `emscripten/_headers` to the site root. `build.sh` already copies it into
`build/install/`.

### nginx

```nginx
location / {
    add_header Cross-Origin-Opener-Policy   same-origin   always;
    add_header Cross-Origin-Embedder-Policy require-corp  always;
    types { application/wasm wasm; }
}
```

### Apache

```apache
Header always set Cross-Origin-Opener-Policy   "same-origin"
Header always set Cross-Origin-Embedder-Policy "require-corp"
AddType application/wasm .wasm
```

### GitHub Pages

GitHub Pages cannot set response headers, so it cannot make a page cross-origin
isolated the normal way. The bundle works around it with
`coi-serviceworker.js`: a service worker adds the headers to responses on their
way in, so the page ends up isolated anyway. `shell.html` loads it from `<head>`
and it is copied into the bundle automatically.

Setup:

1. **Settings > Pages > Build and deployment > Source: GitHub Actions.**
2. Run **Actions > Deploy to GitHub Pages > Run workflow** (it also runs on
   every push to `master`). You can run it from any branch.
3. Open the published URL. The first visit registers the worker and reloads
   once by itself; after that it starts normally.

What to expect:

- One extra page load on the first visit, and again after a hard reload.
- It needs HTTPS, which GitHub Pages provides.
- **Safari Private Browsing disables service workers**, so an isolated page is
  impossible there. The page says so rather than failing silently.
- A host that sends real headers is still more reliable. Netlify and Cloudflare
  Pages are both free and read the bundled `_headers` file.

#### Game data does not fit on GitHub Pages

This is the part that usually bites. GitHub refuses any file over 100MB, and
Pages will not publish a site larger than **1GB**. Git LFS does not help --
Pages serves the LFS pointer file, not the object. The full set of Portal
chunks is normally well past that.

So host the engine on Pages and the chunks somewhere else, and point the page at
them:

```
https://<user>.github.io/<repo>/?chunks=https://your-host.example/portal/chunks
```

or edit `index.html` to set `window.CHUNK_BASE_URL` before the engine loads.
Anywhere works -- a GitHub Release (assets can be up to 2GB each), Cloudflare R2,
Backblaze B2, any static host. Two requirements for a cross-origin chunk host:

- it must send `Access-Control-Allow-Origin` (CORS), or the browser blocks the
  request outright;
- it should send `Cross-Origin-Resource-Policy: cross-origin`. The service
  worker adds this for you on Pages, but a host with real COEP headers needs it
  set properly.

If your chunks *do* fit under 1GB, set a `CHUNKS_BASE_URL` repository variable
(Settings > Secrets and variables > Actions > Variables) and the deploy workflow
downloads them into the site for you. The workflow fails the build with a clear
message if the result exceeds the 1GB limit, rather than letting the deploy fail
mysteriously.

## Playing on iPhone / iPad

Requirements:

- **iOS 17 or newer.** The build renders from a worker through
  `OffscreenCanvas`, which Safari gained in 16.4, and relies on WebGL 2 and
  growable `SharedArrayBuffer`. iOS 17 is the first release where all of it is
  reliable.
- **Lockdown Mode off** (Settings > Privacy & Security). It disables the JIT and
  most of WebAssembly.
- **Landscape.** The touch layout puts the move zone on the left half and the
  look zone on the right half of the screen.

Controls come from the engine's built-in touch layer, which `pre.js` turns on
automatically when it sees a touch device:

| Action | Input |
| --- | --- |
| Move | drag on the left half of the screen |
| Look | drag on the right half |
| Fire portal / alt portal | the two on-screen buttons on the right |
| Jump, crouch, use | on-screen buttons on the right edge |
| Menu | on-screen button, top left |

The layout is editable in-game via the `edit` button, or with the `touch_*`
console variables (`touch_yaw`, `touch_pitch`, `touch_forwardzone`,
`touch_sidezone`, `touch_addbutton`, ...).

### Button icons

The move and look zones are invisible by design, and they work with no assets at
all. The labelled buttons want `materials/vgui/touch/*.vtf`, which ships with the
Android build of source-engine rather than with desktop Portal. Drop those files
into `<gamedata>/portal/materials/vgui/touch/` (or `hl2/`) before running
`repackage.js` and they are packed into the base chunk. Without them the buttons
are still there and still work, they just draw with the missing-material texture.
The textures must be square and power-of-two.

### Fullscreen on iPhone

iPhone Safari does not implement `Element.requestFullscreen`, so no web page can
go fullscreen in the browser. To get a chrome-free game, use **Share > Add to
Home Screen** and launch it from the Home Screen icon; the shell ships the
`apple-mobile-web-app-capable` meta tag that makes that a standalone app window.
iPad Safari does support fullscreen, and the Fullscreen button works there.

### Memory

Memory is the tightest constraint on a phone. The build starts at 512 MB and
grows (`EM_INITIAL_MEMORY` / `EM_MAXIMUM_MEMORY` in `build.sh`), and `pre.js`
passes `+mat_picmip 2` plus a resolution capped to a 1280x720 pixel budget on
touch devices. If the game still aborts partway through a chapter, lower
`EM_MAXIMUM_MEMORY` and raise `mat_picmip`, and close other Safari tabs --
iOS kills the tab well before a desktop browser would.
