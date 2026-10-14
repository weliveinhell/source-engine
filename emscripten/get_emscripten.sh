set -ex

sudo apt update
sudo apt install git curl wget python3 xz-utils llvm binutils -y

# activate emsdk
git clone https://github.com/emscripten-core/emsdk.git
pushd emsdk
git checkout 2d480a1b7c7a34a354188d93f3e89190a44a1d21
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
popd

# Emscripten 4.0.9's cross-thread HTML5 event bridge allocates a fresh event
# payload for each proxied mouse/touch/key callback, but callback.c does not free
# that payload after dispatch. Upstream fixed this later; backport the ownership
# fix here so iPhone input cannot slowly accumulate Wasm heap pressure. Also make
# a closed/stale target-thread mailbox non-fatal: a late browser event should be
# dropped and freed rather than aborting the whole Source runtime and masking the
# earlier worker failure that closed the mailbox.
HTML5_CALLBACK=emsdk/upstream/emscripten/system/lib/html5/callback.c
python3 - "$HTML5_CALLBACK" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
marker = 'Render360 mobile: cross-thread HTML5 callback payload ownership'
if marker not in text:
    old_do = '''static void do_callback(void* arg) {
  callback_args_t* args = (callback_args_t*)arg;
  args->callback(args->event_type, args->event_data, args->user_data);
  free(arg);
}
'''
    new_do = '''static void do_callback(void* arg) {
  callback_args_t* args = (callback_args_t*)arg;
  args->callback(args->event_type, args->event_data, args->user_data);
  // Render360 mobile: cross-thread HTML5 callback payload ownership.
  // libhtml5.js allocates event_data specifically for the proxied callback.
  free(args->event_data);
  free(arg);
}
'''
    if old_do not in text:
        raise SystemExit('Render360: Emscripten callback dispatch block moved')
    text = text.replace(old_do, new_do, 1)

    old_alloc = '''  callback_args_t* arg = malloc(sizeof(callback_args_t));
  arg->callback = f;
'''
    new_alloc = '''  callback_args_t* arg = malloc(sizeof(callback_args_t));
  if (!arg) {
    // Input is best-effort under memory pressure; do not leak the JS-created
    // event payload just because the wrapper allocation failed.
    free(event_data);
    return;
  }
  arg->callback = f;
'''
    if old_alloc not in text:
        raise SystemExit('Render360: Emscripten callback allocation block moved')
    text = text.replace(old_alloc, new_alloc, 1)

    old_fail = '''  if (!emscripten_proxy_async(q, t, do_callback, arg)) {
    assert(false && "emscripten_proxy_async failed");
  }
'''
    new_fail = '''  if (!emscripten_proxy_async(q, t, do_callback, arg)) {
    // The target pthread mailbox can already be closed when a late DOM event
    // arrives. Free both allocations and drop that one input event instead of
    // turning a secondary stale-listener condition into a fatal runtime abort.
    free(arg->event_data);
    free(arg);
    return;
  }
'''
    if old_fail not in text:
        raise SystemExit('Render360: Emscripten callback proxy failure block moved')
    text = text.replace(old_fail, new_fail, 1)

for required in (
    marker,
    'free(args->event_data);',
    'free(arg->event_data);',
    'if (!arg) {',
):
    if required not in text:
        raise SystemExit(f'Render360: hardened HTML5 callback missing marker: {required}')

path.write_text(text)
print('Render360: hardened cross-thread HTML5 callbacks for mobile Safari')
PY

# The browser build does not have a native executable path for launcher.cpp to
# discover with GetModuleFileName(). Make Source's root deterministic and add
# narrow startup checkpoints around the exact Create/PreInit/engine Run path.
# This both fixes the empty-base-directory case and prevents a clean status-0
# return from turning into an unexplained black canvas again.
python3 - <<'PY'
from pathlib import Path

path = Path('launcher/launcher.cpp')
text = path.read_text()
marker = 'Render360 startup: deterministic WebAssembly base directory'

if marker not in text:
    base_anchor = '''\tif ( IsPC() )
\t{
\t\tchar const *pOverrideDir = CommandLine()->CheckParm( "-basedir" );
\t\tif ( pOverrideDir )
\t\t{
\t\t\tstrcpy( g_szBasedir, pOverrideDir );
\t\t}
\t}

#ifdef WIN32
'''
    base_replacement = '''\tif ( IsPC() )
\t{
\t\t// CheckParm() returns the parameter token itself ("-basedir"). The
\t\t// actual value is returned through its optional out-parameter. Treating
\t\t// the return value as the directory made Render360 chdir to "-basedir"
\t\t// and caused PreInit to miss /portal/gameinfo.txt.
\t\tconst char *pOverrideDir = NULL;
\t\tif ( CommandLine()->CheckParm( "-basedir", &pOverrideDir ) && pOverrideDir && pOverrideDir[0] )
\t\t{
\t\t\tQ_strncpy( g_szBasedir, pOverrideDir, sizeof( g_szBasedir ) );
\t\t}
\t}

#ifdef __EMSCRIPTEN__
\t// Render360 startup: deterministic WebAssembly base directory. POSIX
\t// GetExecutableName() intentionally returns false in this launcher, while
\t// the browser retail tree is mounted at /portal, /hl2 and /platform.
\tif ( !g_szBasedir[0] )
\t{
\t\tQ_strncpy( g_szBasedir, "/", sizeof( g_szBasedir ) );
\t\tMsg( "[Render360 startup] basedir-fallback:/\\n" );
\t}
\telse
\t{
\t\tMsg( "[Render360 startup] basedir-override:%s\\n", g_szBasedir );
\t}
#endif

#ifdef WIN32
'''
    if base_anchor not in text:
        raise SystemExit('Render360 startup: UTIL_ComputeBaseDir anchor moved')
    text = text.replace(base_anchor, base_replacement, 1)

    create_anchor = '''bool CSourceAppSystemGroup::Create()
{
\tIFileSystem *pFileSystem = (IFileSystem*)FindSystem( FILESYSTEM_INTERFACE_VERSION );
'''
    create_replacement = '''bool CSourceAppSystemGroup::Create()
{
#ifdef __EMSCRIPTEN__
\tMsg( "[Render360 startup] create-start\\n" );
#endif
\tIFileSystem *pFileSystem = (IFileSystem*)FindSystem( FILESYSTEM_INTERFACE_VERSION );
'''
    if create_anchor not in text:
        raise SystemExit('Render360 startup: Create() anchor moved')
    text = text.replace(create_anchor, create_replacement, 1)

    addsystems_old = '''\tif ( !AddSystems( appSystems ) ) 
\t\treturn false;
'''
    addsystems_new = '''\tif ( !AddSystems( appSystems ) )
\t{
#ifdef __EMSCRIPTEN__
\t\tWarning( "[Render360 startup] create-fail:AddSystems\\n" );
#endif
\t\treturn false;
\t}
'''
    if addsystems_old not in text:
        raise SystemExit('Render360 startup: AddSystems failure anchor moved')
    text = text.replace(addsystems_old, addsystems_new, 1)

    shader_anchor = '''\tpMaterialSystem->SetShaderAPI( pDLLName );

\tdouble elapsed = Plat_FloatTime() - st;
'''
    shader_replacement = '''\tpMaterialSystem->SetShaderAPI( pDLLName );
#ifdef __EMSCRIPTEN__
\tMsg( "[Render360 startup] create-ready:shaderapi=%s\\n", pDLLName );
#endif

\tdouble elapsed = Plat_FloatTime() - st;
'''
    if shader_anchor not in text:
        raise SystemExit('Render360 startup: shader API anchor moved')
    text = text.replace(shader_anchor, shader_replacement, 1)

    preinit_anchor = '''bool CSourceAppSystemGroup::PreInit()
{
\tif ( !CommandLine()->FindParm( "-nolog" ) )
'''
    preinit_replacement = '''bool CSourceAppSystemGroup::PreInit()
{
#ifdef __EMSCRIPTEN__
\tMsg( "[Render360 startup] preinit-start:basedir=%s game=%s\\n", GetBaseDirectory(), DetermineDefaultMod() );
#endif
\tif ( !CommandLine()->FindParm( "-nolog" ) )
'''
    if preinit_anchor not in text:
        raise SystemExit('Render360 startup: PreInit() anchor moved')
    text = text.replace(preinit_anchor, preinit_replacement, 1)

    interfaces_old = '''\tif ( !g_pFullFileSystem || !g_pMaterialSystem )
\t\treturn false;
'''
    interfaces_new = '''\tif ( !g_pFullFileSystem || !g_pMaterialSystem )
\t{
#ifdef __EMSCRIPTEN__
\t\tWarning( "[Render360 startup] preinit-fail:missing-filesystem-or-materialsystem\\n" );
#endif
\t\treturn false;
\t}
'''
    if interfaces_old not in text:
        raise SystemExit('Render360 startup: interface guard anchor moved')
    text = text.replace(interfaces_old, interfaces_new, 1)

    env_old = '''\tif ( FileSystem_SetupSteamEnvironment( steamInfo ) != FS_OK )
\t\treturn false;
'''
    env_new = '''\tif ( FileSystem_SetupSteamEnvironment( steamInfo ) != FS_OK )
\t{
#ifdef __EMSCRIPTEN__
\t\tWarning( "[Render360 startup] preinit-fail:steam-environment:%s\\n", FileSystem_GetLastErrorString() );
#endif
\t\treturn false;
\t}
#ifdef __EMSCRIPTEN__
\tMsg( "[Render360 startup] gameinfo-ready:%s\\n", steamInfo.m_GameInfoPath );
#endif
'''
    if env_old not in text:
        raise SystemExit('Render360 startup: Steam environment anchor moved')
    text = text.replace(env_old, env_new, 1)

    mount_old = '''\tif ( FileSystem_MountContent( fsInfo ) != FS_OK )
\t\treturn false;
'''
    mount_new = '''\tif ( FileSystem_MountContent( fsInfo ) != FS_OK )
\t{
#ifdef __EMSCRIPTEN__
\t\tWarning( "[Render360 startup] preinit-fail:mount-content:%s\\n", FileSystem_GetLastErrorString() );
#endif
\t\treturn false;
\t}
#ifdef __EMSCRIPTEN__
\tMsg( "[Render360 startup] filesystem-mounted\\n" );
#endif
'''
    if mount_old not in text:
        raise SystemExit('Render360 startup: MountContent anchor moved')
    text = text.replace(mount_old, mount_new, 1)

    startupinfo_anchor = '''\tg_pEngineAPI->SetStartupInfo( info );

\treturn true;
}

int CSourceAppSystemGroup::Main()
{
\treturn g_pEngineAPI->Run();
}
'''
    startupinfo_replacement = '''\tg_pEngineAPI->SetStartupInfo( info );
#ifdef __EMSCRIPTEN__
\tMsg( "[Render360 startup] preinit-ready\\n" );
#endif

\treturn true;
}

int CSourceAppSystemGroup::Main()
{
#ifdef __EMSCRIPTEN__
\tMsg( "[Render360 startup] engine-run-enter\\n" );
#endif
\tconst int nRender360Result = g_pEngineAPI->Run();
#ifdef __EMSCRIPTEN__
\tWarning( "[Render360 startup] engine-run-return:%d\\n", nRender360Result );
#endif
\treturn nRender360Result;
}
'''
    if startupinfo_anchor not in text:
        raise SystemExit('Render360 startup: StartupInfo/Main anchor moved')
    text = text.replace(startupinfo_anchor, startupinfo_replacement, 1)

    run_anchor = '''\t\tCSourceAppSystemGroup sourceSystems;
\t\tCSteamApplication steamApplication( &sourceSystems );
\t\tint nRetval = steamApplication.Run();
'''
    run_replacement = '''\t\tCSourceAppSystemGroup sourceSystems;
\t\tCSteamApplication steamApplication( &sourceSystems );
\t\tint nRetval = steamApplication.Run();
#ifdef __EMSCRIPTEN__
\t\tWarning( "[Render360 startup] steam-run-return:%d stage:%d\\n", nRetval, (int)steamApplication.GetErrorStage() );
#endif
'''
    if run_anchor not in text:
        raise SystemExit('Render360 startup: SteamApplication Run anchor moved')
    text = text.replace(run_anchor, run_replacement, 1)

for required in (
    marker,
    'CommandLine()->CheckParm( "-basedir", &pOverrideDir )',
    '[Render360 startup] basedir-override:',
    '[Render360 startup] create-start',
    '[Render360 startup] preinit-start',
    '[Render360 startup] gameinfo-ready:',
    '[Render360 startup] filesystem-mounted',
    '[Render360 startup] engine-run-enter',
    '[Render360 startup] engine-run-return:',
    '[Render360 startup] steam-run-return:',
):
    if required not in text:
        raise SystemExit(f'Render360 startup patch missing marker: {required}')

path.write_text(text)
print('Render360: hardened and instrumented Source WebAssembly startup')
PY

# patch and rebuild sdl2
embuilder --pic build sdl2 sdl2-mt
sed -Ei 's/freq = EM_ASM_INT/freq = MAIN_THREAD_EM_ASM_INT/' emsdk/upstream/emscripten/cache/ports/sdl2/SDL-release-2.32.0/src/audio/emscripten/SDL_emscriptenaudio.c
embuilder --force --pic build sdl2 sdl2-mt

# patch glMapBufferRange to allow some "unsupported" parameters
patch emsdk/upstream/emscripten/src/lib/libwebgl.js emscripten/libwebgl.patch