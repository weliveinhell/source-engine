set -ex

port_flags="-sUSE_BZIP2=1 -sUSE_SDL=2 -sUSE_FREETYPE=1 -sUSE_LIBJPEG=1 -sUSE_LIBPNG -sMALLOC=mimalloc"
export CC=emcc
export CXX=em++
export CFLAGS="$port_flags -DPOSIX=1 -msimd128 -msse -w"
export CXXFLAGS="$port_flags -DPOSIX=1 -msimd128 -msse -w"
export LDFLAGS="$port_flags"
export PKGCONFIG=/bin/true

python3 waf configure -T release -c no --notests -4 --build-games=portal --togles --emscripten
python3 waf build
rm -rf build/install
python3 waf install --destdir=build/install # fixme install prefix

cp build/install/usr/local/portal/bin/*.so build/install/usr/local/bin/

preload_libs=""
#for lib in build/install/usr/local/bin/*.so; do
#	preload_libs="$preload_libs --preload-file=$lib@/bin/$(basename $lib)"
#done

link_libs="-sERROR_ON_UNDEFINED_SYMBOLS=0"
for lib in build/install/usr/local/bin/*.so; do
	libname=$(echo $lib | sed -E 's/^.+\/lib(.+)\.so/\1/g')
	link_libs="$link_libs -l$libname"
done

emcc \
	$port_flags \
	-sMAIN_MODULE -sINITIAL_MEMORY=2047mb -sSHARED_MEMORY=1 -sUSE_PTHREADS -sPTHREAD_POOL_SIZE=8 -sPTHREAD_POOL_SIZE_STRICT=2 \
	-sFULL_ES3 -sSTACK_SIZE=4mb -sEXPORTED_RUNTIME_METHODS=requestFullscreen --shell-file=emscripten/shell.html \
	--preload-file=__game_data/game@/ \
	$preload_libs \
	--pre-js emscripten/pre.js --post-js emscripten/post.js \
	-L build/install/usr/local/bin/ \
	build/launcher_main/libhl2_launcher.a \
	$link_libs \
	-o build/launcher_main/hl2_launcher.html

cp build/launcher_main/hl2_launcher.* build/install/usr/local/
cp build/install/usr/local/bin/*.so build/install/usr/local/
cp -r emscripten/assets/ build/install/usr/local/assets