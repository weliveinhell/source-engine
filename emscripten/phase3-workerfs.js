// Render360 Phase 3 — zero-copy Portal retail filesystem for iPhone Safari.
//
// The staging document owns the user's File objects. The launcher runs inside a
// same-origin iframe so that staging document stays alive, then sends a compact
// list of retail File objects to this runtime. Pthread workers receive those
// File objects over BroadcastChannel, mount them through WORKERFS, and expose a
// writable MEMFS shadow tree of symlinks at /portal, /hl2 and /platform.
//
// WORKERFS reads Blob/File slices with FileReaderSync inside the worker. The VPK
// bytes therefore do not become 221+ MiB of individual MEMFS files. Source's own
// filesystem opens the real retail VPKs and loose BSP files and performs normal
// seek/range reads. The existing chunk/MEMFS loader remains available when
// hl2_launcher.html is opened directly, so Phase 3 can be tested without
// deleting the known fallback.
//
// Map residency rule for the direct-VPK path:
//   menu          -> background1 only
//   gameplay      -> current BSP only
//   transition    -> Source shuts the old level down, then opens the next BSP
//   future maps   -> never prefetched by Render360
//
// The VPK set and loose map tree remain ADDRESSABLE through WORKERFS, but retail
// bytes are not resident in MEMFS. Source's normal level shutdown owns native
// world/model/material lifetime; the Render360 JS layer deliberately keeps no
// historical map payload and never walks through earlier chambers to satisfy a
// later request.

;(() => {
  'use strict'

  const CHANNEL_NAME = 'render360-direct-vpk-channel-v1'
  const REQUEST_TYPE = 'render360-retail-request'
  const FILES_TYPE = 'render360-retail-files'
  const READY_TYPE = 'render360-retail-worker-ready'
  const MOUNTED_TYPE = 'render360-retail-mounted'
  const FAILED_TYPE = 'render360-retail-mount-failed'
  const EXPECTED_POOL_WORKERS = 2
  const HANDOFF_TIMEOUT_MS = 20000
  const RETAIL_MOUNT = '/render360-retail'
  const ROOT_RE = /^(portal|hl2|platform)\//i
  const MAP_TREE_RE = /^(?:portal|hl2)\/maps\//i
  const MENU_MAP_PATH = 'portal/maps/background1.bsp'
  const MENU_MAP = 'background1'
  const KNOWN_MAPS = new Set([
    'background1',
    'background2',
    'testchmb_a_00',
    'testchmb_a_01',
    'testchmb_a_02',
    'testchmb_a_03',
    'testchmb_a_04',
    'testchmb_a_05',
    'testchmb_a_06',
    'testchmb_a_07',
    'testchmb_a_08',
    'testchmb_a_09',
    'testchmb_a_10',
    'testchmb_a_11',
    'testchmb_a_13',
    'testchmb_a_14',
    'testchmb_a_15',
    'escape_00',
    'escape_01',
    'escape_02'
  ])

  const isWindow = typeof window !== 'undefined' && typeof document !== 'undefined'
  const isPthread = typeof ENVIRONMENT_IS_PTHREAD !== 'undefined' && !!ENVIRONMENT_IS_PTHREAD
  const embeddedLauncher = !!(isWindow && window.parent && window.parent !== window)
  const workerId = isPthread
    ? `pthread-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    : 'browser-main'

  let channel = null
  try {
    if(typeof BroadcastChannel === 'function') channel = new BroadcastChannel(CHANNEL_NAME)
  } catch(_) {}

  const residency = {
    currentMap: null,
    previousMap: null,
    generation: 0,
    mode: 'idle',
    prefetchEnabled: false,
    changedAt: 0
  }

  function normalizeRetailPath(value) {
    return String(value || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+/g, '/')
      .toLowerCase()
  }

  function normalizeMapName(value) {
    const clean = String(value || '').replace(/\\/g, '/').toLowerCase()
    const base = clean.slice(clean.lastIndexOf('/') + 1).replace(/\.bsp$/i, '')
    return base || clean
  }

  function dirname(path) {
    const clean = String(path || '').replace(/\\/g, '/')
    const at = clean.lastIndexOf('/')
    return at <= 0 ? '/' : clean.slice(0, at)
  }

  function safePhase(phase) {
    try { globalThis.render360SetPhase?.(phase) } catch(_) {}
  }

  function safePrint(text) {
    try { Module.print?.(text) } catch(_) { try { console.log(text) } catch(__) {} }
  }

  function safePrintErr(text) {
    try { Module.printErr?.(text) } catch(_) { try { console.error(text) } catch(__) {} }
  }

  function publishResidency() {
    Module.render360CurrentMap = residency.currentMap
    Module.render360MapResidency = {
      currentMap: residency.currentMap,
      previousMap: residency.previousMap,
      generation: residency.generation,
      mode: residency.mode,
      prefetchEnabled: false,
      changedAt: residency.changedAt
    }
  }

  function enterCurrentMap(mapName) {
    const next = normalizeMapName(mapName)
    if(!next) throw new Error('Phase 3 received an empty map name')
    if(!KNOWN_MAPS.has(next)) {
      safePrint(`[Render360 Phase 3] map ${next} is outside the initial Portal manifest; treating it as current-map-only without prefetch.`)
    }

    if(residency.currentMap === next) {
      publishResidency()
      return { changed: false, ...Module.render360MapResidency }
    }

    const previous = residency.currentMap
    residency.previousMap = previous
    residency.currentMap = next
    residency.generation++
    residency.mode = next === MENU_MAP ? 'menu-only' : 'current-map-only'
    residency.changedAt = Date.now()
    publishResidency()

    // There is intentionally no JS-side unload loop here. In the direct-VPK
    // path Render360 never unpacked the old map into MEMFS in the first place.
    // Source's native level shutdown releases the old BSP/world resources; the
    // browser File objects stay mounted as read-only backing storage for future
    // range reads without becoming resident map payloads.
    if(previous) {
      safePrint(`[Render360 Phase 3] residency transition ${previous} -> ${next}: previous level is no longer a Render360 resident map; no future chamber was prefetched.`)
    } else if(next === MENU_MAP) {
      safePrint('[Render360 Phase 3] menu residency: background1 only; zero test chamber maps are staged or prefetched.')
    } else {
      safePrint(`[Render360 Phase 3] gameplay residency: ${next} only; zero earlier/future map payloads are staged by Render360.`)
    }
    safePhase(`phase3-${residency.mode}:${next}`)
    return { changed: true, ...Module.render360MapResidency }
  }

  function retailDescriptorStats(descriptors) {
    let bytes = 0
    let vpkFiles = 0
    let looseFiles = 0
    let mapFiles = 0
    let background1 = false
    for(const descriptor of descriptors || []) {
      const path = normalizeRetailPath(descriptor?.path)
      bytes += Number(descriptor?.file?.size || 0)
      if(/\.vpk$/i.test(path)) vpkFiles++
      else looseFiles++
      if(MAP_TREE_RE.test(path)) mapFiles++
      if(path === MENU_MAP_PATH) background1 = true
    }
    return { files: (descriptors || []).length, bytes, vpkFiles, looseFiles, mapFiles, background1 }
  }

  function shouldExposeRetailPath(path) {
    const clean = normalizeRetailPath(path)
    if(!ROOT_RE.test(clean)) return false
    if(/\.vpk$/i.test(clean)) return true
    // Portal's BSPs are loose retail files. Expose the entire maps tree through
    // WORKERFS so Source can open background1 and later chambers without MEMFS.
    if(MAP_TREE_RE.test(clean)) return true
    if(/\/(?:gameinfo\.txt|steam\.inf|game\.inf)$/i.test(clean)) return true
    if(/\/(?:cfg|resource|scripts)\//i.test(clean)) return true
    return false
  }

  function unlinkIfSymlink(path) {
    try {
      const node = FS.lookupPath(path, { follow: false })?.node
      if(node && FS.isLink(node.mode)) FS.unlink(path)
    } catch(_) {}
  }

  function mountRetailWorkerFS(descriptors, token) {
    if(!isPthread) throw new Error('WORKERFS mount attempted outside an Emscripten pthread worker')
    if(typeof WORKERFS === 'undefined') throw new Error('WORKERFS is unavailable; build must link -lworkerfs.js')
    if(typeof FileReaderSync === 'undefined') throw new Error('FileReaderSync is unavailable in this worker')
    if(!Array.isArray(descriptors) || !descriptors.length) throw new Error('no Portal retail File objects were transferred')

    if(Module.render360DirectVPKMounted === true) {
      return Module.render360DirectVPKStats || retailDescriptorStats(descriptors)
    }

    const blobs = []
    const exposed = []
    const directFiles = new Map()
    for(const descriptor of descriptors) {
      const path = normalizeRetailPath(descriptor?.path)
      const file = descriptor?.file
      if(!path || !ROOT_RE.test(path) || !(file instanceof Blob)) continue
      blobs.push({ name: path, data: file })
      directFiles.set(path, file)
      if(shouldExposeRetailPath(path)) exposed.push(path)
    }
    if(!blobs.length) throw new Error('Portal transfer contained no portal/, hl2/ or platform/ retail files')

    const menuMapFile = directFiles.get(MENU_MAP_PATH)
    if(!(menuMapFile instanceof Blob) || Number(menuMapFile.size || 0) <= 0) {
      throw new Error('portal/maps/background1.bsp was not transferred; the real Portal menu map cannot start')
    }

    // Keep direct File references on the Source pthread. This is a reference
    // map only: it does not copy a VPK or BSP byte. filesystem_stdio can resolve
    // retail files without depending on WORKERFS node internals or a
    // main-thread-proxied JS FS lookup.
    globalThis.__render360RetailFileMap = directFiles
    globalThis.__render360RetailHandles = new Map()
    globalThis.__render360RetailNextHandle = 1

    safePhase('phase3-workerfs-mount-start')
    FS.mkdirTree(RETAIL_MOUNT)
    try { FS.unmount(RETAIL_MOUNT) } catch(_) {}
    FS.mount(WORKERFS, { blobs }, RETAIL_MOUNT)

    let links = 0
    for(const rel of exposed) {
      const livePath = '/' + rel
      const targetPath = RETAIL_MOUNT + '/' + rel
      FS.mkdirTree(dirname(livePath))
      unlinkIfSymlink(livePath)
      try {
        FS.lookupPath(livePath, { follow: false })
        continue
      } catch(_) {}
      FS.symlink(targetPath, livePath)
      links++
    }

    const stats = retailDescriptorStats(blobs.map(x => ({ path: x.name, file: x.data })))
    stats.links = links
    stats.directHandles = directFiles.size
    stats.token = token
    Module.render360DirectVPKRequested = true
    Module.render360DirectVPKMounted = true
    Module.render360DirectVPKStats = stats
    Module.render360ResidentBytes = Number(Module.render360ResidentBytes || 0)
    Module.render360ResidentFiles = Number(Module.render360ResidentFiles || 0)
    publishResidency()
    safePhase(`phase3-workerfs-ready:vpk=${stats.vpkFiles}:maps=${stats.mapFiles}:links=${links}`)
    safePrint(`[Render360 Phase 3] WORKERFS mounted ${stats.files} retail files (${stats.vpkFiles} VPKs, ${stats.mapFiles} loose map files, ${(stats.bytes / 1048576).toFixed(1)} MiB browser backing storage) with ${links} live symlinks and ${stats.directHandles} zero-copy direct File handles; retail payload bytes remain outside MEMFS.`)
    return stats
  }

  if(isPthread && channel) {
    channel.addEventListener('message', event => {
      const data = event?.data
      if(!data || data.type !== FILES_TYPE) return
      if(data.targetWorkerId && data.targetWorkerId !== workerId) return
      try {
        const stats = mountRetailWorkerFS(data.files, data.token)
        channel.postMessage({ type: MOUNTED_TYPE, token: data.token, workerId, stats })
      } catch(error) {
        const message = String(error?.stack || error?.message || error)
        safePhase(`phase3-workerfs-failed:${String(error?.message || error).slice(0, 120)}`)
        safePrintErr(`[Render360 Phase 3] WORKERFS mount failed: ${message}`)
        channel.postMessage({ type: FAILED_TYPE, token: data.token, workerId, error: message.slice(-2048) })
      }
    })
    channel.postMessage({ type: READY_TYPE, workerId })
  }

  if(isWindow && embeddedLauncher) {
    Module.render360DirectVPKRequested = true
    safePhase('phase3-await-prerun')

    const token = `launch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    let descriptors = null
    let dependencyHeld = false
    let released = false
    let handoffStarted = false
    let timeout = 0
    const mountedWorkers = new Set()
    const failedWorkers = new Map()
    const readyWorkers = new Set()

    function releaseDependency() {
      if(released) return
      released = true
      if(timeout) clearTimeout(timeout)
      Module.render360DirectVPKReady = true
      safePhase(`phase3-workers-ready:${mountedWorkers.size}`)
      const stats = Module.render360DirectRetailStats || {}
      // CI guard wording intentionally retained: background1 chunk preload is disabled.
      safePrint(`[Render360 Phase 3] ${mountedWorkers.size} pthread workers have zero-copy retail access (${stats.vpkFiles || 0} VPKs, ${stats.mapFiles || 0} map files); background1 chunk preload is disabled, all packed map preloads are disabled, and Render360 map prefetch is disabled.`)
      if(dependencyHeld) {
        dependencyHeld = false
        removeRunDependency('render360-direct-vpk')
      }
    }

    function failHandoff(message) {
      if(released) return
      const text = `[Render360 Phase 3] ${message}`
      safePhase(`phase3-handoff-failed:${String(message).slice(0, 120)}`)
      safePrintErr(text)
      if(typeof abort === 'function') abort(text)
      else throw new Error(text)
    }

    function sendToWorker(id) {
      if(!channel || !descriptors || !id || mountedWorkers.has(id) || failedWorkers.has(id)) return
      channel.postMessage({ type: FILES_TYPE, token, targetWorkerId: id, files: descriptors })
    }

    if(channel) {
      channel.addEventListener('message', event => {
        const data = event?.data
        if(!data) return
        if(data.type === READY_TYPE && data.workerId) {
          readyWorkers.add(data.workerId)
          if(handoffStarted) sendToWorker(data.workerId)
          return
        }
        if(data.token !== token) return
        if(data.type === MOUNTED_TYPE && data.workerId) {
          mountedWorkers.add(data.workerId)
          failedWorkers.delete(data.workerId)
          safePrint(`[Render360 Phase 3] worker ${mountedWorkers.size}/${EXPECTED_POOL_WORKERS} mounted WORKERFS.`)
          if(mountedWorkers.size >= EXPECTED_POOL_WORKERS) releaseDependency()
          return
        }
        if(data.type === FAILED_TYPE && data.workerId) {
          failedWorkers.set(data.workerId, data.error || 'unknown WORKERFS failure')
          failHandoff(`worker ${data.workerId} could not mount retail files: ${data.error || 'unknown error'}`)
        }
      })
    }

    globalThis.addEventListener('message', event => {
      if(event.origin !== location.origin) return
      const data = event?.data
      if(!data || data.type !== FILES_TYPE || data.token !== token) return
      if(!Array.isArray(data.files) || !data.files.length) {
        failHandoff('staging page did not provide a full Portal folder')
        return
      }
      descriptors = data.files
      const stats = retailDescriptorStats(descriptors)
      if(!stats.background1) {
        failHandoff('portal/maps/background1.bsp was not retained by the staging page')
        return
      }
      Module.render360DirectRetailStats = stats
      safePhase(`phase3-retail-received:vpk=${stats.vpkFiles}:maps=${stats.mapFiles}`)
      safePrint(`[Render360 Phase 3] received ${stats.files} zero-copy retail File handles (${stats.vpkFiles} VPKs, ${stats.mapFiles} loose map files); waiting for pthread WORKERFS mounts.`)
      for(const id of readyWorkers) sendToWorker(id)
    })

    // Do not add this dependency during script evaluation. Emscripten creates
    // and loads the PTHREAD_POOL_SIZE workers from preRun; holding a dependency
    // before preRun can prevent that pool from ever loading. Enter preRun first,
    // then hold main() while the already-starting workers mount WORKERFS.
    Module.preRun = Module.preRun || []
    Module.preRun.push(() => {
      if(handoffStarted) return
      handoffStarted = true
      if(!channel) {
        failHandoff('BroadcastChannel is unavailable for pthread File handoff')
        return
      }
      addRunDependency('render360-direct-vpk')
      dependencyHeld = true
      timeout = setTimeout(() => {
        failHandoff(`timed out waiting for ${EXPECTED_POOL_WORKERS} WORKERFS workers (ready=${readyWorkers.size}, mounted=${mountedWorkers.size})`)
      }, HANDOFF_TIMEOUT_MS)
      safePhase('phase3-await-retail-files')
      window.parent.postMessage({ type: REQUEST_TYPE, token }, location.origin)
      for(const id of readyWorkers) sendToWorker(id)
    })
  }

  if(typeof DataLoader !== 'undefined') {
    const originalLoadMapWithDeps = DataLoader.prototype.loadMapWithDeps
    DataLoader.prototype.loadMapWithDeps = async function(mapName) {
      if(Module.render360DirectVPKMounted === true || (isWindow && Module.render360DirectVPKRequested === true)) {
        if(isPthread && Module.render360DirectVPKMounted !== true) {
          throw new Error(`Phase 3 direct VPK requested before WORKERFS mount while loading ${mapName}`)
        }

        // This is the core current-map-only rule. Do not call the compatibility
        // loader, do not load background1 as a dependency of chambers, and do not
        // walk mapsOrdered. The requested BSP becomes the sole Render360 map
        // residency checkpoint while Source reads its real loose BSP and VPK
        // dependencies lazily from the browser File objects.
        const transition = enterCurrentMap(mapName)
        this.setProgress?.(mapName, 1)
        const stats = Module.render360DirectVPKStats || Module.render360DirectRetailStats || {}
        const snapshot = globalThis.render360MemorySnapshot?.(`phase3-map-ready:${normalizeMapName(mapName)}`)
        safePrint(`[Render360 Phase 3] ${normalizeMapName(mapName)}: current-map-only; skipped packed .data/MEMFS staging and all earlier/future map preloads. Source reads the loose BSP plus retail VPK ranges lazily through WORKERFS/direct File reads (vpkFiles=${stats.vpkFiles || 0}, mapFiles=${stats.mapFiles || 0}, generation=${transition.generation}, memory=${JSON.stringify(snapshot || {})}).`)
        return
      }
      return originalLoadMapWithDeps.call(this, mapName)
    }
  }

  publishResidency()
  globalThis.render360Phase3 = {
    active: embeddedLauncher || isPthread,
    embeddedLauncher,
    isPthread,
    workerId,
    mountPoint: RETAIL_MOUNT,
    expectedPoolWorkers: EXPECTED_POOL_WORKERS,
    prefetchEnabled: false,
    get currentMap() { return residency.currentMap },
    get residency() { return { ...Module.render360MapResidency } }
  }
})()
