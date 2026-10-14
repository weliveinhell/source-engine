#!/bin/sh

buildtype=release
if [ "$1" = "debug" ] || [ "$1" = "release" ]; then
	buildtype=$1
	shift
fi

export CC=emcc
export CXX=em++

set -ex

# Keep Source's upstream pthread/SharedArrayBuffer architecture intact, but stop
# the browser build from attempting to dlopen desktop-only optional modules.
python3 - <<'PY'
from pathlib import Path
import re

path = Path('tier1/interface.cpp')
text = path.read_text()
if '#include <emscripten.h>' not in text:
    inc = '#include "tier0/threadtools.h"\n'
    if inc not in text:
        raise SystemExit('Render360 Portal: interface.cpp include anchor moved')
    text = text.replace(inc, inc + '#ifdef __EMSCRIPTEN__\n#include <emscripten.h>\n#endif\n', 1)
pattern = re.compile(
    r'(CSysModule \*Sys_LoadModule\( const char \*pModuleName, Sys_Flags flags /\* = SYS_NOFLAGS \(0\) \*/ \)\n\{\n\tHMODULE hDLL = NULL;\n\n)'
    r'#ifdef __EMSCRIPTEN__\n.*?\n#else\n',
    re.S,
)
replacement = r'''\1#ifdef __EMSCRIPTEN__
	const char *pBaseName = strrchr(pModuleName, '/');
	if(!pBaseName) pBaseName = strrchr(pModuleName, '\\');
	pBaseName = pBaseName ? pBaseName + 1 : pModuleName;

	char szBaseName[1024] = { 0 };
	Q_strncpy(szBaseName, pBaseName, sizeof(szBaseName));
	if(!string_endsWith(szBaseName, ".so")) {
		V_SetExtension(szBaseName, ".so", sizeof(szBaseName));
	}

	char szModuleName[1024] = { 0 };
	if(strncmp(szBaseName, "lib", 3) == 0) {
		Q_strncpy(szModuleName, szBaseName, sizeof(szModuleName));
	} else {
		Q_snprintf(szModuleName, sizeof(szModuleName), "lib%s", szBaseName);
	}

	static const char *s_pOptionalBrowserModules[] = {
		"libsourcevr.so",
		"libvideo_bink.so",
		"libvideo_webm.so",
		"libvideo_quicktime.so",
		"libstdshader_dbg.so",
		"libstdshader_dx6.so",
		"libstdshader_dx7.so",
		"libstdshader_dx8.so",
	};
	for(size_t i = 0; i < sizeof(s_pOptionalBrowserModules) / sizeof(s_pOptionalBrowserModules[0]); ++i) {
		if(Q_stricmp(szModuleName, s_pOptionalBrowserModules[i]) == 0) {
			Msg("Render360: optional browser module skipped: %s\n", szModuleName);
			return reinterpret_cast<CSysModule *>(hDLL);
		}
	}

	// Emscripten only shares a dlopen'd module with the other threads when
	// the file is in the virtual filesystem: dlopen copies it into linear
	// memory (dso->file_data) and every other thread instantiates from that
	// copy. Fetched any other way, the other threads fail to load it and
	// Emscripten aborts (ABORT_ON_SYNC_FAILURE). The modules are no longer
	// preloaded, so ask the main thread to put this one -- and the modules it
	// depends on -- into MEMFS first, and wait for it. Same handshake as the
	// map download in FindMap.
	{
		int render360ModuleLock = 1;
		int render360Requested = EM_ASM_INT({
			if (typeof ENVIRONMENT_IS_PTHREAD === 'undefined' || !ENVIRONMENT_IS_PTHREAD) return 0;
			postMessage({
				cmd: 'callHandler',
				handler: 'render360FetchModule',
				args: [ $0 / 4, UTF8ToString($1) ]
			});
			return 1;
		}, &render360ModuleLock, szModuleName);
		if(render360Requested)
			__builtin_wasm_memory_atomic_wait32(&render360ModuleLock, 1, -1);
	}

	Msg("LoadLibrary: path: %s\n", szModuleName);
	hDLL = (HMODULE)dlopen(szModuleName, RTLD_NOW);
	if(!hDLL) {
		const char *pError = dlerror();
		Warning("Can't find module - %s%s%s\n", pModuleName,
			pError ? " · " : "", pError ? pError : "");
	} else {
		Msg("Render360: loaded module: %s\n", szModuleName);
	}
#else
'''
updated, count = pattern.subn(
    lambda match: replacement.replace(r'\1', match.group(1), 1),
    text,
    count=1,
)
if count != 1:
    raise SystemExit('Render360 Portal: could not locate Emscripten Sys_LoadModule block')
for marker in (
    'Render360: optional browser module skipped:',
    'Render360: loaded module:',
    'libsourcevr.so',
    'libvideo_bink.so',
    'libvideo_webm.so',
    'libstdshader_dbg.so',
    'libstdshader_dx8.so',
):
    if marker not in updated:
        raise SystemExit(f'Render360 Portal: loader patch missing {marker}')
if "strrchr(pModuleName, '\\\\');" not in updated:
    raise SystemExit('Render360 Portal: generated backslash basename check is malformed')
if 'Msg("Render360: optional browser module skipped: %s\\n", szModuleName);' not in updated:
    raise SystemExit('Render360 Portal: generated optional-module log newline is malformed')
if 'Msg("LoadLibrary: path: %s\\n", szModuleName);' not in updated:
    raise SystemExit('Render360 Portal: generated LoadLibrary log newline is malformed')
if 'Msg("Render360: loaded module: %s\\n", szModuleName);' not in updated:
    raise SystemExit('Render360 Portal: generated loaded-module log newline is malformed')
path.write_text(updated)
print('Render360 Portal: patched Sys_LoadModule optional browser-module handling')
PY

# Add hierarchical startup diagnostics after get_emscripten.sh has applied the
# base Render360 launcher checkpoints. The outer Steam wrapper can report NONE
# even when its Source child or the engine's mod app-system group returned -1.
python3 - <<'PY'
from pathlib import Path

launcher = Path('launcher/launcher.cpp')
launcher_text = launcher.read_text()
old_launcher = '''#ifdef __EMSCRIPTEN__
\t\tWarning( "[Render360 startup] steam-run-return:%d stage:%d\\n", nRetval, (int)steamApplication.GetErrorStage() );
#endif
'''
new_launcher = '''#ifdef __EMSCRIPTEN__
\t\tWarning( "[Render360 startup] steam-return:%d steam-stage:%d source-stage:%d\\n",
\t\t\tnRetval,
\t\t\t(int)steamApplication.GetErrorStage(),
\t\t\t(int)sourceSystems.GetErrorStage() );
#endif
'''
if old_launcher not in launcher_text:
    raise SystemExit('Render360 nested diagnostics: outer Steam checkpoint anchor moved')
launcher_text = launcher_text.replace(old_launcher, new_launcher, 1)
for required in ('steam-return:%d', 'steam-stage:%d', 'source-stage:%d'):
    if required not in launcher_text:
        raise SystemExit(f'Render360 nested diagnostics: launcher marker missing: {required}')
launcher.write_text(launcher_text)

engine = Path('engine/sys_dll2.cpp')
engine_text = engine.read_text()
marker = 'Render360 startup: nested mod app-system diagnostics'
if marker not in engine_text:
    create_anchor = '''bool CModAppSystemGroup::Create()
{
#ifndef SWDS
'''
    create_replacement = '''bool CModAppSystemGroup::Create()
{
#ifdef __EMSCRIPTEN__
\t// Render360 startup: nested mod app-system diagnostics.
\tMsg( "[Render360 startup] mod-create-start\\n" );
#endif
#ifndef SWDS
'''
    if create_anchor not in engine_text:
        raise SystemExit('Render360 nested diagnostics: CModAppSystemGroup::Create anchor moved')
    engine_text = engine_text.replace(create_anchor, create_replacement, 1)

    client_anchor = '''#ifndef SWDS
\tif ( !IsServerOnly() )
{
\t\tif ( !ClientDLL_Load() )
\treturn false;
}
#endif 
'''
    client_replacement = '''#ifndef SWDS
\tif ( !IsServerOnly() )
\t{
#ifdef __EMSCRIPTEN__
\t\tMsg( "[Render360 startup] mod-create-client-load-start\\n" );
#endif
\t\tif ( !ClientDLL_Load() )
\t\t{
#ifdef __EMSCRIPTEN__
\t\t\tWarning( "[Render360 startup] mod-create-fail:ClientDLL_Load\\n" );
#endif
\t\t\treturn false;
\t\t}
#ifdef __EMSCRIPTEN__
\t\tMsg( "[Render360 startup] mod-create-client-load-ready\\n" );
#endif
\t}
#endif 
'''
    if client_anchor not in engine_text:
        raise SystemExit('Render360 nested diagnostics: ClientDLL_Load anchor moved')
    engine_text = engine_text.replace(client_anchor, client_replacement, 1)

    server_anchor = '''\tif ( !ServerDLL_Load( IsServerOnly() ) )
\t\treturn false;
'''
    server_replacement = '''#ifdef __EMSCRIPTEN__
\tMsg( "[Render360 startup] mod-create-server-load-start\\n" );
#endif
\tif ( !ServerDLL_Load( IsServerOnly() ) )
\t{
#ifdef __EMSCRIPTEN__
\t\tWarning( "[Render360 startup] mod-create-fail:ServerDLL_Load\\n" );
#endif
\t\treturn false;
\t}
#ifdef __EMSCRIPTEN__
\tMsg( "[Render360 startup] mod-create-server-load-ready\\n" );
#endif
'''
    if server_anchor not in engine_text:
        raise SystemExit('Render360 nested diagnostics: ServerDLL_Load anchor moved')
    engine_text = engine_text.replace(server_anchor, server_replacement, 1)

    systems_anchor = '''\tif ( !AddSystems( systems.Base() ) ) 
\t\treturn false;
'''
    systems_replacement = '''\tif ( !AddSystems( systems.Base() ) )
\t{
#ifdef __EMSCRIPTEN__
\t\tWarning( "[Render360 startup] mod-create-fail:AddSystems\\n" );
#endif
\t\treturn false;
\t}
#ifdef __EMSCRIPTEN__
\tMsg( "[Render360 startup] mod-create-appsystems-ready\\n" );
#endif
'''
    if systems_anchor not in engine_text:
        raise SystemExit('Render360 nested diagnostics: mod AddSystems anchor moved')
    engine_text = engine_text.replace(systems_anchor, systems_replacement, 1)

    tool_anchor = '''\t\tif ( !AddSystem( toolFrameworkModule, VTOOLFRAMEWORK_INTERFACE_VERSION ) )
\t\t\treturn false;
'''
    tool_replacement = '''\t\tif ( !AddSystem( toolFrameworkModule, VTOOLFRAMEWORK_INTERFACE_VERSION ) )
\t\t{
#ifdef __EMSCRIPTEN__
\t\t\tWarning( "[Render360 startup] mod-create-fail:toolframework\\n" );
#endif
\t\t\treturn false;
\t\t}
'''
    if tool_anchor not in engine_text:
        raise SystemExit('Render360 nested diagnostics: toolframework anchor moved')
    engine_text = engine_text.replace(tool_anchor, tool_replacement, 1)

    create_ready_anchor = '''#endif

\treturn true;
}

//-----------------------------------------------------------------------------
// Purpose: Fixme, we might need to verify if the interface names differ for the client versus the server
'''
    create_ready_replacement = '''#endif

#ifdef __EMSCRIPTEN__
\tMsg( "[Render360 startup] mod-create-ready\\n" );
#endif
\treturn true;
}

//-----------------------------------------------------------------------------
// Purpose: Fixme, we might need to verify if the interface names differ for the client versus the server
'''
    if create_ready_anchor not in engine_text:
        raise SystemExit('Render360 nested diagnostics: mod Create ready anchor moved')
    engine_text = engine_text.replace(create_ready_anchor, create_ready_replacement, 1)

    run_anchor = '''\t\tnRunResult = modAppSystemGroup.Run();

\t\tg_AppSystemFactory = NULL;
'''
    run_replacement = '''\t\tnRunResult = modAppSystemGroup.Run();
#ifdef __EMSCRIPTEN__
\t\tWarning( "[Render360 startup] mod-return:%d mod-stage:%d\\n",
\t\t\tnRunResult,
\t\t\t(int)modAppSystemGroup.GetErrorStage() );
#endif

\t\tg_AppSystemFactory = NULL;
'''
    if run_anchor not in engine_text:
        raise SystemExit('Render360 nested diagnostics: mod Run anchor moved')
    engine_text = engine_text.replace(run_anchor, run_replacement, 1)

for required in (
    marker,
    '[Render360 startup] mod-create-client-load-start',
    '[Render360 startup] mod-create-fail:ClientDLL_Load',
    '[Render360 startup] mod-create-server-load-start',
    '[Render360 startup] mod-create-fail:ServerDLL_Load',
    '[Render360 startup] mod-create-fail:AddSystems',
    '[Render360 startup] mod-create-ready',
    '[Render360 startup] mod-return:%d mod-stage:%d',
):
    if required not in engine_text:
        raise SystemExit(f'Render360 nested diagnostics: engine marker missing: {required}')
engine.write_text(engine_text)
print('Render360 Portal: added nested Steam/Source/mod startup diagnostics')
PY

python3 waf configure -T $buildtype --notests -4 --togles --emscripten \
	--disable-warns --build-games=portal --prefix=build/install
python3 waf install $@
find build/ -name '*.map' -exec cp {} build/install/ \;

python3 - <<'PY'
from pathlib import Path
mods = sorted(Path('build/install').glob('*.so'))
if not mods:
    raise SystemExit('Render360 Portal: no Emscripten SIDE_MODULE .so files were produced')
bad = []
for path in mods:
    with path.open('rb') as f:
        magic = f.read(4)
    if magic != b'\x00asm':
        bad.append((str(path), magic.hex()))
if bad:
    for path, magic in bad:
        print(f'NON-WASM SIDE_MODULE: {path} magic={magic}')
    raise SystemExit('Render360 Portal: native/non-Wasm .so entered build/install')
Path('build/install/render360-wasm-side-modules.txt').write_text(
    '\n'.join(path.name for path in mods) + '\n'
)
print(f'Render360 Portal: verified {len(mods)} WebAssembly SIDE_MODULEs')
PY

for required in \
	libfilesystem_stdio.so \
	libengine.so \
	libmaterialsystem.so \
	libshaderapidx9.so \
	libstdshader_dx9.so
do
	if [ ! -s "build/install/$required" ]; then
		echo "Render360 Portal: required Wasm module missing: $required" >&2
		exit 1
	fi
done

echo "Render360 Portal: required filesystem/engine/ToGL module set present"

# The side modules are deliberately NOT packed into hl2_launcher.data.
# Packing them meant all 37 MiB of .so bytes sat in JavaScript memory for the
# life of the page, on top of the compiled copy WebKit makes at dlopen. Left
# on disk next to the page, Emscripten's dlopen fetches each module on demand
# (synchronous XHR on the Source pthread: libdylink.js loadLibData ->
# readBinary(locateFile(name))) and the bytes are released once it is
# compiled. Do not bring the preload of *.so back.

# iPhone Safari has a relatively tight WebContent process budget. At startup
# Portal simultaneously holds the shared Wasm heap, Wasm SIDE_MODULE bytes/JIT
# code, pthread stacks and WebGL resources. Phase 3 removes the retail map/VPK
# payload from MEMFS: the staging page keeps the user's File objects alive and
# forwards them to the Source pthread where WORKERFS exposes them read-only.
# Source then opens the retail VPKs and performs its own range reads on demand.
# WORKERFS is not part of the default JS filesystem, so link it explicitly.
EMCC_FORCE_STDLIBS=libc,libc++,libc++abi emcc -Os --profiling-funcs \
	-sUSE_BZIP2=1 -sUSE_SDL=2 -sUSE_FREETYPE=1 -sUSE_LIBJPEG=1 -sUSE_LIBPNG -sMALLOC=dlmalloc \
	-sMAIN_MODULE -sINCLUDE_FULL_LIBRARY=1 \
	-sINITIAL_MEMORY=384mb -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=1024mb -sMEMORY_GROWTH_LINEAR_STEP=32mb \
	-sSHARED_MEMORY=1 -sUSE_PTHREADS -sPTHREAD_POOL_SIZE=2 -sPTHREAD_POOL_SIZE_STRICT=0 \
	-sFULL_ES3 -sSTACK_SIZE=16mb -sDEFAULT_PTHREAD_STACK_SIZE=1mb --shell-file=emscripten/shell.html \
	-sASSERTIONS=1 -sSTACK_OVERFLOW_CHECK=1 \
	-sPROXY_TO_PTHREAD -sOFFSCREENCANVASES_TO_PTHREAD="#canvas" -sOFFSCREENCANVAS_SUPPORT=1 \
	-lworkerfs.js \
	--pre-js emscripten/pre.js \
	--pre-js emscripten/phase3-mobile-runtime.js \
	--post-js emscripten/phase3-workerfs.js --post-js emscripten/post.js \
	build/launcher_main/libhl2_launcher.a \
	-o build/launcher_main/hl2_launcher.html

# Record deploy sizes in CI so future regressions that grow the threaded Wasm
# or SIDE_MODULE package are visible before they become another iPhone reload.
ls -lh build/launcher_main/hl2_launcher.wasm build/launcher_main/hl2_launcher.data || true
du -ch build/install/*.so | tail -n 1 || true

cp build/launcher_main/hl2_launcher.* build/install/
cp -r emscripten/assets build/install/
# Fallback fonts for vgui's system-font lookups (pre.js writes them to
# /platform/resource/linux_fonts); retail Windows Portal does not ship them.
cp -r emscripten/fonts build/install/
