# Render360 Portal Native iOS — Zero-to-Complete Master Plan

## Decision

`render360/ios-native` is the primary iPhone direction. The WebAssembly/Safari branches remain preserved as engineering references and are not deleted.

The objective is a **real arm64 Source/Portal application for iPhone**, built by Xcode/clang, with normal iOS filesystem access, native threading, and an iOS graphics backend. The IPA must never contain Valve retail Portal data.

## Non-negotiable constraints

1. Do not replace Source with a mock renderer, reimplementation, webpage, video playback, or static demo.
2. Keep the existing Source engine code as authoritative wherever practical.
3. Do not commit or redistribute retail Portal VPKs/BSPs/textures/sounds/binaries.
4. The user supplies their own legally owned Portal data at runtime.
5. iPhone 11 is the performance floor for the first production profile.
6. Landscape play is the primary UX.
7. Memory policy is current-map-first. Do not preload the whole game or a chain of previous/future maps.
8. Keep the native code path independent from Emscripten/WebAssembly. Browser-specific code must be excluded from iOS builds.
9. Every phase must have an acceptance test and CI guard where possible.
10. Do not call a phase complete merely because it compiles. Device behavior must be measured.

## Repository strategy

No new fork is required. This repository already contains the Source tree plus the `thirdparty`, `ivp`, and `lib` submodules used by the port.

Branch roles:

- `render360/iphone-baseline`: frozen WebAssembly/Phase 3 reference.
- `render360/phase4-growable-arraybuffers`: experimental WebAssembly reference.
- `render360/ios-native`: primary native iOS development branch.

The native branch may borrow engine fixes and memory-policy ideas from the web branches, but should not inherit browser-only architecture just because it already exists.

---

# N0 — Native arm64 application and IPA pipeline

### Deliverables

- CMake/Xcode iOS application target.
- arm64-only iPhoneOS Release build.
- Native UIKit bootstrap screen.
- iOS Files folder picker that can verify a Portal root.
- Unsigned IPA generated in GitHub Actions.
- Optional manually triggered signed IPA pipeline using GitHub Secrets.
- CI check rejecting obvious retail Portal files under `ios-native/`.

### Acceptance

- CI produces `Render360-Portal-iOS-unsigned.ipa`.
- Binary architecture contains arm64.
- App starts without WebKit/WebAssembly.
- Folder picker can distinguish a complete Portal root from an invalid directory.

---

# N1 — SDL2 iOS host

### Objective

Replace the temporary UIKit-only host with SDL2 as the game-facing platform layer while retaining UIKit only for import/setup UI when useful.

### Work

- Add a pinned SDL2 version/xcframework source path.
- Create a native SDL iOS window in landscape.
- Confirm OpenGL ES 3.0 context creation for bring-up.
- Wire touch, keyboard where available, game controllers, audio device creation, lifecycle pause/resume, and safe-area information.
- Keep UIKit document import outside the render loop.
- Verify app suspend/resume does not leak the render context or audio device.

### Acceptance

- SDL event loop runs on an actual iPhone.
- A clear frame presents continuously.
- Touch and controller events are visible in diagnostics.
- Audio device opens and outputs a generated test tone or silence callback without underruns.

---

# N2 — Native Source foundation libraries

### Objective

Compile the low-level Source stack as arm64 iOS static libraries before attempting the full engine.

### Initial library order

1. tier0
2. tier1
3. mathlib
4. vstdlib
5. appframework
6. filesystem_stdio
7. datacache
8. inputsystem platform-independent pieces
9. vphysics/IVP

### Work

- Create iOS compile definitions and platform headers.
- Isolate `_WIN32`, Linux/X11, GLX, Emscripten and unsupported POSIX assumptions.
- Replace unsupported APIs with small iOS platform adapters, not widespread `#ifdef` hacks.
- Compile with libc++, C++17, arm64 and hidden-by-default visibility where practical.
- Use native pthreads/std::thread; do not carry `PROXY_TO_PTHREAD` concepts into iOS.

### Acceptance

- Static libraries link into the native host.
- Mathlib deterministic tests pass.
- filesystem_stdio can open/read/seek native files in app-accessible storage.
- IVP smoke test creates and steps a small physics world.

---

# N3 — Static Source module registry

### Objective

Remove dependence on browser SIDE_MODULEs and arbitrary `.so` loading.

### Architecture

Create an iOS module registry that maps Source logical module names to linked factories:

```text
engine              -> Engine_CreateInterface
filesystem_stdio    -> FileSystem_CreateInterface
materialsystem      -> MaterialSystem_CreateInterface
shaderapidx9        -> IOSShaderAPI_CreateInterface
studiorender        -> StudioRender_CreateInterface
vphysics            -> VPhysics_CreateInterface
client              -> Client_CreateInterface
server              -> Server_CreateInterface
GameUI              -> GameUI_CreateInterface
```

### Work

- Add `platform/ios/source_module_registry.*`.
- Intercept `Sys_LoadModule`, `Sys_UnloadModule`, `Sys_GetFactory`, `Sys_GetFactoryThis` for iOS.
- Normalize names (`engine`, `engine.dll`, `libengine.so`) to a canonical logical ID.
- Preserve module load ordering and interface-version checks.
- Make unknown modules fail loudly with the requested interface/version in diagnostics.

### Acceptance

- Engine module lookup works without `dlopen`.
- No Source gameplay module is loaded from arbitrary executable files.
- Factory/interface version mismatches identify the exact module and requested interface.

---

# N4 — Portal data importer and native VPK access

### Objective

Give Source ordinary native access to the user's Portal data.

### Work

- Use UIDocumentPicker/Files to select the Portal root or a supported archive import.
- Validate at minimum `portal/gameinfo.txt`, `portal/`, `hl2/`, `platform/`, and required VPK directory files.
- Build an import manifest with file sizes, hashes where useful, and version fingerprints.
- Decide per provider between persistent security-scoped access and copying required content to Application Support.
- Never load an entire VPK into RAM.
- Use `open/pread` or `fopen/fseek/fread`; consider `mmap` only for bounded/read-only windows after profiling.
- Preserve Source's VPK logic when possible instead of inventing a duplicate asset database.

### Acceptance

- `gameinfo.txt` is found natively.
- Directory VPK and numbered archive VPKs open successfully.
- Known files can be read by Source's filesystem layer.
- Memory does not rise by the full size of a VPK merely because it was mounted.

---

# N5 — Source launcher and PreInit

### Objective

Reach a clean native engine `PreInit` with all required Source interfaces available.

### Work

- Port launcher startup away from desktop executable-path assumptions.
- Set the native game/base directory explicitly.
- Initialize filesystem, engine, material system, input and other factories through the static registry.
- Add one latest-only startup checkpoint like the web diagnostics: keep the newest actionable state, not megabytes of logs.
- Make expected optional desktop modules nonfatal only after proving Portal does not need them.

### Acceptance

- `PreInit` succeeds.
- The process enters the Source main loop rather than returning cleanly after shader/module startup.
- Failure diagnostics identify the precise last subsystem.

---

# N6 — GLES 3 / ToGL compatibility renderer

### Objective

Get first real Source pixels quickly without beginning with a total Metal rewrite.

### Rules

OpenGL ES 3.0 is a temporary compatibility backend. Keep it isolated behind the Source/ToGL abstraction so Metal can replace it later.

### Work

- Create EAGL/SDL GLES3 context.
- Audit desktop OpenGL assumptions: fixed-function calls, base-vertex variants, texture-level queries, buffer mapping, sync/fence APIs, framebuffer paths, shader language differences and unsupported extension probes.
- Implement compatibility shims only where semantics are well-defined.
- Translate/adjust GLSL for GLES 3.0 as needed.
- Keep render-state validation available in debug builds.

### Acceptance

- Source renderer creates a device/context.
- A Source clear/present path works.
- Material system can create textures/buffers/shaders without using browser/WebGL shims.
- No fake frame or prerecorded output is used.

---

# N7 — Portal `background1`

### Objective

Render the real Portal menu/background map.

### Work

- Load only the menu map and assets required by it.
- Fix missing material/shader/model dependencies one family at a time.
- Add shader/material diagnostics that identify exact missing family/path.
- Avoid bulk-staging every shader or texture.

### Acceptance

- `background1` renders real geometry.
- Portal menu can become interactive.
- No test chamber BSP is resident while sitting at the menu.

---

# N8 — First chamber

### Objective

Load and render `testchmb_a_00` with physics and gameplay code active.

### Work

- Load client/server/game rules.
- Spawn player and portal-game entities.
- Validate physics collision, doors/buttons/cubes, basic particles, sound emitters and save state.
- Fix only the dependencies required by this chamber before expanding coverage.

### Acceptance

- Chamber 00 loads from user-owned Portal data.
- Player can stand/move and interact with the room.
- Physics simulation remains stable on arm64.

---

# N9 — iPhone controls

### Objective

Create usable Portal controls without changing Source gameplay semantics.

### Input layers

- Left virtual stick: move.
- Right look region/stick: camera.
- Jump.
- Use/interact.
- Blue/orange portal fire.
- Crouch where required.
- Pause/menu.
- Optional gyro aiming.
- Native game controller mapping using SDL/GameController.

### Rules

- Touch overlay must scale with safe areas and orientation.
- Do not bake input logic directly into Portal gameplay code; map it into Source input actions.
- Support hiding touch controls when a controller is active.

### Acceptance

- Chamber 00 is playable with touch.
- Controller is playable with conventional bindings.
- Input latency is measured on device.

---

# N10 — Current-map-only native memory management

### Objective

Carry over the useful web memory strategy using native filesystem/memory primitives.

### Policy

```text
engine + shared assets + current BSP + bounded reusable cache
```

not

```text
background1 + chamber00 + chamber01 + chamber02 + ...
```

### Work

- Track active map explicitly.
- At changelevel, let Source release old world references first.
- Purge unreferenced models.
- Uncache unused materials/textures conservatively.
- Never purge shared resources still referenced by UI or the next map.
- Add memory telemetry using `task_info`, `os_proc_available_memory` where appropriate/available, allocator stats and subsystem counters.
- Establish warning/critical thresholds from device measurements rather than guesses.

### Acceptance

- Transition from chamber 00 → 01 does not retain chamber 00 world residency.
- Repeated map transitions do not create monotonic memory growth.
- iPhone 11 stays below the observed jetsam danger region with safety headroom.

---

# N11 — Hidden loading / perceived-continuity transitions

### Objective

Hide unavoidable map load time without preloading multiple full maps.

### Techniques

- Reuse Portal's elevator/airlock/door language at known changelevel boundaries.
- Freeze/preserve the last valid presented frame if safe.
- Start a lightweight native transition animation before old-map teardown.
- Keep audio/ambient transition cues alive where safe.
- Perform map swap behind closed doors/fade.
- Reveal only once the new map has reached a safe first-frame state.
- Optionally pre-read tiny manifest/header ranges, not entire next maps.

### Acceptance

- Fast map transitions do not show an unnecessary loading screen.
- Slow transitions show a responsive Aperture-style transition, never a frozen half-rendered frame.
- Transition UI itself is destroyed/released after opening.
- No full next-map prefetch is enabled on iPhone 11 without measured memory headroom.

---

# N12 — iPhone 11 performance pass

### Measure

- FPS average and 1% low.
- CPU frame time.
- GPU frame time where Metal/GPU tools permit.
- resident memory.
- peak transition memory.
- asset read latency.
- shader compilation stalls.
- audio underruns.
- thermal state.

### Optimize

- texture formats and mip policy.
- anisotropy/MSAA defaults.
- dynamic shadows and expensive post effects.
- shader permutation cache.
- VPK read granularity.
- renderer state changes.
- particle budgets.
- physics step cost.

Do not reduce Portal gameplay fidelity merely to increase a benchmark without documenting the tradeoff.

### Acceptance

- Stable, repeatable test route: menu → chamber 00 → chamber 01.
- Performance and memory numbers recorded in CI/device test notes.

---

# N13 — Metal migration

### Objective

Replace the deprecated GLES compatibility backend incrementally after gameplay works.

### Architecture

Introduce a platform-neutral Source graphics backend boundary with implementations:

```text
Source/ToGL-facing API
  ├── GLES3 bring-up backend
  └── Metal backend
```

### Migration order

1. swapchain/presentation
2. vertex/index buffers
3. texture/sampler formats
4. render targets/depth
5. shader compilation/reflection pipeline
6. state objects
7. synchronization
8. occlusion/timers where needed
9. performance-specific batching/caching

### Acceptance

- Metal path renders the same baseline scenes as GLES.
- GLES can remain temporarily as a debug/reference backend until Metal reaches feature parity.

---

# N14 — Production IPA and release automation

### Outputs

- unsigned IPA artifact for external signing/testing.
- signed development/ad-hoc IPA when repository signing secrets are configured.
- symbol archive/dSYM.
- build manifest including commit, architecture, compiler/Xcode version and feature flags.

### Signing inputs

GitHub Secrets:

- `BUILD_CERTIFICATE_BASE64`
- `P12_PASSWORD`
- `BUILD_PROVISION_PROFILE_BASE64`
- `KEYCHAIN_PASSWORD`

GitHub Variables:

- `IOS_TEAM_ID`
- `IOS_BUNDLE_ID`
- optional `IOS_SIGNING_IDENTITY` (defaults to Apple Development in the workflow)

### Acceptance

- CI build is reproducible from a clean checkout with submodules.
- Signed IPA installs on a registered device covered by the provisioning profile.
- IPA contains engine/app code but no retail Portal assets.

---

# Definition of playable native milestone

A build is not called playable until all are true:

- native arm64 executable;
- no WebAssembly/WebView dependency for engine execution;
- user-owned Portal data imported/authorized;
- Source `PreInit` and main loop active;
- real `background1` rendered;
- `testchmb_a_00` loads;
- movement/look/use/portal-fire input works;
- audio works;
- map transition unload policy works;
- no retail data is bundled in the repository/IPA.

# Definition of production-ready milestone

In addition to playable:

- iPhone 11 memory/thermal profile is stable on a repeatable route;
- chambers progress without resource accumulation;
- hidden-loading transitions are robust;
- crash diagnostics preserve only the latest actionable event plus a small state snapshot;
- Metal path reaches required feature parity or the release explicitly documents the temporary GLES dependency;
- signed CI pipeline is documented and reproducible.
