# Emscripten port for the source engine (only portal tested)

## hosted on [yikes.pw](https://yikes.pw)
discord: https://discord.gg/2kgxEREY6g

## list of broken stuff
+ sound
+ saving/loading (works, TODO: save to browser storage)
+ sometimes render breaks (something related to lightmaps?)
+ fullscreen html button (works through game settings)

## building

use docker, something like this, there might be some missing libs idk:
```sh
docker run --rm -it -v.:/source-engine debian

# activate emsdk
cd /
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

cd /source-engine
./build_emscripten.sh
```
then download packed game data (yikes.pw/portal/chunks/mapName.bsp for each map) and put it to ./build/install/chunks/

i'll upload tool to pack game data later, it's too messy right now