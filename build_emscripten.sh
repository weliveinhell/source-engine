#!/bin/sh

buildtype=release
if [ "$1" = "debug" ] || [ "$1" = "release" ]; then
	buildtype=$1
	shift
fi

export CC=emcc
export CXX=em++

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
	-sMAIN_MODULE -sINITIAL_MEMORY=2047mb -sSHARED_MEMORY=1 -sUSE_PTHREADS -sPTHREAD_POOL_SIZE=8 -sPTHREAD_POOL_SIZE_STRICT=2 \
	-sFULL_ES3 -sSTACK_SIZE=4mb --shell-file=emscripten/shell.html \
	-sPROXY_TO_PTHREAD -sOFFSCREENCANVASES_TO_PTHREAD="#canvas" -sOFFSCREENCANVAS_SUPPORT=1 \
	--pre-js emscripten/pre.js --post-js emscripten/post.js \
	-L build/install/ \
	build/launcher_main/libhl2_launcher.a \
	$link_libs \
	-o build/launcher_main/hl2_launcher.html

cp build/launcher_main/hl2_launcher.* build/install/
cp -r emscripten/assets build/install/