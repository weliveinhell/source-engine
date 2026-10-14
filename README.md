# Emscripten port for the source engine (only portal tested)

## hosted on [yikes.pw](https://yikes.pw)

## Sol engineering gauntlet
For substantial engine, WebAssembly, rendering, browser, and iPhone/Safari work, use the project-specific [Source Engine Render360 Sol Gauntlet](.github/SOL_GAUNTLET.md). It defines the Builder → Critic → Repair loop, Portal runtime milestones, CI/build gates, WASM memory/thread checks, map-chunk validation, rendering/lightmap review, audio/save/fullscreen gates, and evidence rules for claiming a fix.

## list of broken stuff
+ sound
+ saving/loading (works, TODO: save to browser storage)
+ sometimes render breaks (something related to lightmaps?)
+ fullscreen html button (works through game settings)

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

emmake ./build_emscripten.sh
```
then download packed game data (yikes.pw/portal/chunks/mapName.data for each map) and put it to ./build/install/chunks/

## packing game data
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
