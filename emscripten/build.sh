#!/bin/sh

buildtype=release
if [ "$1" = "debug" ] || [ "$1" = "release" ]; then
	buildtype=$1
	shift
fi

export CC=emcc
export CXX=em++

# Memory layout.
#
# Mobile browsers (iOS Safari in particular) refuse a single huge upfront
# WebAssembly.Memory reservation: asking for 2047mb aborts before main() with
# "Out of memory" / "Aborted()". Start small and grow instead -- the ceiling
# stays the same, but startup now succeeds on phones. Override either value
# from the environment if you are targeting only desktop.
INITIAL_MEMORY=${EM_INITIAL_MEMORY:-512mb}
MAXIMUM_MEMORY=${EM_MAXIMUM_MEMORY:-2047mb}

# Worker pool. A fixed pool of 8 is more than an iPhone has cores for, and
# PTHREAD_POOL_SIZE_STRICT=2 turns "pool exhausted" into a hard abort. Size the
# pool to the device and downgrade strictness to a warning so a phone with 4
# cores spawns the extra threads on demand instead of dying.
PTHREAD_POOL_SIZE=${EM_PTHREAD_POOL_SIZE:-'Math.min(navigator.hardwareConcurrency || 4, 8)'}

set -ex

#rm -rf build/install
python3 waf configure -T $buildtype --notests -4 --togles --emscripten \
	--disable-warns --build-games=portal --prefix=build/install
python3 waf install $@
find build/ -name '*.map' -exec cp {} build/install/ \;

#link_libs="-sERROR_ON_UNDEFINED_SYMBOLS=0"
for lib in build/install/*.so; do
	libname=$(echo $lib | sed -E 's/^.+\/lib(.+)\.so/\1/g')
	link_libs="$link_libs -l$libname"
done

emcc \
	-sUSE_BZIP2=1 -sUSE_SDL=2 -sUSE_FREETYPE=1 -sUSE_LIBJPEG=1 -sUSE_LIBPNG -sMALLOC=mimalloc \
	-sMAIN_MODULE \
	-sINITIAL_MEMORY=$INITIAL_MEMORY -sMAXIMUM_MEMORY=$MAXIMUM_MEMORY -sALLOW_MEMORY_GROWTH=1 \
	-sSHARED_MEMORY=1 -sUSE_PTHREADS -sPTHREAD_POOL_SIZE="$PTHREAD_POOL_SIZE" -sPTHREAD_POOL_SIZE_STRICT=1 \
	-sFULL_ES3 -sSTACK_SIZE=4mb --shell-file=emscripten/shell.html \
	-sENVIRONMENT=web,worker \
	-sPROXY_TO_PTHREAD -sOFFSCREENCANVASES_TO_PTHREAD="#canvas" -sOFFSCREENCANVAS_SUPPORT=1 \
	--pre-js emscripten/pre.js --post-js emscripten/post.js \
	-L build/install/ \
	build/launcher_main/libhl2_launcher.a \
	$link_libs \
	-o build/launcher_main/hl2_launcher.html

cp build/launcher_main/hl2_launcher.* build/install/
cp -r emscripten/assets build/install/

# Ship the pieces needed to actually run the bundle, so the CI artifact is
# self-contained: a dev server that sends the cross-origin isolation headers,
# the same headers for static hosts, and the game-data fetcher.
cp emscripten/serve.py build/install/
cp emscripten/_headers build/install/
cp emscripten/fetch_chunks.py build/install/
cp emscripten/pre.js build/install/   # fetch_chunks.py reads the map list from it

# Required on hosts that cannot send COOP/COEP themselves, GitHub Pages above
# all. shell.html loads it from <head>; without it there is no SharedArrayBuffer
# and the engine never starts.
cp emscripten/coi-serviceworker.js build/install/

# Stops GitHub Pages running the output through Jekyll, which would drop files
# and directories whose names begin with an underscore.
touch build/install/.nojekyll

# The entry point is hl2_launcher.html; give the directory root an index so
# opening the bundle just works.
cat > build/install/index.html <<'HTML'
<!DOCTYPE html>
<meta charset="utf-8">
<title>yikes!</title>
<meta http-equiv="refresh" content="0; url=hl2_launcher.html">
<link rel="canonical" href="hl2_launcher.html">
<body style="background:#000;color:#eee;font-family:system-ui;text-align:center;padding-top:20vh">
<p><a href="hl2_launcher.html" style="color:#7ad">Loading...</a></p>
HTML
