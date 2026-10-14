// Safari/iOS may terminate the WebContent process without giving Wasm a normal
// exception when the Source startup peak crosses the device memory budget. The
// browser then reloads the exact launcher URL, which can immediately repeat the
// expensive startup and make the situation worse. Persist only the latest launch
// checkpoint so a process-kill reload reports where execution actually stopped.
const RENDER360_IOS_CRASH_STATE_KEY = 'render360-ios-crash-state-v2'
const RENDER360_IOS_CRASH_CHANNEL = 'render360-ios-crash-state-channel-v1'
const render360IsWindow = typeof window !== 'undefined' && typeof document !== 'undefined'
// Use one stable id in both Window and WorkerGlobalScope. Worker location points
// at hl2_launcher.worker.js, so location.pathname cannot be used as a shared id.
const render360LaunchId = 'portal-upstream-baseline'
const render360Now = Date.now()
let render360PreviousState = null
if(render360IsWindow) {
	try {
		render360PreviousState = JSON.parse(localStorage.getItem(RENDER360_IOS_CRASH_STATE_KEY) || 'null')
	} catch(_) {}
}

const render360ProbableProcessReload = !!(
	render360IsWindow &&
	render360PreviousState &&
	render360PreviousState.active === true &&
	render360PreviousState.launchId === render360LaunchId &&
	render360Now - Number(render360PreviousState.updatedAt || 0) < 3 * 60 * 1000
)

// Deliberately flat: no nested previous-state history. Every checkpoint replaces
// the one before it. If Safari kills WebContent, phase is left at the last phase
// that actually ran, while interruption explains why this reload was blocked.
const render360CrashState = {
	launchId: render360LaunchId,
	active: !render360ProbableProcessReload,
	blocked: render360ProbableProcessReload,
	phase: render360ProbableProcessReload ? String(render360PreviousState?.phase || 'unknown') : 'runtime-script-start',
	interruption: render360ProbableProcessReload ? 'probable-process-kill-reload' : null,
	startedAt: render360ProbableProcessReload ? Number(render360PreviousState?.startedAt || render360Now) : render360Now,
	updatedAt: render360Now,
	wasmHeapBytes: render360ProbableProcessReload ? Number(render360PreviousState?.wasmHeapBytes || 0) : 0,
	memfsBytes: render360ProbableProcessReload ? Number(render360PreviousState?.memfsBytes || 0) : 0,
	memfsFiles: render360ProbableProcessReload ? Number(render360PreviousState?.memfsFiles || 0) : 0,
	threads: render360ProbableProcessReload ? Number(render360PreviousState?.threads || 0) : 0
}

// A deliberate fresh launch should not carry an error from an older attempt.
if(render360IsWindow && !render360ProbableProcessReload) {
	try { localStorage.removeItem('render360-ios-last-error-v1') } catch(_) {}
}

let render360CrashChannel = null
try {
	if(typeof BroadcastChannel === 'function') {
		render360CrashChannel = new BroadcastChannel(RENDER360_IOS_CRASH_CHANNEL)
	}
} catch(_) {}

function render360ReadWasmHeapBytes() {
	try {
		if(typeof HEAPU8 !== 'undefined' && HEAPU8?.buffer) return HEAPU8.buffer.byteLength || 0
	} catch(_) {}
	return 0
}

function render360WriteCrashState(state) {
	if(render360IsWindow) {
		try { localStorage.setItem(RENDER360_IOS_CRASH_STATE_KEY, JSON.stringify(state)) } catch(_) {}
		return
	}
	if(render360CrashChannel) {
		try { render360CrashChannel.postMessage({ type: 'render360-crash-state', state }) } catch(_) {}
	}
}

// Running Web Workers. Every engine thread is a Worker that instantiates every
// loaded SIDE_MODULE again, so this is the number to watch next to the heap.
function render360ReadThreadCount() {
	try {
		if(typeof PThread !== 'undefined' && PThread?.runningWorkers) return PThread.runningWorkers.length
	} catch(_) {}
	return 0
}

// The last few engine log lines, kept in memory and written to localStorage on
// the 3 s heartbeat. When Safari kills the page there is no exception to catch;
// this tail is the only record of what the engine was doing at the time.
const RENDER360_LOG_TAIL_KEY = 'render360-ios-log-tail-v1'
const RENDER360_LOG_TAIL_LINES = 40
const render360LogTail = []
// Errors and font/audio lines, kept apart so a long run cannot push them out
// of the 40-line tail before anyone copies diagnostics.
const RENDER360_NOTABLE_KEY = 'render360-ios-notable-v1'
const RENDER360_NOTABLE_RE = /font|error|fail|couldn'?t|cannot|can't|unable|missing|not found|warning|audio|sound|Render360 video|Render360 GL/i
const render360Notable = []
let render360LogTailDirty = false
function render360RememberLine(text) {
	const line = String(text || '').trim()
	if(!line) return
	// Crash stacks are long and are the whole point; keep them intact.
	const limit = line.startsWith('[Render360 worker stack]') ? 3000 : 300
	if(RENDER360_NOTABLE_RE.test(line) && render360Notable.length < 90) {
		const last = render360Notable[render360Notable.length - 1]
		if(!last || !last.endsWith(line.slice(0, limit))) {
			render360Notable.push(`${((Date.now() - render360Now) / 1000).toFixed(1)}s ${line.slice(0, limit)}`)
		}
	}
	render360LogTail.push(`${((Date.now() - render360Now) / 1000).toFixed(1)}s ${line.slice(0, limit)}`)
	if(render360LogTail.length > RENDER360_LOG_TAIL_LINES) render360LogTail.splice(0, render360LogTail.length - RENDER360_LOG_TAIL_LINES)
	render360LogTailDirty = true
}
function render360FlushLogTail() {
	if(!render360IsWindow || !render360LogTailDirty) return
	render360LogTailDirty = false
	try { localStorage.setItem(RENDER360_LOG_TAIL_KEY, JSON.stringify(render360LogTail)) } catch(_) {}
	try { localStorage.setItem(RENDER360_NOTABLE_KEY, JSON.stringify(render360Notable)) } catch(_) {}
}
globalThis.render360ReadNotable = () => {
	if(render360Notable.length) return render360Notable.slice()
	try { return JSON.parse(localStorage.getItem(RENDER360_NOTABLE_KEY) || '[]') } catch(_) { return [] }
}
globalThis.render360ReadLogTail = () => {
	if(render360LogTail.length) return render360LogTail.slice()
	try { return JSON.parse(localStorage.getItem(RENDER360_LOG_TAIL_KEY) || '[]') } catch(_) { return [] }
}
if(render360IsWindow && !render360ProbableProcessReload) {
	// A fresh launch must not show the tail of an older run.
	try { localStorage.removeItem(RENDER360_LOG_TAIL_KEY) } catch(_) {}
	try { localStorage.removeItem(RENDER360_NOTABLE_KEY) } catch(_) {}
}

function render360PersistCrashState() {
	render360CrashState.updatedAt = Date.now()
	render360CrashState.threads = render360ReadThreadCount() || Number(render360CrashState.threads || 0)
	render360CrashState.wasmHeapBytes = render360ReadWasmHeapBytes()
	render360CrashState.memfsBytes = Number(Module.render360ResidentBytes || 0)
	render360CrashState.memfsFiles = Number(Module.render360ResidentFiles || 0)
	render360WriteCrashState(render360CrashState)
}

function render360SetPhase(phase) {
	render360CrashState.phase = String(phase || 'unknown')
	render360CrashState.interruption = null
	render360PersistCrashState()
}

globalThis.render360SetPhase = render360SetPhase
globalThis.render360MemorySnapshot = (phase) => {
	if(phase) render360SetPhase(phase)
	else render360PersistCrashState()
	return {
		phase: render360CrashState.phase,
		wasmHeapMiB: Math.round(render360CrashState.wasmHeapBytes / 1048576),
		memfsMiB: Math.round(render360CrashState.memfsBytes / 1048576),
		memfsFiles: render360CrashState.memfsFiles
	}
}

// Worker-side phase changes matter most for PROXY_TO_PTHREAD. Relay them to
// the Window so localStorage still contains the latest worker phase if WebKit
// kills the process and reloads the launcher.
// Lets a Worker put a line into the window's engine log (and so into the
// diagnostics tail and the shell's failure detection). A Worker's own
// Module.printErr only reaches its console.
function render360Log(text) {
	if(render360IsWindow) {
		try { Module.printErr?.(text) } catch(_) {}
		return
	}
	try { console.error(text) } catch(_) {}
	try { render360CrashChannel?.postMessage({ type: 'render360-log', launchId: render360LaunchId, text: String(text) }) } catch(_) {}
}
globalThis.render360Log = render360Log

if(render360IsWindow && render360CrashChannel) {
	render360CrashChannel.addEventListener('message', event => {
		if(event?.data?.type === 'render360-log' && event.data.launchId === render360LaunchId) {
			try { Module.printErr?.(String(event.data.text || '')) } catch(_) {}
		}
	})
	// Frame watchdog: the render worker pings every ~2 s while it presents
	// frames. A thread that hangs cannot log anything itself, so the page
	// notes when the pings stop (and when they come back).
	let lastFramePing = 0, lastFrameCount = 0, stallReported = false
	render360CrashChannel.addEventListener('message', event => {
		if(event?.data?.type !== 'render360-frame' || event.data.launchId !== render360LaunchId) return
		const now = performance.now()
		if(stallReported) {
			try { Module.printErr?.(`[Render360 GL] frames resumed after ${((now - lastFramePing) / 1000).toFixed(0)} s at frame ${event.data.frames}`) } catch(_) {}
			stallReported = false
		}
		lastFramePing = now
		lastFrameCount = event.data.frames
	})
	setInterval(() => {
		if(!lastFramePing || stallReported) return
		const gap = performance.now() - lastFramePing
		if(gap < 8000 || document.hidden) return
		stallReported = true
		try { Module.printErr?.(`[Render360 GL] stalled: no frame for ${(gap / 1000).toFixed(0)} s after frame ${lastFrameCount} (phase ${render360CrashState.phase})`) } catch(_) {}
	}, 2000)
	render360CrashChannel.addEventListener('message', event => {
		const incoming = event?.data?.type === 'render360-crash-state' ? event.data.state : null
		if(!incoming || incoming.launchId !== render360LaunchId) return
		if(Number(incoming.updatedAt || 0) < Number(render360CrashState.updatedAt || 0)) return
		render360CrashState.active = incoming.active !== false
		render360CrashState.blocked = false
		render360CrashState.phase = String(incoming.phase || render360CrashState.phase)
		render360CrashState.interruption = incoming.interruption || null
		render360CrashState.updatedAt = Number(incoming.updatedAt || Date.now())
		render360CrashState.wasmHeapBytes = Number(incoming.wasmHeapBytes || render360CrashState.wasmHeapBytes || 0)
		render360CrashState.memfsBytes = Number(incoming.memfsBytes || render360CrashState.memfsBytes || 0)
		render360CrashState.memfsFiles = Number(incoming.memfsFiles || render360CrashState.memfsFiles || 0)
		render360CrashState.threads = render360ReadThreadCount() || Number(render360CrashState.threads || 0)
		try { localStorage.setItem(RENDER360_IOS_CRASH_STATE_KEY, JSON.stringify(render360CrashState)) } catch(_) {}
	})
}

if(render360ProbableProcessReload) {
	// noInitialRun prevents the expensive Source main()/map/module startup from
	// being executed a second time. The retained phase is the last useful event.
	Module['noInitialRun'] = true
	setTimeout(() => {
		const heap = Math.round(Number(render360CrashState.wasmHeapBytes || 0) / 1048576)
		const memfs = Math.round(Number(render360CrashState.memfsBytes || 0) / 1048576)
		const message = `[Render360 iOS guard] Safari restarted this launcher after a probable WebContent/GPU process kill. Last phase=${render360CrashState.phase || 'unknown'}, wasmHeap=${heap} MiB, trackedMEMFS=${memfs} MiB, threads=${Number(render360CrashState.threads || 0)}. Use Copy diagnostics, then return to the staging page for a deliberate fresh launch.`
		Module.printErr?.(message)
		if(typeof statusElement !== 'undefined' && statusElement) statusElement.textContent = message
		if(typeof spinnerElement !== 'undefined' && spinnerElement) spinnerElement.style.display = 'none'
	}, 0)
} else {
	render360PersistCrashState()
}

const render360OriginalPrint = typeof Module.print === 'function' ? Module.print.bind(Module) : console.log.bind(console)
const render360OriginalPrintErr = typeof Module.printErr === 'function' ? Module.printErr.bind(Module) : console.error.bind(console)
function render360ObserveRuntimeLine(args) {
	const text = args.map(value => String(value)).join(' ')
	let match = text.match(/LoadLibrary:\s*path:\s*(\S+)/)
	if(match) render360SetPhase(`dlopen-start:${match[1]}`)
	match = text.match(/Render360:\s*loaded module:\s*(\S+)/)
	if(match) render360SetPhase(`dlopen-done:${match[1]}`)
	if(text.includes('IDirect3DDevice9::Create')) render360SetPhase('renderer-device-created')
	if(text.includes('server.so loaded')) render360SetPhase('server-module-ready')
	if(text.includes('Precache:')) render360SetPhase('shader-precache-finished')
}
Module.print = (...args) => {
	render360ObserveRuntimeLine(args)
	render360RememberLine(args.join(' '))
	render360OriginalPrint(...args)
}
Module.printErr = (...args) => {
	render360ObserveRuntimeLine(args)
	render360RememberLine(args.join(' '))
	render360OriginalPrintErr(...args)
}

let render360Heartbeat = 0
if(render360IsWindow) {
	render360Heartbeat = setInterval(() => {
		if(render360CrashState.active) render360PersistCrashState()
		render360FlushLogTail()
	}, 3000)
	window.addEventListener('pagehide', () => {
		if(render360Heartbeat) clearInterval(render360Heartbeat)
		if(!render360CrashState.blocked) {
			render360CrashState.active = false
			render360CrashState.phase = 'clean-pagehide'
			render360CrashState.interruption = null
			render360PersistCrashState()
		}
		render360FlushLogTail()
		try { render360CrashChannel?.close() } catch(_) {}
	}, { once: true })
}

// Keep packaged SIDE_MODULE bytes as ordinary MEMFS files. Source performs its
// own runtime dlopen() calls and must not race Emscripten's preload-file Wasm
// decoder on the same .so names.
Module['noWasmDecoding'] = true

// liblauncher.so is the first Source module opened from the PROXY_TO_PTHREAD
// application thread. On iOS the first runtime dlopen can re-enter through
// Emscripten's pthread task queue while that DSO is still marked "loading",
// producing: Attempt to load 'liblauncher.so' twice before the first load
// completed. Load this ONE root DSO before main() using Emscripten's supported
// MAIN_MODULE startup path. Source's later dlopen then reuses the completed DSO.
// All other Source SIDE_MODULEs remain demand-loaded by Source.
Module['dynamicLibraries'] = ['liblauncher.so']

Module['preRun'] = Module['preRun'] || []
Module['preRun'].push(() => {
	render360SetPhase('prerun-liblauncher-ready')
	Module.print?.('[Render360] load-time liblauncher preload requested')
})

Module['arguments'] = Module['arguments'] || []
Module['arguments'].push(
	'-game', 'portal',
	'-noip',
	'-language', 'english',
	'-windowed',
	'-novid',
	'-nojoy',
	'+mat_hdr_level', '0',
	'+mat_colorcorrection', '1',
	// One rendering thread. The WebGL context belongs to the engine's main
	// pthread (OffscreenCanvas), and Emscripten keeps GL object tables per
	// thread, so the queued material system's render thread (mat_queue_mode)
	// issues GL calls with ids its thread has never seen. On iPhone that
	// thread died ~29 s into the menu load: first as getShaderInfoLog(<not a
	// shader>), then as an out-of-bounds access, while the main thread kept
	// logging. -threads 1 makes CMaterialSystem::AllowThreading refuse queued
	// rendering and leaves the global job pool with no worker threads.
	'-threads', '1',
	'+mat_queue_mode', '0',
	// Never open the developer console on its own.
	'-hideconsole',
	// The canvas rarely holds DOM focus in a browser, and Source would mute
	// itself whenever it believes the window is in the background.
	'+snd_mute_losefocus', '0',
	// Full scale is harsh on a phone speaker; still adjustable in Options.
	'+volume', '0.7',
	// Paint further ahead than the desktop 0.1 s: phone frames are slower,
	// and the ring holds 0.37 s.
	'+snd_mixahead', '0.25',
	// Clear the colour buffer at the start of every view, so nothing from an
	// earlier frame can survive into the next one (the in-game trails).
	'+gl_clear', '1'
)

// A phone has no keyboard and iOS has never shipped Pointer Lock, so the
// engine's own on-screen touch controls are the only way to move or look.
// They default to off everywhere except Android. Window-only: this file also
// runs inside every pthread worker.
// Graphics quality, picked on the start page or in the in-game menu.
// standard: 540p, quarter-size textures (the safe default for older phones)
// hd: 720p, half-size textures
// max: the screen's full resolution, full-size textures (uses the most memory)
const RENDER360_QUALITY = {
	standard: { phoneHeight: 540, desktopHeight: 720, picmip: 2 },
	hd: { phoneHeight: 720, desktopHeight: 1080, picmip: 1 },
	max: { phoneHeight: 4096, desktopHeight: 4096, picmip: 0 }
}
let render360Quality = 'standard'
if(render360IsWindow) {
	try {
		const saved = localStorage.getItem('render360Quality')
		if(saved && RENDER360_QUALITY[saved]) render360Quality = saved
	} catch(_) {}
	Module.render360Quality = render360Quality
}

if(render360IsWindow) {
	let coarsePointer = false
	try { coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) } catch(_) {}
	const phone = navigator.maxTouchPoints > 0 && coarsePointer
	if(phone) {
		// Source's touch layer only provides camera look (see the touch.cfg
		// written in preRun); buttons and movement are the HTML controller in
		// shell.html. Its own textured buttons stay hidden: Portal does not
		// ship materials/vgui/touch, so they would draw as missing textures.
		Module['arguments'].push('+touch_enable', '1', '+touch_draw', '0')
		// Quarter-size textures. On a 6 inch screen the difference is hard to
		// see, and textures are the largest thing a map load adds to both the
		// Wasm heap and GPU memory, which is where iOS kills the page.
		Module['arguments'].push('+mat_picmip', String(RENDER360_QUALITY[render360Quality].picmip))
		// Cheaper rendering features for a phone GPU. Bump maps and specular
		// stay on: turning them off makes Portal's materials ask for a
		// $bumpmap texture that is not loaded (console errors).
		Module['arguments'].push(
			'+r_shadowrendertotexture', '0',
			'+r_flashlightdepthtexture', '0',
			'+r_waterforceexpensive', '0',
			'+mat_reducefillrate', '1',
			'+mat_antialias', '0',
			'+mat_forceaniso', '0'
		)
	}

	// Render at the shape of the screen, so the game fills it edge to edge
	// instead of sitting in a 4:3 box. Phones always play in landscape, so use
	// the long side as width even when the page is opened in portrait. The
	// short side is capped: every extra pixel costs fill rate and memory.
	let longSide = 0
	let shortSide = 0
	try {
		const w = phone ? screen.width : window.innerWidth
		const h = phone ? screen.height : window.innerHeight
		longSide = Math.max(w, h)
		shortSide = Math.min(w, h)
	} catch(_) {}
	if(longSide > 0 && shortSide > 0) {
		const dpr = Math.max(1, Number(window.devicePixelRatio || 1))
		const quality = RENDER360_QUALITY[render360Quality]
		const height = Math.max(360, Math.min(phone ? quality.phoneHeight : quality.desktopHeight, Math.round(shortSide * dpr)))
		const width = Math.round(height * longSide / shortSide / 2) * 2
		Module.render360GameSize = { width, height }
		Module['arguments'].push('-w', String(width), '-h', String(height))
		try { globalThis.render360Layout?.() } catch(_) {}
	}
}

class DataLoader {
	mapsOrdered = [
		'background1',
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
		'testchmb_a_15'
	]

	loadedMaps = {}
	bootOverlayPromise = null
	residentBytes = 0
	residentFileSizes = new Map()

	async loadMapWithDeps(mapName) {
		const index = this.mapsOrdered.indexOf(mapName)
		if(index === -1) throw new Error(`no such map: ${mapName}`)

		await this.loadBootOverlay()

		for(let i = 0; i < index + 1; i++) {
			await this.loadMapCached(this.mapsOrdered[i])
		}
	}

	async loadMapCached(mapName) {
		if(mapName in this.loadedMaps) return this.loadedMaps[mapName]
		const promise = this.loadMap(mapName)
		this.loadedMaps[mapName] = promise
		return promise
	}

	async setProgress(mapName, progress) {
		// This class is also present when hl2_launcher.js is imported by a pthread.
		// Never assume DOM globals exist in WorkerGlobalScope.
		if(typeof spinnerElement === 'undefined' || typeof statusElement === 'undefined' || typeof progressElement === 'undefined') return
		if(progress < 1) {
			spinnerElement.style.display = ''
			statusElement.innerText = `Loading map data ${mapName}`
			progressElement.hidden = false
			progressElement.value = Number.isFinite(progress) ? progress : 0
		} else {
			spinnerElement.style.display = 'none'
			statusElement.innerText = ''
			progressElement.hidden = true
		}
	}

	installOwnedFile(path, blob) {
		if(/\.(?:dll|dylib|exe|so)$/i.test(path)) {
			Module.printErr?.(`[Render360] ignored native binary from game-data chunk: ${path}`)
			return
		}

		const slash = path.lastIndexOf('/')
		const parent = slash > 0 ? path.slice(0, slash) : '/'
		const name = slash >= 0 ? path.slice(slash + 1) : path
		const oldSize = Number(this.residentFileSizes.get(path) || 0)
		const newSize = Number(blob?.byteLength || blob?.length || 0)
		FS.mkdirTree(parent)
		try { FS.unlink(path) } catch(_) {}

		if(typeof FS.createDataFile === 'function') {
			FS.createDataFile(parent, name, blob, true, true, true)
		} else {
			FS.writeFile(path, blob)
		}

		this.residentFileSizes.set(path, newSize)
		this.residentBytes += newSize - oldSize
		Module.render360ResidentBytes = this.residentBytes
		Module.render360ResidentFiles = this.residentFileSizes.size
		if((this.residentFileSizes.size & 127) === 0) render360PersistCrashState()
	}

	writeDataBuffer(arrayBuffer, label) {
		if(!(arrayBuffer instanceof ArrayBuffer)) throw new Error(`${label}: response is not binary data`)
		const dv = new DataView(arrayBuffer)
		const decoder = new TextDecoder()
		let offset = 0
		let fileCount = 0
		while(offset < dv.byteLength) {
			if(dv.byteLength - offset < 8) throw new Error(`${label}: truncated record header at ${offset}/${dv.byteLength}`)
			const pathLen = dv.getUint32(offset, true)
			const dataLen = dv.getUint32(offset + 4, true)
			const recordEnd = offset + 8 + pathLen + dataLen
			if(pathLen === 0 || pathLen > 1024 * 1024 || dataLen > 512 * 1024 * 1024 || recordEnd > dv.byteLength) {
				throw new Error(`${label}: record ${fileCount} exceeds buffer (${recordEnd}/${dv.byteLength})`)
			}
			const path = decoder.decode(new Uint8Array(dv.buffer, offset + 8, pathLen))
			const blob = new Uint8Array(dataLen)
			blob.set(new Uint8Array(dv.buffer, offset + 8 + pathLen, dataLen))
			offset = recordEnd
			fileCount++
			this.installOwnedFile(path, blob)
		}
		return { fileCount, byteLength: dv.byteLength }
	}

	async streamDataResponse(response, label, onProgress) {
		if(!response.body || typeof response.body.getReader !== 'function') {
			Module.printErr?.(`[Render360] ${label}: streaming unavailable, using bounded fallback parser`)
			return this.writeDataBuffer(await response.arrayBuffer(), label)
		}

		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		const totalLength = Number(response.headers.get('Content-Length') || 0)
		let chunk = new Uint8Array(0)
		let chunkOffset = 0
		let consumed = 0
		let fileCount = 0

		const report = () => {
			if(onProgress && totalLength > 0) onProgress(Math.min(0.999, consumed / totalLength))
		}

		const readExactly = async (length, allowCleanEof = false) => {
			if(length === 0) return new Uint8Array(0)
			const out = new Uint8Array(length)
			let written = 0
			while(written < length) {
				if(chunkOffset >= chunk.length) {
					const next = await reader.read()
					if(next.done) {
						if(allowCleanEof && written === 0) return null
						throw new Error(`${label}: truncated stream after ${consumed} bytes`)
					}
					chunk = next.value || new Uint8Array(0)
					chunkOffset = 0
					if(chunk.length === 0) continue
				}
				const take = Math.min(length - written, chunk.length - chunkOffset)
				out.set(chunk.subarray(chunkOffset, chunkOffset + take), written)
				chunkOffset += take
				written += take
				consumed += take
				report()
			}
			return out
		}

		try {
			for(;;) {
				const header = await readExactly(8, true)
				if(header === null) break
				const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
				const pathLen = view.getUint32(0, true)
				const dataLen = view.getUint32(4, true)
				if(pathLen === 0 || pathLen > 1024 * 1024 || dataLen > 512 * 1024 * 1024) {
					throw new Error(`${label}: invalid record ${fileCount} lengths path=${pathLen} data=${dataLen}`)
				}
				const path = decoder.decode(await readExactly(pathLen))
				const blob = await readExactly(dataLen)
				this.installOwnedFile(path, blob)
				fileCount++

				if((fileCount & 31) === 0) await new Promise(resolve => setTimeout(resolve, 0))
			}
		} finally {
			try { reader.releaseLock() } catch(_) {}
		}

		if(onProgress) onProgress(1)
		return { fileCount, byteLength: consumed }
	}

	async loadBootOverlay() {
		if(this.bootOverlayPromise) return this.bootOverlayPromise
		this.bootOverlayPromise = (async () => {
			try {
				const response = await fetch('render360-bootstrap-overlay.data', {
					cache: 'no-store',
					credentials: 'same-origin'
				})
				if(response.status === 404) {
					Module.print?.('[Render360] no local boot overlay present; continuing with base chunk')
					return
				}
				if(!response.ok) throw new Error(`HTTP ${response.status}`)
				const result = await this.streamDataResponse(response, 'boot overlay')
				const snapshot = globalThis.render360MemorySnapshot?.('boot-overlay-ready')
				Module.print?.(`[Render360] loaded boot overlay: ${result.fileCount} records, ${result.byteLength} bytes; memory=${JSON.stringify(snapshot || {})}`)
			} catch(error) {
				Module.printErr?.(`[Render360] boot overlay load failed: ${error?.stack || error}`)
			}
		})()
		return this.bootOverlayPromise
	}

	async loadMap(mapName) {
		this.setProgress(mapName, 0)
		try {
			const response = await fetch(`chunks/${mapName}.data`, {
				cache: 'no-store',
				credentials: 'same-origin'
			})
			if(!response.ok) throw new Error(`cannot load map ${mapName}: HTTP ${response.status}`)
			const result = await this.streamDataResponse(
				response,
				`${mapName}.data`,
				progress => this.setProgress(mapName, progress)
			)
			this.setProgress(mapName, 1)
			const snapshot = globalThis.render360MemorySnapshot?.(`map-ready:${mapName}`)
			Module.print?.(`[Render360] loaded ${mapName}.data: ${result.fileCount} records, ${result.byteLength} bytes; memory=${JSON.stringify(snapshot || {})}`)
		} catch(error) {
			this.setProgress(mapName, 1)
			Module.printErr?.(`[Render360] ${error?.stack || error}`)
			throw error
		}
	}
}

const dataLoader = new DataLoader()

Module.downloadMap = (lock, mapName) => {
	dataLoader.loadMapWithDeps(mapName).then(() => {
		Atomics.store(HEAP32, lock, 0)
		Atomics.notify(HEAP32, lock)
	}).catch(error => {
		Module.printErr?.(`[Render360] map dependency load failed for ${mapName}: ${error?.stack || error}`)
		Atomics.store(HEAP32, lock, 0)
		Atomics.notify(HEAP32, lock)
	})
}
// --- On-demand engine modules ----------------------------------------------
// The side modules are not preloaded (that kept ~37 MiB of .so bytes resident
// for the whole page). Sys_LoadModule asks for each one just before dlopen and
// waits; we fetch it plus everything it lists as DT_NEEDED into MEMFS at "/",
// where the old preload put them. dlopen needs the file in MEMFS: that is how
// it hands the bytes to the other threads (dso->file_data), and without it
// Emscripten aborts the page.
function render360NeededLibs(bytes) {
	const out = []
	if(bytes.length < 8 || bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) return out
	let i = 8
	const uleb = () => {
		let result = 0, shift = 0, byte
		do { byte = bytes[i++]; result += (byte & 0x7f) * 2 ** shift; shift += 7 } while(byte & 0x80)
		return result
	}
	const decoder = new TextDecoder()
	// dylink.0 is always the first section of a side module.
	if(bytes[i++] !== 0) return out
	const end = uleb() + i
	const nameLen = uleb()
	const name = decoder.decode(bytes.subarray(i, i + nameLen))
	i += nameLen
	if(name !== 'dylink.0') return out
	while(i < end) {
		const sub = bytes[i++]
		const subEnd = uleb() + i
		if(sub === 2) {   // WASM_DYLINK_NEEDED
			let count = uleb()
			while(count--) {
				const len = uleb()
				out.push(decoder.decode(bytes.subarray(i, i + len)))
				i += len
			}
		}
		i = subEnd
	}
	return out
}

function render360SharedModule(name) {
	try {
		if(typeof sharedModules !== 'undefined' && sharedModules && sharedModules[name]) return sharedModules[name]
	} catch(_) {}
	return null
}

async function render360EnsureModuleFile(name, seen) {
	if(seen.has(name)) return
	seen.add(name)
	// Already compiled once on this thread and handed to every Worker: dlopen
	// takes it straight from sharedModules, so the raw bytes are not needed
	// in MEMFS or (via dso->file_data) in the Wasm heap.
	if(render360SharedModule(name)) return
	const path = '/' + name
	try { FS.stat(path); return } catch(_) {}

	globalThis.render360SetPhase?.(`module-fetch:${name}`)
	const response = await fetch(name, { credentials: 'same-origin' })
	if(!response.ok) throw new Error(`HTTP ${response.status} for ${name}`)
	const bytes = new Uint8Array(await response.arrayBuffer())
	const needed = render360NeededLibs(bytes)
	FS.writeFile(path, bytes)
	for(const dep of needed) await render360EnsureModuleFile(dep, seen)
}

Module.render360FetchModule = (lock, name) => {
	const release = () => {
		Atomics.store(HEAP32, lock, 0)
		Atomics.notify(HEAP32, lock)
	}
	render360EnsureModuleFile(String(name), new Set()).then(release, error => {
		// Never leave the engine thread parked: release it and let dlopen
		// report the missing module through Source's own error path.
		Module.printErr?.(`[Render360] module fetch failed for ${name}: ${error?.stack || error}`)
		release()
	})
}

// Exposed for tests.
globalThis.render360NeededLibs = render360NeededLibs

// ---------------------------------------------------------------------------
// Compile every engine module ONCE and share it with all threads.
//
// Source dlopen()s its modules from the PROXY_TO_PTHREAD application thread.
// Emscripten only shares a compiled module with other Workers when the
// browser's main thread loaded it (libdylink.js postInstantiation ->
// sharedModules), which never happens for a dlopen made on a pthread. Every
// engine thread (4 on iPhone: app, file I/O, texture loader, texture reader)
// therefore copied the module out of the Wasm heap and compiled its own
// private copy, all at the same moment. For libserver.so (11.5 MB) that burst
// is where iOS killed the page.
//
// Instead, before main() runs, the main thread fetches and compiles each
// module once, keeps the compiled WebAssembly.Module in sharedModules (new
// Workers receive it in their 'load' message) and posts it to the Workers
// that already exist. A WebAssembly.Module sent to a Worker shares its
// compiled code instead of compiling again, and loadLibData() returns it
// before ever looking for file bytes.
const RENDER360_NOT_PRECOMPILED = new Set([
	'liblauncher.so',        // loaded by the main thread via dynamicLibraries
	'libsourcevr.so',
	'libvideo_bink.so',
	'libvideo_webm.so',
	'libvideo_quicktime.so',
	'libstdshader_dbg.so',
	'libstdshader_dx6.so',
	'libstdshader_dx7.so',
	'libstdshader_dx8.so',
])

if(!render360IsWindow && typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
	// No 'cmd' key, so Emscripten's own handler ignores this message silently.
	self.addEventListener('message', event => {
		const modules = event?.data?.render360SharedModules
		if(!modules || typeof sharedModules === 'undefined' || !sharedModules) return
		for(const name of Object.keys(modules)) sharedModules[name] = modules[name]
	})
}

function render360ShareModulesWithWorkers(modules) {
	if(typeof PThread === 'undefined' || !PThread) return 0
	const workers = [].concat(PThread.unusedWorkers || [], PThread.runningWorkers || [])
	for(const worker of workers) {
		try { worker.postMessage({ render360SharedModules: modules }) } catch(error) {
			Module.printErr?.(`[Render360] could not share modules with a worker: ${error?.message || error}`)
		}
	}
	return workers.length
}

async function render360PrecompileModules() {
	if(typeof sharedModules === 'undefined' || !sharedModules) {
		Module.print?.('[Render360] sharedModules unavailable; modules load per thread')
		return
	}
	let names = []
	try {
		const response = await fetch('render360-wasm-side-modules.txt', { cache: 'no-store', credentials: 'same-origin' })
		if(response.ok) names = (await response.text()).split(/\s+/).filter(name => /\.so$/.test(name))
	} catch(_) {}
	names = names.filter(name => !RENDER360_NOT_PRECOMPILED.has(name) && !sharedModules[name])

	const compiled = {}
	let bytesTotal = 0
	for(let i = 0; i < names.length; i++) {
		const name = names[i]
		render360SetPhase(`module-compile:${name}`)
		try { Module.setStatus?.(`Preparing Portal (${i}/${names.length})`) } catch(_) {}
		try {
			const response = await fetch(name, { credentials: 'same-origin' })
			if(!response.ok) throw new Error(`HTTP ${response.status}`)
			let buffer = await response.arrayBuffer()
			bytesTotal += buffer.byteLength
			const module = await WebAssembly.compile(buffer)
			buffer = null
			sharedModules[name] = module
			compiled[name] = module
		} catch(error) {
			// Not fatal: this module falls back to the per-thread path.
			Module.printErr?.(`[Render360] precompile skipped ${name}: ${error?.message || error}`)
		}
	}
	const workers = render360ShareModulesWithWorkers(compiled)
	try { Module.setStatus?.(`Preparing Portal (${names.length}/${names.length})`) } catch(_) {}
	Module.print?.(`[Render360] compiled ${Object.keys(compiled).length}/${names.length} modules once (${(bytesTotal / 1048576).toFixed(1)} MiB) and shared them with ${workers} workers`)
	render360SetPhase('modules-shared')
}

if(render360IsWindow && !render360ProbableProcessReload) {
	Module['preRun'] = Module['preRun'] || []
	Module['preRun'].push(() => {
		addRunDependency('render360-precompile-modules')
		render360PrecompileModules()
			.catch(error => Module.printErr?.(`[Render360] module precompile failed: ${error?.stack || error}`))
			.finally(() => removeRunDependency('render360-precompile-modules'))
	})
}

// ---------------------------------------------------------------------------
// WebGL context loss.
//
// The context lives on the engine's pthread (OffscreenCanvas), so the shell's
// listener on the page canvas never fires. When iOS reclaims GPU memory it
// loses the context; createShader() then returns null and ToGL's compile-error
// path calls getShaderInfoLog(null), which throws a TypeError that hides the
// real cause. Report the loss itself, and make the info-log getters tolerate a
// null object so the report is what the player sees.
;(() => {
	const GL2 = typeof WebGL2RenderingContext !== 'undefined' ? WebGL2RenderingContext : null
	if(!GL2) return
	let reported = false
	function reportLost(where, ctx) {
		if(reported) return
		reported = true
		let lost = false
		try { lost = !!ctx?.isContextLost?.() } catch(_) {}
		const text = lost
			? `[Render360 WebGL] context lost (${where}): iOS reclaimed graphics memory`
			: `[Render360 WebGL] null object passed to ${where} while the context is alive`
		try { render360SetPhase(lost ? `webgl-context-lost:${where}` : `webgl-null-object:${where}`) } catch(_) {}
		render360Log(text)
	}
	for(const name of ['getShaderInfoLog', 'getProgramInfoLog']) {
		const original = GL2.prototype[name]
		if(typeof original !== 'function') continue
		GL2.prototype[name] = function(object) {
			if(!object) { reportLost(name, this); return '' }
			return original.call(this, object)
		}
	}
	const Canvas = typeof OffscreenCanvas !== 'undefined' ? OffscreenCanvas : null
	if(Canvas && typeof Canvas.prototype.getContext === 'function') {
		const getContext = Canvas.prototype.getContext
		Canvas.prototype.getContext = function(type, attributes) {
			const ctx = getContext.call(this, type, attributes)
			if(ctx && /webgl/i.test(String(type)) && !this.render360LossHooked) {
				this.render360LossHooked = true
				this.addEventListener('webglcontextlost', event => {
					reportLost('webglcontextlost', ctx)
					try { event.preventDefault() } catch(_) {}
				})
			}
			return ctx
		}
	}
})()

// GL probe. In-game frames have shown trails and saturated colours that a
// still frame (menu, pause) does not, and the cause can only be seen on the
// phone. This records, per presented frame, what the engine actually asks
// WebGL to do -- clears (and the scissor/mask state they run under), how many
// draws blend and with which factors, draws without depth test or depth
// writes, GL errors -- and writes a short summary line into the diagnostics
// now and then. State is shadowed from the calls themselves, so it costs a
// few property writes per call and no GPU queries (getError once per report).
if(!render360IsWindow && typeof WebGL2RenderingContext !== 'undefined') (() => {
	const P = WebGL2RenderingContext.prototype
	const S = { blend: false, depthTest: false, scissor: false, depthMask: true, colorMask: 'rgba', blend2: '1/0', drawFb: null, viewport: '' }
	const BLEND = 0x0BE2, DEPTH_TEST = 0x0B71, SCISSOR_TEST = 0x0C11
	const FB = 0x8D40, DRAW_FB = 0x8CA9
	const FACTORS = { 0: '0', 1: '1', 0x300: 'sc', 0x301: '1-sc', 0x302: 'sa', 0x303: '1-sa', 0x304: 'da', 0x305: '1-da', 0x306: 'dc', 0x307: '1-dc', 0x308: 'sat' }
	const factor = f => FACTORS[f] ?? Number(f).toString(16)
	let frame = null
	const resetFrame = () => { frame = { draws: 0, blendDraws: 0, noDepthTest: 0, noDepthWrite: 0, noColor: 0, funcs: {}, clears: [], fbSwitches: 0, uploads: 0, readbacks: 0, readbackBytes: 0, start: performance.now() } }
	resetFrame()
	let frames = 0, reports = 0
	const REPORT_AT = new Set([5, 30, 120, 300, 600])
	const wrap = (name, before) => {
		const original = P[name]
		if(typeof original !== 'function') return
		P[name] = function(...args) {
			try { before.apply(this, args) } catch(_) {}
			return original.apply(this, args)
		}
	}
	const setCap = (cap, on) => {
		if(cap === BLEND) S.blend = on
		else if(cap === DEPTH_TEST) S.depthTest = on
		else if(cap === SCISSOR_TEST) S.scissor = on
	}
	wrap('enable', cap => setCap(cap, true))
	wrap('disable', cap => setCap(cap, false))
	wrap('depthMask', on => { S.depthMask = !!on })
	wrap('colorMask', (r, g, b, a) => { S.colorMask = ((r ? 'r' : '') + (g ? 'g' : '') + (b ? 'b' : '') + (a ? 'a' : '')) || 'none' })
	wrap('blendFunc', (src, dst) => { S.blend2 = factor(src) + '/' + factor(dst) })
	wrap('blendFuncSeparate', (src, dst, srcA, dstA) => { S.blend2 = factor(src) + '/' + factor(dst) + (srcA !== src || dstA !== dst ? ',' + factor(srcA) + '/' + factor(dstA) : '') })
	wrap('viewport', (x, y, w, h) => { S.viewport = w + 'x' + h })
	wrap('bindFramebuffer', (target, fb) => {
		if(target !== FB && target !== DRAW_FB) return
		if(fb !== S.drawFb) frame.fbSwitches++
		S.drawFb = fb
	})
	wrap('clear', mask => {
		if(frame.clears.length >= 10) return
		const bits = (mask & 0x4000 ? 'C' : '') + (mask & 0x100 ? 'Z' : '') + (mask & 0x400 ? 'S' : '')
		frame.clears.push(bits + (S.scissor ? '(scissor)' : '') + (S.depthMask ? '' : '(nozwrite)') +
			(S.colorMask !== 'rgba' ? '(mask:' + S.colorMask + ')' : '') + (S.drawFb ? '' : '@screen') + '@' + S.viewport)
	})
	const onDraw = () => {
		frame.draws++
		if(S.blend) { frame.blendDraws++; frame.funcs[S.blend2] = (frame.funcs[S.blend2] || 0) + 1 }
		if(!S.depthTest) frame.noDepthTest++
		if(!S.depthMask) frame.noDepthWrite++
		if(S.colorMask === 'none') frame.noColor++
	}
	for(const name of ['drawElements', 'drawArrays', 'drawRangeElements', 'drawElementsInstanced', 'drawArraysInstanced']) wrap(name, onDraw)
	// Texture uploads: lit surfaces render black, so check whether the texel
	// data that reaches WebGL is actually filled in (lightmap pages are
	// updated with texSubImage2D). Logs the first few uploads with a sample of
	// their bytes.
	const U = { rowLength: 0, skipPixels: 0, skipRows: 0 }
	wrap('pixelStorei', (pname, value) => {
		if(pname === 0x0CF2) U.rowLength = value
		else if(pname === 0x0CF4) U.skipPixels = value
		else if(pname === 0x0CF3) U.skipRows = value
	})
	const BYTES_PER_TEXEL = { 0x1908: 4, 0x1907: 3, 0x1909: 1, 0x190A: 2, 0x1903: 1, 0x8227: 2 }
	const sampleTexels = (w, h, format, type, data, offset) => {
		if(!data || typeof data !== 'object' || type !== 0x1401) return 'no-data'
		const bpp = BYTES_PER_TEXEL[format]
		if(!bpp) return 'fmt 0x' + format.toString(16)
		const rowBytes = (U.rowLength || w) * bpp
		const base = (offset || 0) + U.skipRows * rowBytes + U.skipPixels * bpp
		const rows = Math.min(h, 16), cols = Math.min(w * bpp, 512)
		let sum = 0, n = 0, nonzero = 0
		for(let y = 0; y < rows; y++) {
			const row = base + Math.floor(y * h / rows) * rowBytes
			for(let x = 0; x < cols; x++) {
				const v = data[row + x] | 0
				sum += v; n++; if(v) nonzero++
			}
		}
		return n ? `mean ${Math.round(sum / n)} nonzero ${Math.round(100 * nonzero / n)}%` : 'empty'
	}
	let subUploadLogs = 0, imageUploadLogs = 0
	wrap('texSubImage2D', (target, level, x, y, w, h, format, type, data, offset) => {
		frame.uploads++
		if(subUploadLogs >= 10 || w * h < 64) return
		subUploadLogs++
		render360Log(`[Render360 GL] texSubImage2D ${w}x${h} at ${x},${y} level ${level} fmt 0x${Number(format).toString(16)} rowLength ${U.rowLength}: ${sampleTexels(w, h, format, type, data, offset)}`)
	})
	wrap('texImage2D', (target, level, internalformat, w, h, border, format, type, data, offset) => {
		frame.uploads++
		if(imageUploadLogs >= 8 || level !== 0 || w < 128 || h < 128 || typeof w !== 'number') return
		imageUploadLogs++
		render360Log(`[Render360 GL] texImage2D ${w}x${h} ifmt 0x${Number(internalformat).toString(16)} fmt 0x${Number(format).toString(16)}: ${sampleTexels(w, h, format, type, data, offset)}`)
	})

	// GPU buffer read-backs stall Safari until the GPU catches up; count them.
	wrap('getBufferSubData', (target, offset, dst, dstOffset, length) => {
		frame.readbacks++
		frame.readbackBytes += Number(length) || 0
	})

	// Error hunt: during a few frames, check glGetError after every call and
	// name the calls WebGL rejects (diagnostics show a GL error every frame).
	let hunting = false
	const huntFound = new Map()
	const fmtArg = a => typeof a === 'number'
		? (Number.isInteger(a) && a > 255 ? '0x' + a.toString(16) : String(a))
		: (a === null ? 'null' : (a?.constructor?.name || typeof a))
	const getError = P.getError
	const huntOriginals = new Map()
	// Wrappers go on only for the hunt window and come off after, so normal
	// frames pay nothing for them.
	const startHunt = () => {
		for(const name of Object.getOwnPropertyNames(P)) {
			if(name === 'getError' || name === 'constructor' || name === 'isContextLost') continue
			const desc = Object.getOwnPropertyDescriptor(P, name)
			if(!desc || typeof desc.value !== 'function') continue
			const original = desc.value
			huntOriginals.set(name, original)
			P[name] = function(...args) {
				const result = original.apply(this, args)
				let e = 0
				try { e = getError.call(this) } catch(_) {}
				if(e && huntFound.size < 12) {
					const key = name + ':' + e
					let status = ''
					if(e === 0x506) {
						try { status = ' fbstatus 0x' + this.checkFramebufferStatus(0x8CA9).toString(16) + '/0x' + this.checkFramebufferStatus(0x8CA8).toString(16) } catch(_) {}
					}
					if(!huntFound.has(key)) huntFound.set(key, `${name}(${args.slice(0, 7).map(fmtArg).join(', ')}) -> 0x${e.toString(16)}${status}`)
				}
				return result
			}
		}
		hunting = true
	}
	const stopHunt = () => {
		for(const [name, original] of huntOriginals) P[name] = original
		huntOriginals.clear()
		hunting = false
	}
	// Profile windows: count WebGL calls by name and time spent inside them,
	// to tell a GPU/driver-bound frame from one where the engine's own code
	// (or a blocking read) eats the time.
	const profOriginals = new Map()
	let profCounts = null, profGlMs = 0, profStart = 0
	const startProfile = () => {
		profCounts = new Map(); profGlMs = 0; profStart = performance.now()
		for(const name of Object.getOwnPropertyNames(P)) {
			if(name === 'constructor') continue
			const desc = Object.getOwnPropertyDescriptor(P, name)
			if(!desc || typeof desc.value !== 'function') continue
			const original = desc.value
			profOriginals.set(name, original)
			P[name] = function(...args) {
				const t0 = performance.now()
				const result = original.apply(this, args)
				const dt = performance.now() - t0
				profGlMs += dt
				const c = profCounts.get(name)
				if(c) { c.n++; c.ms += dt } else profCounts.set(name, { n: 1, ms: dt })
				return result
			}
		}
	}
	const stopProfile = (label) => {
		for(const [name, original] of profOriginals) P[name] = original
		profOriginals.clear()
		const wall = performance.now() - profStart
		const top = [...profCounts.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 8)
			.map(([k, v]) => `${k} x${v.n} ${v.ms.toFixed(0)}ms`).join(', ')
		render360Log(`[Render360 GL] profile ${label}: ${(wall / 1000).toFixed(1)} s wall, ${(profGlMs / 1000).toFixed(1)} s inside WebGL; top: ${top}`)
		profCounts = null
	}
	const PROFILE_WINDOWS = [[11, 13], [60, 63], [240, 243]]
	const HUNT_WINDOWS = [[6, 8], [200, 203], [450, 453]]

	// Heartbeat: a line every ~10 s while frames are being presented, so a
	// freeze shows up as the time the lines stop.
	let lastBeat = 0, beatFrames = 0, beats = 0, slowFrames = 0, lastPing = 0

	wrap('blitFramebuffer', function() {
		if(S.drawFb) return
		// A blit to the canvas is ToGL presenting a frame.
		frames++
		for(const [start, end] of PROFILE_WINDOWS) {
			if(frames === start && !profCounts && !hunting) startProfile()
			if(frames === end && profCounts) stopProfile(`frames ${start}-${end}`)
		}
		for(const [start, end] of HUNT_WINDOWS) {
			if(frames === start && !hunting) { try { getError.call(this) } catch(_) {} startHunt() }
			if(frames === end && hunting) {
				stopHunt()
				render360Log(`[Render360 GL] error hunt frames ${start}-${end}: ${[...huntFound.values()].join(' | ') || 'no GL errors'}`)
				huntFound.clear()
			}
		}
		const now = performance.now()
		if(now - lastPing > 2000) {
			lastPing = now
			try { render360CrashChannel?.postMessage({ type: 'render360-frame', launchId: render360LaunchId, frames }) } catch(_) {}
		}
		const frameMs = now - frame.start
		if(frameMs > 1500 && slowFrames < 15) {
			slowFrames++
			render360Log(`[Render360 GL] slow frame ${frames}: ${(frameMs / 1000).toFixed(1)} s, ${frame.draws} draws, ${frame.uploads} uploads, ${frame.readbacks} buffer read-backs (${Math.round(frame.readbackBytes / 1024)} KiB)`)
			if(profCounts) stopProfile(`through slow frame ${frames}`)
		}
		if(!lastBeat) { lastBeat = now; beatFrames = frames }
		else if(now - lastBeat > 10000 && beats < 60) {
			beats++
			const fps = (frames - beatFrames) * 1000 / (now - lastBeat)
			render360Log(`[Render360 GL] alive: frame ${frames}, ${fps.toFixed(1)} fps, ${frame.draws} draws, ${frame.uploads} uploads, ${frame.readbacks} read-backs this frame`)
			lastBeat = now; beatFrames = frames
		}
		if(REPORT_AT.has(frames) || (frames > 600 && frames % 900 === 0 && reports < 20)) {
			reports++
			let err = 0
			try { err = this.getError() } catch(_) {}
			const funcs = Object.entries(frame.funcs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ' x' + v).join(', ')
			render360Log(`[Render360 GL] frame ${frames}: draws ${frame.draws}, blended ${frame.blendDraws} [${funcs}], ` +
				`no-depth-test ${frame.noDepthTest}, no-depth-write ${frame.noDepthWrite}, no-color ${frame.noColor}, ` +
				`fb-switches ${frame.fbSwitches}, clears ${frame.clears.join(' ') || 'none'}, glError 0x${err.toString(16)}`)
		}
		resetFrame()
	})
})()

// A Worker's uncaught error reaches the page only as "Pthread 0x... sent an
// error!" with the message and no stack. Log the stack from inside the Worker
// so diagnostics show which code path failed.
if(!render360IsWindow && typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
	self.addEventListener('error', event => {
		const error = event?.error
		const stack = String(error?.stack || '').split('\n').slice(0, 40)
			.map(frame => frame.replace(/@\[wasm code\]$/, '').replace(/^(\d+)@wasm-function\[\1\]$/, 'f$1'))
			.join(' | ')
		render360Log(`[Render360 worker stack] ${error?.message || event?.message || 'error'} :: ${stack || '<no stack>'}`)
	})
}

// ---------------------------------------------------------------------------
// Files the engine expects that a retail Windows Portal folder lacks.
//
// Fonts: without fontconfig, vgui maps every system font (Tahoma, Verdana,
// Lucida Console, ...) to platform/resource/linux_fonts/dejavusans*.ttf
// (linuxfont.cpp TryFindFont). The old packed chunks carried those files;
// Phase 3 reads the user's own folder, which does not, so every system-font
// string - main menu, console, HUD - drew as solid blocks. Only fonts that
// Portal ships itself rendered.
//
// touch.cfg: replaces Source's default touch layout with one full-screen
// camera-look zone, so the HTML controller owns every button.
const RENDER360_FONT_FILES = [
	['dejavusans.ttf', ['dejavusans.ttf', 'dejavusans-oblique.ttf']],
	['dejavusans-bold.ttf', ['dejavusans-bold.ttf', 'dejavusans-boldoblique.ttf']],
	['dejavusansmono.ttf', ['dejavusansmono.ttf', 'liberationmono-regular.ttf']],
]
const RENDER360_TOUCH_CFG = [
	'touch_removeall',
	'touch_addbutton "look" "" "_look" 0.000000 0.000000 1.000000 1.000000 255 255 255 0 0',
	'touch_config_file "touch.cfg"',
	''
].join('\n')

async function render360InstallSupportFiles(phone) {
	const fontDir = '/platform/resource/linux_fonts'
	let fonts = 0
	for(const [source, names] of RENDER360_FONT_FILES) {
		try {
			const response = await fetch(`fonts/${source}`, { credentials: 'same-origin' })
			if(!response.ok) throw new Error(`HTTP ${response.status}`)
			const bytes = new Uint8Array(await response.arrayBuffer())
			FS.mkdirTree(fontDir)
			const primary = `${fontDir}/${names[0]}`
			try { FS.unlink(primary) } catch(_) {}
			FS.writeFile(primary, bytes)
			for(const alias of names.slice(1)) {
				const path = `${fontDir}/${alias}`
				try { FS.unlink(path) } catch(_) {}
				FS.symlink(primary, path)
			}
			fonts++
		} catch(error) {
			Module.printErr?.(`[Render360] font ${source} unavailable: ${error?.message || error}`)
		}
	}
	if(phone) {
		try {
			FS.mkdirTree('/portal/cfg')
			FS.writeFile('/portal/cfg/touch.cfg', RENDER360_TOUCH_CFG)
		} catch(error) {
			Module.printErr?.(`[Render360] touch.cfg not written: ${error?.message || error}`)
		}
	}
	Module.print?.(`[Render360] installed ${fonts}/${RENDER360_FONT_FILES.length} fallback fonts${phone ? ' and the touch look layout' : ''}`)
}

if(render360IsWindow && !render360ProbableProcessReload) {
	let phone = false
	try { phone = navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches } catch(_) {}
	Module['preRun'] = Module['preRun'] || []
	Module['preRun'].push(() => {
		addRunDependency('render360-support-files')
		render360InstallSupportFiles(phone)
			.catch(error => Module.printErr?.(`[Render360] support files failed: ${error?.stack || error}`))
			.finally(() => removeRunDependency('render360-support-files'))
	})
}

// ---------------------------------------------------------------------------
// Game audio.
//
// engine/audio/snd_dev_sdl.cpp (web build) mixes into its usual ring buffer
// in shared Wasm memory and hands us its address, the byte offset of its
// read cursor (m_readPos) and its pause counter. An AudioWorklet on the
// browser's audio thread plays the ring and advances m_readPos, which is what
// SDL's callback did on desktop; the mixer keeps painting ahead of it.
// iOS only starts audio from a user gesture, so the first tap resumes it, and
// the audio session is "playback" so the ringer switch does not mute the game.
if(render360IsWindow) {
	const WORKLET = `
	class Render360Ring extends AudioWorkletProcessor {
		constructor() {
			super();
			this.c = null;
			this.frac = 0;
			this.port.onmessage = (e) => {
				const d = e.data || {};
				if (d.stop) { this.c = null; return; }
				this.c = d;
				this.i16 = new Int16Array(d.sab);
				this.i32 = new Int32Array(d.sab);
				this.frac = 0;
				this.abs = 0;
			};
		}
		process(inputs, outputs) {
			const out = outputs[0];
			const L = out[0], R = out[1] || out[0];
			const c = this.c;
			if (!c || Atomics.load(this.i32, c.pauseIdx) > 0) {
				L.fill(0); if (R !== L) R.fill(0);
				return true;
			}
			const frames = c.bytes >> 2;
			const base = c.buf >> 1;
			const step = c.rate / sampleRate;
			// Absolute sample time read so far (the engine's "soundtime") and
			// the time the engine has finished writing up to. Never play past
			// what was written: replaying stale ring contents is a buzz.
			const painted = c.paintedIdx >= 0 ? Atomics.load(this.i32, c.paintedIdx) : 0x7fffffff;
			if (painted < this.abs - frames) this.abs = painted;        // engine restarted its clock
			let frame = this.abs % frames;
			let frac = this.frac;
			let i = 0;
			for (; i < L.length; i++) {
				if (this.abs + 1 >= painted) break;
				const next = frame + 1 === frames ? 0 : frame + 1;
				const a = base + frame * 2, b = base + next * 2;
				const l0 = this.i16[a], r0 = this.i16[a + 1];
				L[i] = (l0 + (this.i16[b] - l0) * frac) / 32768;
				if (R !== L) R[i] = (r0 + (this.i16[b + 1] - r0) * frac) / 32768;
				frac += step;
				const whole = frac | 0;
				frac -= whole;
				frame = (frame + whole) % frames;
				this.abs += whole;
			}
			for (; i < L.length; i++) { L[i] = 0; if (R !== L) R[i] = 0; }
			this.frac = frac;
			Atomics.store(this.i32, c.readIdx, frame << 2);
			return true;
		}
	}
	registerProcessor('render360-ring', Render360Ring);
	`

	let audio = null   // { ctx, node, ready }

	function resumeAudio() {
		const ctx = audio?.ctx
		if(!ctx || ctx.state === 'running') return
		ctx.resume().catch(() => {})
	}
	for(const type of ['pointerdown', 'touchend', 'keydown', 'click']) {
		document.addEventListener(type, resumeAudio, { capture: true, passive: true })
	}
	document.addEventListener('visibilitychange', () => {
		if(!audio?.ctx) return
		if(document.hidden) audio.ctx.suspend().catch(() => {})
		else resumeAudio()
	})

	Module.render360AudioStart = (buf, bytes, readPosPtr, pausePtr, rate, paintedPtr) => {
		try { if(navigator.audioSession) navigator.audioSession.type = 'playback' } catch(_) {}
		const sab = (typeof wasmMemory !== 'undefined' && wasmMemory) ? wasmMemory.buffer : HEAP8.buffer
		const config = { sab, buf, bytes, readIdx: readPosPtr >> 2, pauseIdx: pausePtr >> 2, rate,
			paintedIdx: paintedPtr ? paintedPtr >> 2 : -1 }
		const AC = window.AudioContext || window.webkitAudioContext
		if(!AC) { Module.printErr?.('[Render360 audio] Web Audio unavailable'); return }
		let ctx
		try { ctx = new AC({ sampleRate: rate, latencyHint: 'interactive' }) } catch(_) { ctx = new AC() }
		audio = { ctx, node: null }
		resumeAudio()
		if(ctx.audioWorklet && typeof AudioWorkletNode === 'function') {
			const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }))
			ctx.audioWorklet.addModule(url).then(() => {
				URL.revokeObjectURL(url)
				if(audio?.ctx !== ctx) return
				const node = new AudioWorkletNode(ctx, 'render360-ring', { numberOfInputs: 0, outputChannelCount: [2] })
				node.port.postMessage(config)
				node.connect(ctx.destination)
				audio.node = node
				Module.print?.(`[Render360 audio] playing ${bytes}-byte ring at ${rate} Hz through AudioWorklet (output ${ctx.sampleRate} Hz, ${ctx.state})`)
			}).catch(error => Module.printErr?.(`[Render360 audio] worklet failed: ${error?.message || error}`))
		} else {
			Module.printErr?.('[Render360 audio] AudioWorklet unavailable; no game audio')
		}
	}

	Module.render360AudioStop = () => {
		if(!audio) return
		try { audio.node?.port.postMessage({ stop: true }) } catch(_) {}
		try { audio.node?.disconnect() } catch(_) {}
		try { audio.ctx.close() } catch(_) {}
		audio = null
	}
}
