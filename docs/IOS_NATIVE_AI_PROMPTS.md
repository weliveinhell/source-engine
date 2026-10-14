# Render360 Portal Native iOS — AI Build Prompts

These prompts are designed for incremental implementation on branch `render360/ios-native`. Run them in order. Do not ask the agent to regenerate the entire project every time; each phase must inspect and preserve previous working gates.

## Global preamble — prepend to every implementation prompt

```text
Repository: matthewcodergamer/source-engine-render360
Branch: render360/ios-native

You are the lead engine/platform programmer for the native iOS port of Render360 Portal.

Read before editing:
- ios-native/README.md
- docs/IOS_NATIVE_MASTER_PLAN.md
- docs/IOS_NATIVE_AI_PROMPTS.md
- .gitmodules
- the current native iOS workflow files
- all files touched by the previous native phase

Hard constraints:
1. Build a real arm64 iOS Source/Portal application. Do not replace Source with a mock renderer, webpage, video, static scene, or fake gameplay.
2. Do not commit, download into the repository, or bundle Portal retail VPK/BSP/texture/audio assets. The user supplies their own legally owned game files at runtime.
3. Keep the WebAssembly branches preserved. Do not merge browser architecture into native iOS simply because it already exists.
4. iPhone 11 is the first performance floor.
5. Preserve current-map-only residency: menu background only at menu; current BSP during gameplay; bounded shared cache; no cumulative previous maps; no full future-map prefetch on the iPhone 11 profile unless measurements prove safe headroom.
6. Prefer narrow platform adapters over invasive rewrites of Source.
7. Use native iOS filesystem/threading primitives. No MEMFS, WORKERFS, SharedArrayBuffer, PROXY_TO_PTHREAD, COOP/COEP, service worker, or JavaScript File handoff in the native runtime.
8. Every failure must leave a concise latest actionable diagnostic. Do not accumulate huge scrolling logs in memory.
9. Do not mark a phase complete just because it compiles. State what is CI-proven, simulator-proven, and physical-device-proven separately.
10. Keep commits phase-scoped and update documentation/acceptance checks when architecture changes.

Before coding, inspect the exact current repository state and identify the smallest correct change. After coding, run/static-check what is possible, inspect CI, fix concrete failures, and report remaining physical-device gates.
```

---

# Prompt 0 — Audit and native branch baseline

```text
Using the global preamble, audit render360/ios-native before adding more engine code.

Tasks:
- Inventory the Source modules, submodules and third-party libraries already present.
- Identify all Emscripten-only compile definitions/files that must be excluded from native iOS.
- Confirm the native N0 CMake/Xcode bootstrap and both IPA workflows are internally consistent.
- Confirm retail Portal assets are not present under ios-native/ and are not referenced as downloadable build inputs.
- Create/update docs/IOS_NATIVE_PORTING_AUDIT.md with:
  - reusable engine code
  - browser-only code to exclude
  - native adapters needed
  - module dependency order
  - graphics blockers
  - filesystem blockers
  - audio/input blockers
  - licensing/asset boundary
- Fix any obvious bootstrap CI bugs found during the audit.

Acceptance:
- N0 unsigned IPA workflow reaches artifact creation.
- Branch still contains no retail Portal data.
- Audit names the exact source files/directories targeted in N1/N2.
```

# Prompt 1 — N1 SDL2 iOS host

```text
Using the global preamble, implement N1: SDL2 iOS host.

Requirements:
- Pin a known SDL2 release and integrate it in a reproducible way suitable for GitHub Actions/macOS runners. Prefer the official SDL iOS/Xcode/xcframework path or a source build that can produce the iOS framework deterministically.
- Do not vendor an opaque prebuilt binary without provenance/version documentation.
- Preserve the UIKit folder-import bootstrap; UIKit may own setup/import UI, but the game-facing runtime uses SDL.
- Create a landscape SDL window on iPhone.
- Bring up an OpenGL ES 3.0 context only as the renderer bootstrap target. Keep the platform interface backend-neutral so Metal can replace GLES later.
- Implement SDL lifecycle handling for background/foreground, interruptions and orientation.
- Wire touch events and game-controller discovery into a small input diagnostic overlay/log.
- Open the audio device and run a safe test callback with no retail audio assets.
- Add N1 CI compile checks.

Do not yet try to compile the full Source engine.

Acceptance:
- Physical iPhone can present a continuously clearing SDL GLES3 frame.
- Touch event coordinates and controller connect/disconnect events appear in latest-only diagnostics.
- Audio device opens cleanly.
- Suspend/resume does not crash or recreate resources endlessly.
```

# Prompt 2 — N2 Source foundation libraries

```text
Using the global preamble, implement N2: native arm64 Source foundation libraries.

Compile incrementally as static libraries in this order unless dependency analysis proves a slightly different ordering is required:
- tier0
- tier1
- mathlib
- vstdlib
- appframework
- filesystem_stdio
- datacache
- inputsystem platform-neutral portions
- IVP/vphysics foundation

Rules:
- Create an iOS platform configuration layer rather than spraying unrelated #ifdefs through Source.
- Exclude Emscripten/WebAssembly code from the iOS target.
- Replace unsupported desktop/Linux APIs with small native adapters.
- Use libc++, C++17, arm64, native pthread/std::thread.
- Do not hide compiler errors with blanket warning suppression.
- Keep asserts in debug builds.
- Add small deterministic tests/smoke executables or unit-style calls for mathlib, filesystem read/seek and IVP stepping.
- Do not add Portal retail files as fixtures. Create synthetic text/binary fixtures in the repository.

Acceptance:
- All listed foundation libraries build for iphoneos arm64.
- Filesystem test reads/seeks a synthetic file in app-accessible storage.
- Mathlib test passes deterministic vector/matrix checks.
- IVP test creates, steps and destroys a trivial physics world without leaks/crash.
```

# Prompt 3 — N3 static Source module registry

```text
Using the global preamble, implement N3: static Source module registry for iOS.

Problem:
Desktop/web startup expects modules such as engine, filesystem_stdio, materialsystem, shaderapidx9, client and server to be dynamically loaded. Native iOS should link the required modules into the app and resolve Source factories through a registry.

Implement:
- platform/ios/source_module_registry.h/.cpp or an equivalent focused location.
- Canonical module-name normalization accepting forms such as engine, engine.dll, libengine.so but mapping them to one logical module ID.
- Registry entries for each linked module factory as the modules become available.
- iOS implementations/hooks for Sys_LoadModule, Sys_UnloadModule, Sys_GetFactory and related factory lookup paths.
- Reference counting/lifetime semantics sufficient for Source expectations even though code is statically linked.
- Exact diagnostic on unknown module/interface version.
- Tests using fake factories before full engine integration.

Do not use arbitrary executable-code dlopen as a workaround.

Acceptance:
- Fake module-registry tests pass.
- Linked Source foundation module factories resolve by the same logical names used by engine startup.
- Unknown modules fail with module name + requested interface version.
```

# Prompt 4 — N4 Portal importer and native VPK I/O

```text
Using the global preamble, implement N4: user-owned Portal data import/authorization and native VPK access.

Requirements:
- Extend the Files folder picker from N0.
- Validate a selected Portal root using portal/gameinfo.txt plus portal/, hl2/, platform/ and expected VPK structure.
- Build a small import manifest with relative paths, sizes and useful fingerprints; do not hash multi-gigabyte content blindly if it creates long waits.
- Decide and implement the safest iOS storage model:
  A. persistent security-scoped access if reliable for the chosen provider; or
  B. explicit copy/import into Application Support/Render360Portal/Game.
- If copying, provide progress and free-space checks and avoid unnecessary duplicate temporary copies.
- Native Source filesystem/VPK path must use seekable file descriptors/FILE streams and range reads.
- Never read an entire VPK or BSP into RAM merely to mount it.
- Preserve Valve/Source VPK parsing code wherever possible.
- Add a verifier that opens the directory VPK and reads a known metadata/small asset entry chosen from the user's files at runtime, not from repository fixtures.

Security/legal constraint:
No retail asset is committed or uploaded to GitHub Actions.

Acceptance:
- Imported/authorized Portal root survives the chosen persistence model.
- Source filesystem can open gameinfo.txt and VPK directory/archive parts.
- Mounting a large VPK does not allocate memory close to the VPK's total size.
```

# Prompt 5 — N5 native Source launcher + PreInit

```text
Using the global preamble, implement N5: native Source launcher through successful PreInit/main-loop entry.

Tasks:
- Port the launcher away from browser/native-executable path assumptions.
- Explicitly establish base dir/game dir from the native imported Portal root.
- Link and register the modules required through this startup stage.
- Initialize filesystem_stdio, engine-facing app framework, input and material interfaces as required.
- Keep latest-only phase checkpoints. Suggested checkpoints:
  ios-launcher-enter
  filesystem-ready
  gameinfo-found
  factories-ready
  engine-create-enter
  engine-create-done
  engine-preinit-enter
  engine-preinit-done
  engine-mainloop-enter
- If Source returns early, capture the return code and the last failing subsystem rather than reporting generic app success.
- Preserve normal Source shutdown semantics.

Do not begin faking renderer success. If renderer initialization is the blocker, stop at the exact renderer boundary and hand it to N6.

Acceptance:
- Source reaches the expected main-loop entry on device or diagnostics identify the exact renderer-dependent boundary.
- No WebAssembly or .data package startup remains.
```

# Prompt 6 — N6 GLES3/ToGL compatibility renderer

```text
Using the global preamble, implement N6: real Source rendering bring-up using native OpenGL ES 3.0 as the temporary compatibility backend.

Start by auditing the existing ToGL/OpenGL calls encountered on the web port, including known desktop-only assumptions such as:
- glAlphaFunc / fixed-function remnants
- glColor4f
- glClientActiveTexture
- glDrawRangeElementsBaseVertex / base-vertex behavior
- glGetTexLevelParameteriv
- framebuffer/blit extension differences
- buffer mapping/storage
- fences/sync
- texture formats/compression
- GLSL desktop vs GLSL ES syntax/precision

Implementation rules:
- Do not report unsupported extensions as supported just to bypass checks.
- Implement compatibility only when the Source semantics can be preserved.
- Add a capabilities table produced at runtime.
- Separate platform GL/GLES adaptation from material/game logic.
- Create debug validation around shader compile/link and framebuffer completeness.
- Keep OpenGL ES as a bring-up backend; structure it so a Metal backend can be added later.

Acceptance:
- Native Source creates the renderer and presents real Source-generated frames.
- No browser WebGL/ToGL JS bridge exists.
- Shader/material failures name the exact shader/material and GLES error.
```

# Prompt 7 — N7 real Portal background1

```text
Using the global preamble, implement N7: render Portal background1 and menu using user-owned retail data.

Memory policy:
- background1 and menu-required resources only.
- zero chamber BSP preloads.
- load shader/material families only as requested.

Tasks:
- Run Source's real map loading for background1.
- Resolve missing materials/models/shaders iteratively from the user's VPKs.
- Add latest missing-resource diagnostics.
- Ensure menu UI/input can appear over the rendered background.
- Track resident memory before map load, after world load and after first stable frame.

Acceptance:
- Real background1 world geometry is visible on iPhone.
- Menu is interactive.
- No test chamber map is resident at menu.
```

# Prompt 8 — N8 first playable chamber

```text
Using the global preamble, implement N8: testchmb_a_00 with real client/server gameplay.

Bring up:
- client and server modules through the static registry
- player spawn
- world collision
- VPhysics/IVP
- buttons/doors/cubes required by chamber 00
- sound emitter system
- required particles/decals
- portal game rules and portal placement dependencies needed by this map

Do not globally enable every Source subsystem if chamber 00 does not require it yet. Expand from measured missing dependencies.

Acceptance:
- testchmb_a_00 loads from user-owned data.
- player can move and collide with the world.
- basic chamber interactions work.
- memory snapshot is recorded and compared with menu.
```

# Prompt 9 — N9 touch + controller input

```text
Using the global preamble, implement N9: production-quality iPhone input.

Touch UI:
- left movement stick
- right look region/stick
- jump
- use/interact
- primary portal
- secondary portal
- crouch if required
- pause/menu
- optional gyro toggle

Rules:
- map controls into Source input actions; do not hardwire gameplay changes.
- support safe areas and all landscape orientations.
- multi-touch must allow move + look + action simultaneously.
- automatically hide/minimize touch UI when a hardware controller is active, with user override.
- add dead zones/sensitivity/acceleration settings.
- keep UI draw cost and allocations near zero per frame.

Acceptance:
- chamber 00 is fully navigable with touch.
- standard controller mapping works.
- no stuck-touch state after interruption/control-center/backgrounding.
```

# Prompt 10 — N10 current-map-only memory lifecycle

```text
Using the global preamble, implement and verify N10: current-map-only memory behavior.

Required behavior:
MENU = engine/shared + background1 only.
CHAMBER = engine/shared + active BSP + bounded cache.
TRANSITION = temporary overlap only where Source requires it; old map released immediately after safe changelevel boundary.

Tasks:
- Instrument map lifecycle and native resident memory.
- Confirm Source releases old world/model references.
- Purge unreferenced models after safe shutdown boundary.
- Uncache only unused materials/textures; never flush live shared UI/common assets.
- Detect monotonic accumulation over repeated map changes.
- Add debug command/overlay showing active map, resident memory, model/material counts and cache budget.
- Do not implement whole-next-map preload.

Test route:
background1 -> testchmb_a_00 -> testchmb_a_01 -> testchmb_a_00 (developer command if necessary) repeated at least 3 cycles.

Acceptance:
- old BSP/world residency does not remain after transition.
- repeated route does not show unbounded memory growth.
```

# Prompt 11 — N11 hidden loading transitions

```text
Using the global preamble, implement N11: hide map loading without trading away the iPhone 11 memory savings.

Use Portal/Aperture visual language:
- elevator/airlock door close
- short fade/lighting cue if appropriate
- preserve last valid frame only if doing so does not duplicate a large render target
- tiny native transition animation remains responsive while old map unload/new map load happens
- open only after first safe new-map frame
- destroy transition UI/resources immediately after completion

Optimization rules:
- no full next-map preload
- optional pre-read limited to tiny headers/manifests or known small shared resources after measuring benefit
- if transition is faster than the mask threshold, avoid showing a distracting fake loading sequence
- if load is slow, keep animation responsive and never expose half-loaded geometry
- audio transition cues may continue if they do not retain old map resources

Acceptance:
- player does not see long frozen black screens between the first tested chambers.
- transition mechanism adds negligible steady-state memory after it closes.
- current-map-only tests still pass.
```

# Prompt 12 — N12 iPhone 11 performance/thermal pass

```text
Using the global preamble, implement N12: measured iPhone 11 optimization.

Create a repeatable benchmark route and collect:
- average FPS
- 1% low FPS or equivalent frame-time percentile
- CPU frame time
- GPU frame time where available
- resident memory and peak transition memory
- texture/resource cache sizes
- VPK read latency
- shader compile stalls
- thermalState changes
- audio underruns

Then optimize in evidence-driven order. Candidate areas:
- internal render resolution and dynamic resolution option
- texture mip/residency policy
- ASTC/native compression opportunities without redistributing assets
- MSAA/anisotropy defaults
- shadow/post-processing cost
- shader permutation cache
- render-state churn
- VPK read size/cache policy
- particle limits
- physics hot spots

Do not quote FPS gains unless measured on device using the same route/settings.

Acceptance:
- publish docs/IOS_NATIVE_IPHONE11_PROFILE.md with before/after measurements and exact settings.
```

# Prompt 13 — N13 Metal renderer migration

```text
Using the global preamble, begin N13 only after GLES gameplay is proven.

Goal:
Replace deprecated OpenGL ES incrementally with Metal while keeping Source gameplay, filesystem, physics and resource-management code unchanged.

Architecture:
Create a backend boundary so both GLES3 (reference) and Metal can render the same Source commands during migration.

Order:
1. presentation/swapchain
2. command buffers and frame lifecycle
3. vertex/index buffers
4. textures/samplers and format mapping
5. render targets/depth-stencil
6. shader translation/compilation/reflection strategy
7. pipeline/state caches
8. synchronization/fences
9. queries/timers where Source depends on them
10. performance specialization for Apple GPU tile-based rendering

Rules:
- keep visual comparison captures for background1/chamber00.
- do not remove GLES until Metal has required feature parity and debugging value is exhausted.
- avoid runtime shader translation stalls where an offline/cacheable pipeline can be built from user-owned shader inputs without redistributing retail assets.

Acceptance:
- Metal renders background1 and chamber00 to functional parity.
- Metal becomes default only after memory/frame-time measurements beat or justify replacing GLES.
```

# Prompt 14 — N14 production IPA/release pipeline

```text
Using the global preamble, finish N14: production-oriented IPA automation.

Tasks:
- produce unsigned IPA artifact on every relevant ios-native push.
- produce signed development/ad-hoc IPA through manual workflow when signing secrets are configured.
- upload dSYM/symbol artifacts separately.
- generate build manifest with commit, Xcode/clang version, architecture, bundle ID, renderer backend, feature gates and retail_assets_bundled=false.
- verify code signature for signed build.
- verify IPA contains no VPK/BSP/VTF/VCS/WAV retail assets.
- add clear installation notes for signed vs unsigned IPA.
- never print certificate/profile secret material.

Acceptance:
- clean GitHub-hosted macOS runner produces artifacts reproducibly.
- signed IPA installs on a device included by its provisioning profile.
- unsigned IPA is clearly labeled as requiring external signing.
```

---

# Bug-fix prompt — use whenever a device run fails

```text
Work on matthewcodergamer/source-engine-render360, branch render360/ios-native.
Read the native master plan and the current phase before changing code.

A physical iPhone run failed. Treat the supplied newest diagnostic/checkpoint as authoritative. Do not respond by increasing memory limits, disabling asserts globally, skipping the failing subsystem, or substituting a fake renderer.

Procedure:
1. Identify the last confirmed successful phase.
2. Identify the first failed/returned subsystem.
3. Inspect the exact native code path and current CI artifacts.
4. Reproduce with a minimal synthetic test where possible.
5. Fix the root cause with the smallest platform-correct change.
6. Preserve current-map-only memory policy and retail-asset boundary.
7. Add a regression guard/checkpoint/test.
8. Build in GitHub Actions and inspect concrete compiler/linker/test failures until CI is green.
9. Report separately what is CI-proven and what still requires physical iPhone verification.

Do not accumulate giant logs. Keep the latest actionable error plus a compact native state snapshot.
```

# Gauntlet review prompt — run after each major milestone

```text
Act as a blind senior engine-port reviewer. Review the current render360/ios-native phase without assuming the implementation is correct.

Attack these failure classes:
- accidentally using browser/WebAssembly infrastructure in native code
- bundling or downloading retail Portal data
- fake renderer/gameplay shortcuts
- whole-VPK or whole-map memory copies
- cumulative map residency
- stale resources after changelevel
- desktop OpenGL assumptions hidden behind extension lies
- unsafe static module lifetime/factory resolution
- iOS lifecycle/backgrounding crashes
- touch input stuck states
- code-signing secret exposure
- CI that packages an IPA but does not verify arm64/signature/content
- claims of FPS/memory wins without device measurements

Return:
A. blockers
B. high-risk bugs
C. missing regression tests
D. memory/performance risks
E. legal/asset-boundary risks
F. exact files/changes required before the phase can be called complete.

Then implement the justified fixes, rerun CI, and repeat the review once.
```

# Master autonomous continuation prompt

```text
Continue Render360 Portal native iOS from its current completed gate to the next incomplete gate in docs/IOS_NATIVE_MASTER_PLAN.md.

Do not skip gates. Do not redo completed work unnecessarily. Inspect the branch and CI first, choose the next smallest production-valid milestone, implement it, add/adjust regression checks, run GitHub Actions, fix concrete failures, update docs, and stop only when either:
- the phase's CI-verifiable acceptance conditions pass and the next step requires a physical iPhone/device-only result, or
- a genuinely external requirement is missing (for example Apple signing credentials).

Never bundle Portal retail data. Never replace Source with a mock. Keep the iPhone 11 current-map-only memory policy intact.
```
