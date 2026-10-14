# Render360 Portal Native iOS Architecture

## Top-level runtime

```text
Render360Portal.app
│
├── UIKit setup/import shell
│   └── Files document/folder picker
│
├── SDL2 iOS platform host
│   ├── lifecycle
│   ├── touch/controller input
│   ├── audio
│   └── native game window
│
├── Source engine arm64
│   ├── tier0/tier1/mathlib/vstdlib
│   ├── filesystem_stdio + VPK
│   ├── engine
│   ├── material system
│   ├── studio render
│   ├── vphysics/IVP
│   ├── client
│   ├── server
│   ├── GameUI/VGUI
│   └── audio/video subsystems as required by Portal
│
├── iOS static module registry
│   └── Source interface factories instead of browser SIDE_MODULE/dlopen
│
├── Graphics backend boundary
│   ├── GLES3 compatibility bring-up backend
│   └── Metal production backend
│
└── User-owned Portal data
    └── native filesystem/VPK range reads
```

## What is intentionally gone from the native runtime

The following are web-port implementation details and must not become dependencies of the iOS application:

- WebAssembly linear memory
- `hl2_launcher.data`
- MEMFS
- WORKERFS
- SharedArrayBuffer
- COOP/COEP
- service workers
- browser `File` object transfer
- pthread JavaScript proxies
- OffscreenCanvas
- WebGL
- browser fullscreen emulation

## Thread model

Use ordinary iOS/native threading. Start conservatively on iPhone 11:

- UI/main thread: UIKit/SDL platform events and presentation requirements.
- Source/game thread: only if Source's architecture benefits from separation after profiling.
- Worker/job threads: bounded pool sized from measurements, not desktop defaults.
- Audio callback: SDL/CoreAudio-controlled real-time path; no blocking filesystem I/O.

Do not copy the browser's two-pthread design literally. Native thread counts are an optimization decision, not an architectural requirement.

## Filesystem

Native game data is exposed as ordinary paths/file descriptors under an app-controlled game root. The Source filesystem should remain responsible for VPK resolution.

Preferred access pattern:

```text
gameinfo.txt -> tiny ordinary read
*_dir.vpk    -> directory/index metadata
*_000.vpk    -> seek/range read only when Source asks for an asset
BSP          -> load current level data through Source's normal map path
```

Do not unpack VPKs into per-file copies merely to make them accessible.

## Memory lifecycle

### Menu

```text
engine/shared systems
+ GameUI/VGUI
+ background1
+ menu materials/models/audio
```

No chamber BSP residency.

### Chamber

```text
engine/shared systems
+ current BSP/world
+ current models/materials/textures/audio
+ bounded shared cache
```

### Changelevel

```text
close Aperture/elevator transition
-> Source shuts down old world
-> release unreferenced models
-> uncache unused materials/textures
-> open/read new BSP and required VPK assets
-> first safe new-map frame
-> open transition
-> destroy transition resources
```

Temporary overlap is allowed only where Source requires it. Persistent previous-map residency is a bug.

## Graphics strategy

### Bring-up: OpenGL ES 3.0

Reason: the existing renderer/ToGL code is conceptually closer to GL than Metal, so GLES3 is the fastest route to identifying Source-specific rendering assumptions and reaching first pixels.

Constraints:

- no fake extension reporting;
- no browser/WebGL emulation layer;
- isolate every compatibility shim;
- expect desktop OpenGL calls/features to require adaptation;
- treat GLES as deprecated/temporary.

### Production: Metal

Metal migration occurs behind the same renderer boundary after background1/chamber00 are functional. This avoids simultaneously debugging Source gameplay startup and a total graphics rewrite.

## Module loading

Native iOS should resolve Source factories from linked code. A logical name such as `libengine.so` is normalized to `engine`, then looked up in a static registry.

Pseudo-flow:

```cpp
CSysModule *Sys_LoadModule(const char *name) {
    auto id = NormalizeSourceModuleName(name);
    if (auto *entry = IOSModuleRegistry::Find(id))
        return entry->Handle();
    return nullptr;
}
```

The handle is a Source-compatible logical handle, not an arbitrary iOS-loaded executable file.

## Diagnostics

Keep the lesson from the web work: giant logs are not useful on memory-constrained devices.

Retain:

- latest actionable runtime event;
- current startup/map phase;
- active map;
- resident memory snapshot;
- last missing module/interface/resource;
- renderer backend and capability summary;
- last fatal/native exception summary where capturable.

Use an optional bounded developer ring buffer only for debug builds and never let it grow without limit.

## App/asset boundary

The executable and open-source/port code live in GitHub/IPA. Portal retail data stays outside the repository and is supplied by the user at runtime. This boundary must be enforced by CI and documentation throughout the project.
