# Render360 Portal Native iOS — Zero-to-IPA Prompt Pack

Canonical execution prompts for `matthewcodergamer/source-engine-render360` on branch `render360/ios-native`.

This file is meant to be pasted into an implementation-capable coding agent phase by phase. It is not a design-only roadmap. Every phase must inspect the repository, make production code changes, run the strongest available checks, inspect GitHub Actions failures when accessible, and leave the branch in a strictly better state.

## Mission

Build a real native ARM64 iOS Source/Portal application and package it as an IPA. Preserve the existing browser/WebAssembly work as reference only. The native app must use the user's own legally obtained Portal files at runtime; retail Valve assets must never be committed to the repository or bundled into CI artifacts.

The first device performance floor is iPhone 11.

## Current repository baseline

At the time this prompt pack was created:

- Branch `render360/ios-native` already exists and is the primary native-iPhone branch.
- `ios-native/CMakeLists.txt` intentionally builds only a small UIKit ARM64 bootstrap target.
- `.github/workflows/ios-native.yml` builds an unsigned ARM64 IPA artifact.
- `.github/workflows/ios-native-signed.yml` contains a manual signed-IPA path based on an Apple certificate, provisioning profile, GitHub Secrets and repository variables.
- The native project has not earned a gameplay milestone merely because the bootstrap IPA packages successfully.
- Existing docs in `docs/IOS_NATIVE_MASTER_PLAN.md`, `docs/IOS_NATIVE_ARCHITECTURE.md`, `docs/IOS_NATIVE_BUILD_AND_SIGNING.md`, and `docs/IOS_NATIVE_AI_PROMPTS.md` remain useful and must be read before implementation.

## Verified platform facts to respect

1. SDL2 has an official iOS integration path using its iOS/Xcode project/framework and UIKit main glue. Reuse that path or an equivalently reproducible source build; do not invent a custom window/input/audio stack without a measured reason.
2. iOS still exposes OpenGL ES 1.1/2.0/3.0, but Apple marks OpenGL ES deprecated and recommends Metal. Therefore GLES3 is a temporary compatibility/bring-up backend, not the final long-term graphics strategy.
3. Files selected outside the app sandbox through a document/folder picker can require security-scoped access. Correctly start/stop access and coordinate external reads, or explicitly copy the chosen game files into the app's Application Support storage.
4. GitHub Actions can sign Xcode apps by installing a certificate into a temporary keychain and installing a provisioning profile on a macOS runner. Secrets must never be echoed or committed.
5. An unsigned IPA is only a packaging/build artifact. A normal iPhone installation still requires a valid signature/provisioning method.

## Global implementation preamble

Prepend this block to every phase prompt below.

```text
Repository: matthewcodergamer/source-engine-render360
Branch: render360/ios-native
Primary device floor: iPhone 11
Primary architecture: arm64 iphoneos

You are the lead engine/platform programmer for the native iOS port of Render360 Portal.

READ BEFORE EDITING:
- ios-native/README.md
- docs/IOS_NATIVE_MASTER_PLAN.md
- docs/IOS_NATIVE_ARCHITECTURE.md
- docs/IOS_NATIVE_BUILD_AND_SIGNING.md
- docs/IOS_NATIVE_AI_PROMPTS.md
- docs/IOS_NATIVE_ZERO_TO_IPA_PROMPT_PACK.md
- .gitmodules
- .github/workflows/ios-native.yml
- .github/workflows/ios-native-signed.yml
- every source/build file changed by the previous completed phase

NON-NEGOTIABLE RULES:
1. Build the real Source/Portal runtime. Never substitute a webpage, fake renderer, video, static screenshot, mocked level, fake gameplay shell, or menu-only prototype for an engine milestone.
2. Do not commit or bundle Portal retail VPK/BSP/VTF/VMT/WAV/MP3/VCS/game binaries or other Valve retail data. Runtime import must use files owned by the user.
3. Preserve existing WebAssembly branches and web-port history. Do not delete working browser code merely because native iOS is now primary.
4. Native iOS must not depend on MEMFS, WORKERFS, SharedArrayBuffer, COOP/COEP, service workers, JavaScript File objects, browser pthread proxying, or hl2_launcher.data.
5. Prefer focused iOS platform adapters and backend boundaries over broad invasive Source rewrites.
6. Do not use arbitrary downloaded executable code or arbitrary plugin dlopen as a shortcut. Link required Source modules into the application and resolve their interfaces through a built-in registry unless a specific Apple-supported framework is intentionally dynamic.
7. Preserve current-map-only residency: menu background only at menu; current BSP plus bounded shared caches in gameplay; no cumulative old-map residency; no full future-map prefetch on the iPhone 11 profile unless device measurements prove safe headroom.
8. Never load entire VPK/BSP archives into RAM only to obtain random access. Use seekable native file I/O and bounded caches.
9. Every stage must distinguish: compile-proven, CI-proven, simulator-proven, and physical-device-proven. Do not claim a physical-device milestone without evidence from a real device.
10. Keep diagnostics concise and latest-actionable. Record the last phase/subsystem/error and avoid unbounded logs in memory.
11. Do not silence errors with blanket warning disables, unsupported capability lies, unconditional success returns, or no-op stubs that hide required engine behavior.
12. Keep commits phase-scoped. Update documentation and acceptance checks whenever architecture changes.
13. Before editing, inspect current code and CI so you do not recreate files/features already present.
14. After editing, run all practical build/static tests. If a workflow fails, inspect the failing job/step/log, fix the concrete cause, and rerun. Do not stop at the first CI error if it is repairable.
15. When blocked by a physical-device-only issue, leave exact device steps and the exact log/checkpoint needed next; do not fabricate success.

OUTPUT AFTER EACH PHASE:
- Files changed
- Why each change was necessary
- Commands/tests run
- CI run/result if available
- Current last-success checkpoint
- Current first-failure checkpoint
- Memory/performance observations if applicable
- Exact next phase
```

---

# Prompt 00 — Audit, baseline and branch safety

```text
Use the global implementation preamble.

Goal: establish the exact native-iOS starting point and prevent accidental regression of the web work.

Tasks:
- Inventory ios-native/, the native workflows, relevant Source directories, submodules and third-party libraries.
- Confirm current N0 bootstrap scope and identify which native milestones are implemented versus documentation-only.
- Identify Emscripten-only files/defines/build assumptions that must never enter the iOS target.
- Identify desktop/Linux APIs likely to need iOS adapters: dynamic module loading, filesystem paths, threading/TLS, timing, sockets if needed, signals, process APIs, graphics context creation, input, audio.
- Confirm submodule versions/commits and document reproducibility risks.
- Verify retail Portal data is absent from ios-native/ and workflow inputs.
- Verify both unsigned and signed workflows are syntactically and architecturally consistent with the current native target.
- Create or update docs/IOS_NATIVE_PORTING_AUDIT.md with a module dependency map, platform blockers, graphics blockers, importer/filesystem blockers, audio/input blockers, and a status table for N0 through final release.
- Do not add full-engine code in this audit unless fixing an obvious bootstrap/CI defect.

Acceptance:
- Audit names exact next source files/directories for N1/N2.
- Unsigned bootstrap workflow can create an arm64 IPA artifact, or the exact CI blocker is fixed/documented.
- No retail Portal data is introduced.
```

# Prompt 01 — N0 bootstrap hardening and real IPA proof

```text
Use the global implementation preamble.

Goal: make the existing tiny UIKit bootstrap a trustworthy foundation before layering SDL/Source on top.

Tasks:
- Verify CMake generates an Xcode project for iphoneos arm64 with the intended deployment target and bundle identifier.
- Verify Info.plist orientation, document import capability and required usage/configuration keys are correct for the current bootstrap.
- Add a native diagnostic screen containing app version/commit, architecture, OS version, memory warning count and last native checkpoint. Keep it simple; this screen is temporary bootstrap diagnostics, not the game UI.
- Verify the app launches without Portal files and offers a user-facing import/setup entry point rather than crashing.
- Verify the unsigned workflow checks the executable architecture and packages Payload/Render360Portal.app correctly.
- Do not call N0 complete based only on CMake configure. Require artifact creation.

Acceptance:
- CI produces Render360-Portal-iOS-unsigned.ipa containing an arm64 executable.
- Bootstrap launches on a signed/sideloaded physical iPhone when the user signs it.
- Missing game data is handled as setup state, not fatal startup.
```

# Prompt 02 — N1 SDL2 iOS window, lifecycle, input and audio host

```text
Use the global implementation preamble.

Goal: replace the temporary UIKit-only game host with a reproducible SDL2 iOS runtime while retaining UIKit only where it is the better native UI tool (for example the file importer).

Tasks:
- Pin an SDL2 source/release revision and document it. Prefer the official SDL iOS project/framework/source path; do not check in an unexplained opaque binary.
- Integrate SDL into CMake/Xcode reproducibly on GitHub macOS runners.
- Create the SDL iOS entry path using the expected UIKit SDL main glue.
- Create a landscape game window.
- Create a GLES 3.0 context as a temporary rendering bootstrap only; place context creation behind a renderer-backend interface that can later host Metal.
- Correctly use point size versus drawable pixel size on Retina displays.
- Wire background/foreground, resign-active/active, audio interruption, memory warning and orientation events into a native lifecycle service.
- Wire touch events and controller connect/disconnect into a diagnostic input layer.
- Open an SDL/CoreAudio-backed audio device with a synthetic silence/test callback only; no retail audio fixtures.
- Prevent repeated context/audio recreation loops on resume.

Acceptance:
- Physical iPhone can display a continuously clearing native SDL/GLES frame.
- Touch coordinates and controller state are observable in latest-only diagnostics.
- Audio device opens and survives interruption/resume.
- Unsigned IPA CI still packages successfully.
```

# Prompt 03 — N2 native Source foundation build graph

```text
Use the global implementation preamble.

Goal: compile reusable Source foundation libraries for iphoneos arm64 without pulling browser-only architecture into the native target.

Start with dependency analysis, then incrementally add static libraries. Expected early order:
- tier0
- tier1
- mathlib
- vstdlib
- appframework
- filesystem_stdio
- datacache
- inputsystem platform-neutral pieces
- IVP/source-physics foundation needed by vphysics

Tasks:
- Create a focused iOS platform config header/toolchain layer.
- Use libc++ and modern Clang; keep project language compatibility aligned with existing Source code while allowing the host to use C++17.
- Replace unsupported POSIX/desktop calls only through narrow adapters.
- Handle endianness, alignment, atomics, TLS, timing and thread naming deliberately; do not assume x86 behavior.
- Use native pthread/std::thread paths where Source permits.
- Add synthetic smoke tests for math, file read/seek, thread/TLS and a tiny IVP physics step.
- Never use Portal retail assets as tests.

Acceptance:
- Foundation libraries compile for iphoneos arm64 in CI.
- Synthetic filesystem random-access test passes.
- Thread/TLS test passes.
- Deterministic math checks pass.
- Tiny physics create/step/destroy check passes once physics foundation is included.
```

# Prompt 04 — N2B iOS platform shim completion

```text
Use the global implementation preamble.

Goal: make platform assumptions explicit before engine startup grows complicated.

Audit and implement only the shims actually required by the code being linked:
- paths and app-support directories
- monotonic/high-resolution timers
- sleep/yield
- pthread/TLS primitives
- atomic/barrier behavior
- filesystem stat/seek/truncate/mkdir/enumeration
- environment/command-line abstraction where Source expects it
- sockets only if a required local subsystem actually needs them
- crash/assert/checkpoint reporting

Rules:
- Do not emulate fork/exec/process launching if the native game does not need it.
- Do not disable asserts globally.
- Do not turn fatal missing-platform behavior into silent success.
- Record unsupported APIs with caller/module name.

Acceptance:
- Source foundation tests do not rely on Emscripten or browser helpers.
- Unsupported calls fail loudly and diagnostically.
```

# Prompt 05 — N3 static Source module/interface registry

```text
Use the global implementation preamble.

Goal: replace desktop/web runtime module loading with built-in native module factories.

Implement a native registry that can normalize logical names such as:
- engine / engine.dll / libengine.so
- filesystem_stdio variants
- materialsystem
- shaderapidx9 logical request mapped to the iOS renderer-facing implementation
- client
- server
- other modules only when required

Tasks:
- Create a focused source_module_registry implementation.
- Preserve Source CreateInterface semantics and interface version matching.
- Add reference/lifetime accounting compatible with Source expectations even though code is statically linked.
- Hook Sys_LoadModule, Sys_UnloadModule, Sys_GetFactory or their actual equivalents for RENDER360_IOS_NATIVE.
- Add fake-factory tests before relying on real engine modules.
- Emit exact unknown-module and unknown-interface diagnostics.

Acceptance:
- Fake registry tests pass.
- Linked foundation interfaces resolve by canonical Source names.
- No arbitrary executable-code dlopen path is required for startup.
```

# Prompt 06 — N4 Portal folder importer, persistence and validation

```text
Use the global implementation preamble.

Goal: allow a user to select their own Portal installation through iOS Files and make it reliably accessible to Source.

Tasks:
- Use UIDocumentPickerViewController/folder import or the current modern equivalent already chosen by the project.
- Treat external URLs as security scoped where required: start access before reads, stop access when finished, and coordinate external access correctly.
- Decide one reliable persistence strategy and document it:
  A) copy the required user-owned game tree into Application Support/Render360Portal/Game, or
  B) persist only a valid security-scoped bookmark/access model proven to survive relaunch/provider behavior.
- Prefer Application Support import if it substantially simplifies long-running random access and provider reliability.
- Validate portal/gameinfo.txt and expected portal/hl2/platform layout.
- Discover VPK directory/archive parts without loading archives wholesale.
- Check available storage before a large copy.
- Show cancellable progress and avoid a second full temporary copy.
- Create a lightweight manifest of relative paths/sizes/fingerprints sufficient to detect obviously changed/missing imports.
- Never upload user game files to CI or GitHub.

Acceptance:
- App relaunch can resolve the chosen/imported Portal root.
- Invalid folders produce a precise reason and let the user choose again.
- Large-file import does not spike RAM near total game size.
```

# Prompt 07 — N4B native Source filesystem and VPK random access

```text
Use the global implementation preamble.

Goal: make Source read the user's Portal data through native seekable I/O.

Tasks:
- Reuse Source filesystem/VPK parsing wherever possible.
- Map Source search paths to the native imported root.
- Ensure FILE/fd reads, seek/tell, archive part access and directory enumeration are correct on iOS.
- Do not unpack every VPK simply to make startup easier.
- Add bounded metadata/archive-handle caches.
- Add runtime verifier checkpoints:
  gameinfo-open
  searchpaths-built
  vpk-dir-open
  vpk-entry-resolved
  small-entry-read
- The verifier must choose an entry from the user's files at runtime; do not add retail fixtures.

Acceptance:
- Source filesystem can find gameinfo.txt and mount the required VPKs.
- Random entry reads work without whole-archive allocation.
```

# Prompt 08 — N5 real native launcher through PreInit

```text
Use the global implementation preamble.

Goal: execute the real Source startup sequence until the renderer becomes the first legitimate blocker.

Tasks:
- Port launcher/bootstrap path assumptions to iOS.
- Build command line/base directory/game directory from the imported Portal root.
- Link/register required modules incrementally.
- Keep exact latest checkpoints:
  ios-launcher-enter
  filesystem-ready
  gameinfo-found
  factories-ready
  engine-create-enter
  engine-create-done
  engine-preinit-enter
  engine-preinit-done
  engine-mainloop-enter
- Capture actual return/error codes.
- Preserve normal Source shutdown paths.
- If renderer initialization blocks progress, stop at the exact renderer call/capability and hand the problem to Prompt 09; do not fake renderer success.

Acceptance:
- Engine reaches PreInit/main-loop boundary, or the exact renderer boundary is proven with a concrete diagnostic.
- No hl2_launcher.data/browser startup remains.
```

# Prompt 09 — N6 GLES3/ToGL compatibility renderer bring-up

```text
Use the global implementation preamble.

Goal: produce real Source-generated native frames as quickly as possible using GLES3 as a temporary compatibility backend.

Audit every desktop/OpenGL assumption actually reached by the port. Pay special attention to:
- fixed-function remnants such as alpha/color/client texture state
- base-vertex draw semantics
- texture-level queries
- FBO/blit differences
- buffer mapping/storage flags
- sync/fences
- texture/internal format support
- sRGB/depth/stencil behavior
- compression formats
- GLSL desktop versus GLSL ES version/precision/output syntax
- extension checks

Rules:
- Never report an extension/capability as present when the device does not support it.
- Emulate only semantics that can be made correct.
- Centralize GL-to-GLES adaptation; do not scatter game-specific hacks through materials.
- Log shader compile/link errors with shader identity and transformed source location where possible.
- Validate framebuffer completeness in debug builds.
- Maintain a runtime GPU/capability report.
- Keep the backend interface suitable for later Metal implementation.

Acceptance:
- Source creates a real renderer and presents Source-generated frames.
- No WebGL JavaScript bridge is used.
- Renderer failures identify exact unsupported state/format/shader rather than generic black screen.
```

# Prompt 10 — N7 Portal background1 and real menu

```text
Use the global implementation preamble.

Goal: render the real Portal background1 world using user-owned data and make the menu interactive.

Tasks:
- Drive the real Source map-load path for background1.
- Resolve required material/model/shader families iteratively.
- Add latest missing-resource diagnostics.
- Bring VGUI/menu/input up over the rendered background as appropriate to this branch.
- Record resident memory before load, after world load and after first stable frame.
- Keep chamber BSPs unloaded while at menu.

Acceptance:
- Real background1 geometry is visible on iPhone.
- Menu is interactive.
- No test chamber is resident during menu.
```

# Prompt 11 — N8 client/server, chamber 00 and gameplay systems

```text
Use the global implementation preamble.

Goal: load testchmb_a_00 with the real Source client/server simulation and enough Portal gameplay to navigate the chamber.

Bring up only dependencies demanded by the map, including as needed:
- client/server factories
- player spawn
- world collision
- IVP/VPhysics
- doors/buttons/cubes
- sound emitter path
- particles/decals required by the map
- Portal game rules
- portal placement/rendering dependencies

Rules:
- Expand by concrete missing dependency, not by enabling every engine subsystem blindly.
- Do not replace broken entities with fake native UI.
- Record first-frame and gameplay memory.

Acceptance:
- testchmb_a_00 loads from user-owned files.
- Player can spawn, move and collide.
- Required basic chamber interactions work.
```

# Prompt 12 — N9 production touch, controller, gyro and audio

```text
Use the global implementation preamble.

Goal: make chamber gameplay usable on iPhone rather than merely visible.

Touch controls:
- left movement stick
- right look region/stick
- jump
- use/interact
- primary portal
- secondary portal
- crouch where required
- pause/menu
- optional gyro aim/look toggle

Tasks:
- Map controls through Source input actions rather than modifying game logic.
- Respect landscape safe areas.
- Support simultaneous move + look + action multi-touch.
- Add sensitivity, dead-zone and acceleration settings.
- Prevent stuck touches after notification center/control center/background/interruption.
- Support standard iOS game controllers and minimize/hide touch controls while controller is active, with user override.
- Finish Source audio path through SDL/CoreAudio and handle interruptions without retaining stale map resources.

Acceptance:
- Chamber 00 is navigable using touch alone.
- Standard controller path works.
- Audio survives interruption/resume without permanent device loss.
```

# Prompt 13 — N10 current-map-only memory lifecycle

```text
Use the global implementation preamble.

Goal: preserve the most important memory optimization from the web work in the native app.

Required state model:
MENU = engine/shared + background1 only.
GAMEPLAY = engine/shared + active BSP + bounded caches.
TRANSITION = only minimal temporary overlap required by safe Source changelevel behavior.

Tasks:
- Instrument native resident/physical footprint where available plus Source model/material/cache counts.
- Verify world teardown releases old BSP/world references.
- Purge only genuinely unreferenced models/materials/textures at safe lifecycle boundaries.
- Do not flush live shared UI/common resources every map.
- Detect monotonic growth across repeated transitions.
- Add a developer overlay/command: active map, memory, model count, material/texture/cache counts, transition peak.
- Test background1 -> testchmb_a_00 -> testchmb_a_01 -> testchmb_a_00 for at least 3 cycles using a developer route if needed.

Acceptance:
- Old world/BSP residency does not remain indefinitely after transition.
- Repeated route does not grow without bound.
- No whole-next-map prefetch is introduced to hide loading.
```

# Prompt 14 — N11 Aperture-style hidden loading transitions

```text
Use the global implementation preamble.

Goal: hide unavoidable current-map-only load stalls without defeating the memory policy.

Implement a lightweight transition layer using Portal/Aperture language:
- elevator/airlock/door close
- optional short fade/lighting cue
- responsive tiny native/game overlay while map unload/load executes
- open only after first safe frame of the new map
- destroy transition resources immediately afterward

Rules:
- no full next-map preload
- optional tiny metadata/header pre-read only after measurement
- do not force a long fake loading animation when transition is already fast
- avoid duplicating large render targets just to hold a frame
- never show half-loaded world geometry

Acceptance:
- Tested chamber transitions no longer expose long frozen/half-loaded visuals.
- Transition adds negligible steady-state memory after closing.
- Prompt 13 memory tests still pass.
```

# Prompt 15 — N12 iPhone 11 performance, memory and thermal pass

```text
Use the global implementation preamble.

Goal: optimize from measurements on iPhone 11, not assumptions.

Create a repeatable benchmark route and record:
- average FPS
- frame-time percentiles / 1% low equivalent
- CPU frame time
- GPU frame time when available
- resident memory
- transition peak memory
- VPK read latency
- shader compile/link stalls
- texture/cache sizes
- audio underruns
- iOS thermal state changes

Potential optimization areas, only when measured:
- internal render resolution / dynamic resolution
- texture mip/residency policy
- anisotropy/MSAA defaults
- shadows and post effects
- render-state churn
- shader/pipeline caches
- VPK read chunk/cache policy
- particle density
- physics hot spots
- unnecessary background work

Rules:
- Do not claim an FPS or memory gain without same-route before/after numbers.
- Do not degrade correctness to hit a number silently; expose quality tiers/settings.
- Keep iPhone 11 as the minimum performance profile even if newer devices get higher defaults.

Acceptance:
- Create/update docs/IOS_NATIVE_IPHONE11_PROFILE.md with exact device/iOS/build/settings and before/after measurements.
```

# Prompt 16 — N13 Metal backend migration

```text
Use the global implementation preamble.

Start only after GLES gameplay is proven.

Goal: replace deprecated GLES incrementally with a native Metal backend while keeping Source gameplay/filesystem/physics/resource logic unchanged.

Maintain a renderer-backend boundary and migrate in controlled order:
1. presentation surface/frame lifecycle
2. command buffers
3. vertex/index buffers
4. textures/samplers/format mapping
5. depth/stencil/render targets
6. shader strategy: translation/rewriting/reflection and validation
7. pipeline/state cache
8. synchronization/fences
9. GPU timing/debug markers where useful
10. Portal-specific render features and parity fixes

Rules:
- Keep GLES as a reference backend until Metal reaches functional parity.
- Build automated render-path sanity tests where possible using synthetic primitives/materials.
- Do not delete the working GLES path at the first successful Metal triangle.
- Make Metal default only after background1/chamber gameplay parity and measured stability/performance.

Acceptance:
- Metal renders background1 and chamber00 with required gameplay visuals.
- Metal is default only after parity plus device measurements justify the switch.
```

# Prompt 17 — N14 signed IPA, artifact verification and install handoff

```text
Use the global implementation preamble.

Goal: produce trustworthy unsigned and signed IPA artifacts from GitHub Actions.

Unsigned path:
- keep CODE_SIGNING_ALLOWED=NO build for reproducible compile/package proof
- verify app bundle exists
- verify executable is arm64
- verify retail Portal assets are absent
- package Payload/Render360Portal.app
- upload IPA + build metadata

Signed path:
- use GitHub Secrets for certificate/provisioning profile/password material
- use repository variables for non-secret team/bundle/signing identity values
- decode certificate/profile only on macOS runner temporary storage
- create/unlock a temporary keychain
- import certificate and set key partition list
- install provisioning profile by UUID
- configure manual Xcode signing
- build for generic iOS device
- codesign --verify --deep --strict
- inspect entitlements/profile/bundle identifier consistency
- package signed Payload IPA
- upload artifact
- always delete temporary keychain/profile material

Add verification scripts that fail the workflow when:
- executable is missing/non-arm64
- bundle ID does not match expected signed profile/application identifier
- signature verification fails
- retail game assets are found in app bundle
- IPA cannot be unzipped or Payload app is missing

Acceptance:
- Unsigned workflow reliably emits a valid package artifact.
- Signed workflow emits a codesign-verified IPA when valid user secrets/profile are supplied.
- Signed IPA can be installed on a device covered by its provisioning method.
```

# Prompt 18 — Full end-to-end completion audit

```text
Use the global implementation preamble.

Goal: prove the project is actually complete enough to call the native iOS port functional.

Do not add features first. Audit every milestone and mark each as PASS / FAIL / NOT TESTED with evidence:
- arm64 native launch
- SDL lifecycle
- Portal import persistence
- gameinfo/VPK random access
- Source module registry
- engine PreInit/main loop
- renderer initialization
- background1
- menu input
- testchmb_a_00
- player movement/collision
- required Portal interactions
- touch controls
- controller controls
- audio
- suspend/resume
- memory-warning handling
- current-map-only transition behavior
- repeated map-cycle memory stability
- iPhone 11 performance profile
- GLES/Metal status
- unsigned IPA CI
- signed IPA CI
- physical installation

For every FAIL, fix it if possible in this session and rerun the narrowest relevant test. Do not downgrade acceptance criteria merely to finish the checklist.

Create docs/IOS_NATIVE_RELEASE_READINESS.md containing:
- tested commit SHA
- tested device/iOS
- exact IPA artifact/run
- known blockers
- known non-blocking issues
- how to import user Portal files
- how to install/sign the IPA
- how to collect diagnostics for a crash/black screen/import failure

Final completion definition:
A signed native arm64 IPA installs on an iPhone 11-class device, launches without browser infrastructure, imports/uses the user's own Portal files, renders real Source/Portal content, loads at least chamber00 into real client/server gameplay, accepts usable touch/controller input, plays audio, survives lifecycle transitions, and does not show unbounded map-to-map memory accumulation.
```

---

# Recovery Prompt A — CI compile/link failure loop

```text
Repository/branch are the same as the global preamble.

A native iOS GitHub Actions job is failing. Do not redesign unrelated systems.

Process:
1. Inspect the exact failed workflow run/job/step and compiler/linker output.
2. Identify the first root-cause error, not downstream noise.
3. Trace it to the exact source/target/link dependency.
4. Make the smallest correct production fix.
5. Re-run the narrow local/static check if possible.
6. Re-run the failed workflow/job.
7. Repeat until green or until the remaining blocker requires external signing/device material.

Never fix CI by removing required Source code, returning success unconditionally, disabling the target, ignoring linker symbols, or converting the real target back into a bootstrap mock.

Report the first root cause, fix, and new last-success checkpoint.
```

# Recovery Prompt B — Device launch/crash loop

```text
The IPA installs but crashes/exits/hangs on physical iPhone.

Use the existing latest-checkpoint diagnostic system and Xcode/device crash logs if supplied.

Process:
- establish whether failure occurs before main, in UIKit/SDL startup, importer, filesystem, module registry, engine create, PreInit, renderer, map load or gameplay
- symbolicate native crashes when possible
- record exception type/signal, thread, top native frames and last Render360 checkpoint
- fix ownership/lifetime/alignment/threading issues at the real source
- do not hide crashes with broad try/catch or signal swallowing
- verify background/foreground and memory warning separately if crash is lifecycle-triggered

Acceptance: either the crash is fixed, or a single exact unresolved native call/stack remains with a reproducible trigger.
```

# Recovery Prompt C — Black screen / renderer failure

```text
The app stays alive but shows a black/incorrect frame.

Do not assume the renderer is initialized just because the swap/present call succeeds.

Check in order:
- drawable size and framebuffer dimensions
- GL/Metal context/device ownership and current-thread rules
- framebuffer completeness/render-pass validity
- clear/present proof
- viewport/scissor
- vertex/index upload
- shader compile/link/pipeline creation
- uniform/constant bindings
- texture format/upload/sampler state
- depth/stencil/cull/blend state
- Source material fallback/missing shader path
- map/resource availability

Add a temporary synthetic triangle only as a renderer diagnostic gate; remove/disable it from normal gameplay after proving the platform backend. A synthetic triangle is not a Source milestone.

Report the first failing real Source draw/material after the platform diagnostic passes.
```

# Recovery Prompt D — Portal import/VPK failure

```text
The user selected Portal files but Source cannot find/mount/read them.

Check:
- picker URL type/provider
- security-scoped access lifetime
- bookmark validity if used
- Application Support copy completion if import-copy strategy is used
- relative path normalization and case sensitivity
- gameinfo.txt detection
- portal/hl2/platform search path order
- VPK _dir file and numbered archive-part discovery
- 64-bit offsets/seek behavior
- partial reads and short-read handling
- file-provider eviction/unavailability
- manifest mismatch after relaunch

Never solve this by downloading Portal assets or committing them to the repo.
```

# Recovery Prompt E — Signing/provisioning failure

```text
The unsigned IPA builds but the signed workflow fails.

Inspect the exact failing signing command and decoded provisioning metadata without printing secret/private material.

Verify:
- certificate is valid PKCS#12 and password is correct
- certificate identity is visible in the temporary keychain
- provisioning profile UUID/name/team/application-identifier are readable
- bundle identifier matches the profile entitlement pattern
- DEVELOPMENT_TEAM is correct
- CODE_SIGN_IDENTITY matches certificate type
- profile is installed at the expected path
- generated app entitlements are compatible with the profile
- no embedded framework is left unsigned
- codesign verification passes before packaging

Do not commit certificates, private keys, provisioning profiles or decoded secret values.
```

# Recovery Prompt F — Memory growth / jetsam loop

```text
The app is killed or memory grows across maps.

Do not immediately lower texture quality. First find retention.

Measure at fixed checkpoints:
- menu stable
- chamber load peak
- chamber stable
- old-map teardown
- next chamber stable
- return to previous chamber

Inspect:
- BSP/world references
- model cache references
- material/texture refcounts
- render targets
- physics objects
- sound buffers
- particle systems
- transition overlay resources
- VPK/read caches
- autorelease pools / Objective-C objects retained by native host
- per-map diagnostics/log buffers

Use repeated transitions to separate legitimate cache warmup from monotonic leaks. Purge only resources proven unused.
```

---

# Agent handoff prompt

Use this between phases when a different AI/coding session continues the work.

```text
Continue the Render360 native iOS port on branch render360/ios-native.

First read docs/IOS_NATIVE_ZERO_TO_IPA_PROMPT_PACK.md and the current roadmap/audit/readiness files. Inspect the latest commit and current CI; do not assume the previous agent's narrative is correct.

Determine the highest phase whose acceptance criteria are actually proven. Resume from the first unproven phase. Preserve all earlier passing gates.

Before editing, state internally:
- last proven phase
- first unproven phase
- exact current blocker
- exact files/subsystems involved

Then implement the smallest correct step toward that phase's acceptance criteria, test it, inspect CI when available, and update the status docs. Never skip ahead to later visual polish while an earlier engine/filesystem/render/gameplay gate is still fake or unproven.
```

# Short one-shot master prompt

Use this only with an agent capable of long multi-step repository work and CI iteration.

```text
Implement the native iOS port of matthewcodergamer/source-engine-render360 on render360/ios-native from its current state all the way to the highest verifiable milestone, following docs/IOS_NATIVE_ZERO_TO_IPA_PROMPT_PACK.md exactly.

Work phase by phase. Inspect the repository and CI before every phase. Do not skip failed gates. Do not replace Source/Portal with mocks. Do not commit retail Portal assets. Keep iPhone 11 memory limits and current-map-only residency as core constraints. Use SDL2 for the native host, GLES3 only as the temporary first-pixels backend, and Metal as the eventual renderer path. Use a static Source module registry and native seekable filesystem/VPK I/O. Keep UIKit for native import/setup where appropriate. Build unsigned IPA artifacts continuously and maintain the signed workflow without exposing credentials.

After each phase, fix CI failures before moving on. Stop only when the remaining requirement genuinely needs external user-owned Portal files, Apple signing material, or physical-device evidence that is not available to the agent. In that case leave exact instructions/checkpoints, not a claim of completion.
```
