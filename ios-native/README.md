# Render360 Portal — Native iOS

This directory is the primary iPhone port target. The browser/WebAssembly work remains preserved on the existing Render360 branches, but native iOS no longer depends on Safari, WebAssembly, MEMFS/WORKERFS, SharedArrayBuffer, COOP/COEP, service workers, or browser fullscreen behavior.

## Start here for AI implementation

Use `docs/IOS_NATIVE_ZERO_TO_IPA_PROMPT_PACK.md` as the canonical zero-to-complete execution prompt pack. It contains the global implementation contract, phase prompts from bootstrap through signed IPA and final release audit, plus dedicated recovery prompts for CI, device crashes, renderer black screens, Portal import/VPK failures, signing failures and memory/jetsam problems.

`docs/IOS_NATIVE_AI_PROMPTS.md` remains the original N0-N14 prompt set and useful supporting reference. If the two differ in execution procedure, use the newer zero-to-IPA prompt pack while preserving architecture constraints from the master plan and architecture documents.

## Scope

The target is a real arm64 iPhone application, not a web wrapper and not a mock renderer.

Target bring-up order:

1. Native arm64 app boots on iPhone.
2. SDL2 iOS window/input/audio host.
3. Source tier0/tier1/mathlib/filesystem compile natively.
4. Static Source module registry replaces browser SIDE_MODULE/dlopen startup.
5. User imports/verifies a legally owned Portal installation from Files.
6. Source PreInit and VPK reads work through normal iOS filesystem I/O.
7. Bring up the existing ToGL path against OpenGL ES 3.0 as a compatibility milestone.
8. Render `background1`.
9. Render `testchmb_a_00` and support touch/controller input.
10. Preserve current-map-only residency and release old map resources at transitions.
11. Hide unavoidable level transitions behind Aperture/elevator-style transition presentation.
12. Profile/optimize for iPhone 11.
13. Migrate expensive/deprecated graphics paths to Metal incrementally.
14. Produce unsigned and optionally signed IPA artifacts in GitHub Actions.

## Retail data policy

**Do not commit Portal retail data, VPKs, maps, textures, sounds, Valve binaries, or copied game assets to this repository or package them in the IPA.**

The app must ask the user to import/authorize files from their own Portal installation. Build-time tests use synthetic fixtures only.

## Memory policy carried over from the web work

The useful memory architecture survives the native pivot:

- Menu: `background1` only.
- Gameplay: current BSP + shared engine assets + bounded reusable caches.
- No future-map prefetch on the iPhone 11 profile until measurements prove there is safe headroom.
- After a successful level transition, release old world/model references and uncache only unused materials/resources.
- Never keep a chain of `background1 + chamber00 + chamber01 + ...` resident.
- Prefer ordinary file reads/range reads from VPKs instead of unpacking whole maps into RAM.

## Native filesystem layout

At runtime the host will resolve a Source-style game root under iOS-accessible storage:

```text
<Application Support>/Render360Portal/Game/
  portal/
    gameinfo.txt
    portal_pak_dir.vpk
    ...
  hl2/
    ...
  platform/
    ...
```

Initial import may use a Files document/folder picker. The final implementation must either copy the required user-owned files into Application Support or preserve a valid security-scoped access mechanism; it must never rely on JavaScript File objects.

## Module strategy

On iOS, Source modules should be linked into the application and resolved through a native registry instead of arbitrary runtime-loaded executable modules.

Example logical mapping:

```text
engine              -> Engine_CreateInterface
filesystem_stdio    -> FileSystem_CreateInterface
materialsystem      -> MaterialSystem_CreateInterface
shaderapidx9        -> IOSShaderAPI_CreateInterface
client              -> Client_CreateInterface
server              -> Server_CreateInterface
```

`Sys_LoadModule`/`Sys_GetFactory` receive an iOS implementation that first checks the built-in registry. Only Apple-supported dynamic frameworks should remain dynamic.

## Graphics strategy

OpenGL ES 3.0 is a bring-up compatibility milestone only. Apple deprecates OpenGL ES and recommends Metal. The port should therefore isolate Source/ToGL from the platform backend so we can reach first pixels quickly, then migrate hot paths to Metal without rewriting gameplay/engine code.

## IPA outputs

The branch contains two CI paths:

- `ios-native.yml`: creates an **unsigned bootstrap IPA**. This proves the arm64 iPhone host compiles and packages. It must be signed later before installation on a normal device.
- `ios-native-signed.yml`: manual signed build using repository secrets/variables for an Apple certificate and provisioning profile.

The first IPA is intentionally a native bootstrap host. It is not considered a playable Portal build until the roadmap gates in `docs/IOS_NATIVE_MASTER_PLAN.md` are satisfied.

## Build locally

```bash
cmake -S ios-native -B build/ios -G Xcode \
  -DCMAKE_SYSTEM_NAME=iOS \
  -DCMAKE_OSX_SYSROOT=iphoneos \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=15.0

xcodebuild \
  -project build/ios/Render360PortalIOS.xcodeproj \
  -scheme Render360Portal \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  build
```

Primary implementation prompts: `docs/IOS_NATIVE_ZERO_TO_IPA_PROMPT_PACK.md`.
Supporting roadmap: `docs/IOS_NATIVE_MASTER_PLAN.md`.
Original prompt set: `docs/IOS_NATIVE_AI_PROMPTS.md`.
