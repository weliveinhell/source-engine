# Emscripten port for the source engine (only portal tested)

## hosted on [yikes.pw](https://yikes.pw)

i definitely broke something on another platforms, but that's okay!!

## some notes

### emscripten patching (im to lazy to fork it)
yeeeah so we need to patch glMapBufferRange to allow some "unsupported" parameters

libwebgl.js
```js
  glMapBufferRange: (target, offset, length, access) => {
    if ((access & (0x1/*GL_MAP_READ_BIT*/ /*| 0x20*//*GL_MAP_UNSYNCHRONIZED_BIT*/)) != 0) {
      err("glMapBufferRange access does not support MAP_READ or MAP_UNSYNCHRONIZED");
      GL.recordError(0x501 /* GL_INVALID_VALUE */);
      return 0;
    }

    if ((access & 0x2/*GL_MAP_WRITE_BIT*/) == 0) {
      err("glMapBufferRange access must include MAP_WRITE");
      //return 0;
    }

    if ((access & (0x4/*GL_MAP_INVALIDATE_BUFFER_BIT*/ | 0x8/*GL_MAP_INVALIDATE_RANGE_BIT*/ | 0x10/*GL_MAP_FLUSH_EXPLICIT_BIT*/)) == 0) {
      err("glMapBufferRange access must include INVALIDATE_BUFFER or INVALIDATE_RANGE");
      //return 0;
    }
```

also patch libdylink.js to deal with dlopen() + load-time dynamic linking + source shenanigans
```js
  $loadDynamicLibrary: function(libName, flags = {global: true, nodelete: true}, localScope, handle) {
#if DYLINK_DEBUG
    dbg(`loadDynamicLibrary: ${libName} handle: ${handle}`);
    dbg('existing:', Object.keys(LDSO.loadedLibsByName));
#endif
    // when loadDynamicLibrary did not have flags, libraries were loaded
    // globally & permanently

libName = libName.split('/')
libName = libName[libName.length - 1]

    var dso = LDSO.loadedLibsByName[libName];

/// ...

      if (handle) {
        LDSO.loadedLibsByHandle[handle] = dso;
      }
      return flags.loadAsync ? Promise.resolve(true) : true;
    } else if(runtimeInitialized) throw new Error(`library ${libName} not found`)

    // allocate new DSO
    dso = newDSO(libName, handle, 'loading');


```
### building
before building copy your game data into __game_data/data folder
and you should shrink it as much as you can
you must fit it in 2GB, that's the limit of javascript's arrayBuffers

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
bash build_emscripten.sh
```

### to fix fonts in main menu
replace in platform/resource/sourceschemebase.res, near MenuLarge:
`"1"	[$LINUX]` to `"1"	[$POSIX]`
and it will break osx fonts probably (?)

### script to remove non-english locales, we really want to reduce data size 

```sh
for x in brazilian bulgarian czech danish dutch finnish french german greek hungarian italian japanese koreana korean latam norwegian polish portuguese romanian russian schinese spanish swedish tchinese thai turkish ukrainian vietnamese; do
	rm -f hl2/resource/*_$x.txt hl2/resource/closecaption_$x.dat portal/resource/*_$x.txt portal/resource/closecaption_$x.dat
done
```

### repackage vpks for portal to reduce size
TODO: we need to manually pick exactly which files to delete, maybe some whitelist? because there is some missing textures in game

```sh
set -ex

# CHANGEME
src_gamedata_path=""
dst_game_data_path="THIS_REPO/__game_data/game"

repackage_vpk () {
	vpk_package_path="$1"
	vpk_package_name="$2"
	files_to_remove="$3"

	rm -rf $vpk_package_name
	mkdir $vpk_package_name
	cd $vpk_package_name

	vpkeditcli -e / -o . $src_gamedata_path/$vpk_package_path/$vpk_package_name\_dir.vpk
	cd $vpk_package_name
	rm -rf $files_to_remove
	cd ..
	vpkeditcli $vpk_package_name/
	rm -rf $vpk_package_name

	rm -rf $dst_game_data_path/$vpk_package_path/$vpk_package_name\_*
	mv $vpk_package_name\_* $dst_game_data_path/$vpk_package_path

	cd ..
	rmdir $vpk_package_name
}

repackage_vpk hl2 hl2_textures \
	"materials/models materials/gamepadui materials/building_template materials/concrete materials/matsys_regressiontest materials/nature materials/skybox materials/brick materials/composite materials/glass materials/metal materials/plaster materials/stone materials/tile materials/dev"

repackage_vpk portal portal_pak \
	"sound gamepadui materials/nature materials/gamepadui"

repackage_vpk hl2 hl2_misc \
	"models/humans models/props_buildings models/props_c17 models/props_canal models/props_citizen_tech models/props_combine models/props_debris models/props_docks models/props_foliage models/props_interiors models/props_junk models/props_lab models/props_pipes models/props_rooftop models/props_trainstation models/props_vehicles models/props_vents models/props_wasteland"
```