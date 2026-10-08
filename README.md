# Emscripten port for the source engine (only portal tested)

## hosted on [yikes.pw](https://yikes.pw)

## list of broken stuff
+ sound
+ saving/loading (works, TODO: save to browser storage)
+ sometimes render breaks (something related to lightmaps?)
+ fullscreen html button (works through game settings; iPhone Safari has no
  fullscreen API at all -- use Add to Home Screen)

## running it

Pushing to GitHub is enough to **build** it -- the `Build` workflow compiles the
wasm bundle and uploads `release.zip` -- but a build on its own is not a playable
game. Three things have to come together:

**1. Get the engine.** Open the repo's Actions tab, pick the latest green `Build`
run, and download the `release.zip` artifact. Unzip it.

**2. Add the game data.** The zip contains the engine and *no* Portal content.
The engine fetches `chunks/<map>.data` at runtime; without those files the page
stops with "Could not load game data". You need to own Portal.

```sh
cd <unzipped release.zip>
python3 fetch_chunks.py --dir .
```

Or build the chunks from your own Portal install with `emscripten/repackage.js`
(see [packing game data](#packing-game-data)).

**3. Serve it cross-origin isolated, over HTTPS or localhost.** This is not
optional: the engine uses threads, threads need `SharedArrayBuffer`, and browsers
only hand one out to a page sending `Cross-Origin-Opener-Policy` and
`Cross-Origin-Embedder-Policy`. Opening `hl2_launcher.html` as a `file://` URL
will never work.

```sh
python3 serve.py --dir .
# http://localhost:8080/
```

### GitHub Pages

Pages cannot send those headers, so the bundle ships `coi-serviceworker.js`,
which installs them from a service worker instead. Set **Settings > Pages >
Source** to **GitHub Actions**, then run **Actions > Deploy to GitHub Pages**.
The first visit reloads itself once to pick the worker up.

The catch is size, not headers: GitHub blocks files over 100MB and will not
publish a Pages site over 1GB, so the game data usually has to live elsewhere.
Host the chunks anywhere (a GitHub Release, R2, any static host) and point at
them:

```
https://<user>.github.io/<repo>/?chunks=https://your-host.example/portal/chunks
```

Then open it, tap/click **Tap to play**, and use the main menu to start a new
game. If something is missing, the page now says what on screen rather than
showing a black screen.

To play on an actual iPhone you need an HTTPS address, so put the server behind
a tunnel (`cloudflared tunnel --url http://localhost:8080`) or deploy to a host
that respects the bundled `_headers` file, such as Netlify or Cloudflare Pages.
Full details in [emscripten/README-hosting.md](emscripten/README-hosting.md).

## phones (iPhone / iPad / Android)

Touch controls are turned on automatically on touch devices: drag the left half
of the screen to move, the right half to look, and use the on-screen buttons for
jump / crouch / use / both portals. Play in landscape.

iPhone needs iOS 17+ with Lockdown Mode off. See
[emscripten/README-hosting.md](emscripten/README-hosting.md) for the full
requirements, HTTPS tunnelling for on-device testing, fullscreen on iPhone, and
the memory knobs.

## building

use docker, something like this, there might be some missing libs idk:
```sh
docker run --rm -it -v.:/source-engine debian

apt update
apt install git curl wget python3 xz-utils llvm binutils -y

# activate emsdk
cd /
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
git checkout 2d480a1b7c7a34a354188d93f3e89190a44a1d21
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

cd /source-engine

# patch and rebuild sdl2
embuilder --pic build sdl2 sdl2-mt
sed -Ei 's/freq = EM_ASM_INT/freq = MAIN_THREAD_EM_ASM_INT/' /emsdk/upstream/emscripten/cache/ports/sdl2/SDL-release-2.32.0/src/audio/emscripten/SDL_emscriptenaudio.c
embuilder --force --pic build sdl2 sdl2-mt

# patch glMapBufferRange to allow some "unsupported" parameters
patch /emsdk/upstream/emscripten/src/lib/libwebgl.js emscripten/libwebgl.patch

emmake ./emscripten/build.sh
```
then download packed game data (yikes.pw/portal/chunks/mapName.data for each map) and put it to ./build/install/chunks/

`build.sh` reads `EM_INITIAL_MEMORY`, `EM_MAXIMUM_MEMORY` and
`EM_PTHREAD_POOL_SIZE` from the environment if you want to tune it for a
specific target.

## packing game data
<a id="packing-game-data"></a>
first of all, you'll need to build engine from https://github.com/nillerusr/source-engine for your native arch

and after that you should add that printf to ./filesystem/basefilesystem.cpp, to dump all files that engine would access (textures/models that map needs)

```cpp
FileHandle_t CBaseFileSystem::OpenForRead( const char *pFileNameT, const char *pOptions, unsigned flags, const char *pathID, char **ppszResolvedFilename )
{
	printf("OpenForRead %s %s\n", pFileNameT, pathID);
	VPROF( "CBaseFileSystem::OpenForRead" );
```

and lauch it via emscripten/get_logs.sh script, make sure to edit map list

after that, use emscripten/repackage.js script to make .data chunks

edit `knownMaps` and `baseGamePath` variables, make sure to unpack all .vpks
