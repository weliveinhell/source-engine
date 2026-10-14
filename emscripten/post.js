

;(() => {
	if(typeof window === 'undefined') return;
	// fix for accidental close via browser shortcut ctrl+w, crouch+move forward obviously
	window.addEventListener('beforeunload', function (event) {
		event.preventDefault()
	})

	canvasElement.onkeypress = e => e.preventDefault()

	addRunDependency('load_game_data')
	dataLoader.loadMapWithDeps('background1').then(x => {
		removeRunDependency('load_game_data')
	}).catch(error => {
		const message = error && error.message ? error.message : String(error)
		console.error('[Render360 game-data load failure]', error && error.stack ? error.stack : error)
		if (typeof render360Report === 'function') {
			render360Report('game-data load failure', message, error)
		}
		// Do not leave Emscripten printing "still waiting on run dependencies"
		// forever after a missing/invalid chunk. Abort the staging runtime with the
		// real cause instead of allowing Source to start with an incomplete FS.
		if (typeof abort === 'function') {
			abort('Portal game-data load failure: ' + message)
			return
		}
		throw error
	})
})();

// Phase 3 keeps retail VPK payloads browser-backed in WORKERFS, but Source's
// startup filesystem calls can be proxied through Emscripten's main-thread JS
// filesystem. A WORKERFS mount local to pool workers therefore is not enough for
// PREINITIALIZATION: filesystem_stdio must be able to open /portal/gameinfo.txt
// before the engine has entered its normal VPK read path.
//
// Copy ONLY tiny bootstrap metadata into the shared/main-thread MEMFS. For VPKs
// create zero-byte namespace placeholders so Source can enumerate familiar file
// names from the shared FS; filesystem_stdio intercepts the actual opens/stats
// and reads the real File/Blob ranges on the Source pthread. No VPK payload,
// maps, textures or audio are copied into MEMFS.
;(() => {
	'use strict'

	if(typeof window === 'undefined' || typeof document === 'undefined') return
	let frame = null
	try { frame = window.frameElement } catch(_) {}
	if(!frame) return
	try {
		if(!new URLSearchParams(location.search).has('render360Phase3')) return
	} catch(_) { return }

	const FILES_TYPE = 'render360-retail-files'
	const REQUEST_TYPE = 'render360-retail-request'
	const DEPENDENCY = 'render360-phase3-startup-metadata'
	const TIMEOUT_MS = 20000
	const token = `phase3-startup-${Date.now()}-${Math.random().toString(16).slice(2)}`
	let held = false
	let finished = false
	let timer = 0

	function normalize(value) {
		return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/')
	}

	function isStartupMetadata(path) {
		return /^(?:portal|hl2|platform)\/(?:gameinfo\.txt|steam\.inf|game\.inf)$/i.test(path)
	}

	function isRetailVpk(path) {
		return /^(?:portal|hl2|platform)\/.+\.vpk$/i.test(path)
	}

	function ensureParent(fullPath) {
		const slash = fullPath.lastIndexOf('/')
		if(slash > 0) FS.mkdirTree(fullPath.slice(0, slash))
	}

	function release() {
		if(!held) return
		held = false
		removeRunDependency(DEPENDENCY)
	}

	function fail(error) {
		clearTimeout(timer)
		const detail = error && error.message ? error.message : String(error)
		const message = `[Render360 Phase 3] startup metadata staging failed: ${detail}`
		try { globalThis.render360SetPhase?.('phase3-startup-metadata-failed') } catch(_) {}
		Module.printErr?.(message)
		if(typeof render360Report === 'function') {
			try { render360Report('Phase 3 startup metadata failure', detail, error) } catch(_) {}
		}
		// Fail closed. Releasing the dependency here would let Source race into the
		// same misleading PREINITIALIZATION/gameinfo failure we are preventing.
		if(typeof abort === 'function') {
			abort(message)
			return
		}
		throw error instanceof Error ? error : new Error(message)
	}

	async function stage(files) {
		let count = 0
		let bytes = 0
		let vpkPlaceholders = 0
		let loosePlaceholders = 0
		let hasPortalGameInfo = false
		for(const item of Array.isArray(files) ? files : []) {
			const path = normalize(item && item.path)
			const file = item && item.file
			if(!path || !file) continue

			const fullPath = '/' + path
			if(isStartupMetadata(path) && typeof file.arrayBuffer === 'function') {
				ensureParent(fullPath)
				const data = new Uint8Array(await file.arrayBuffer())
				FS.writeFile(fullPath, data)
				bytes += data.byteLength
				count++
				if(path.toLowerCase() === 'portal/gameinfo.txt') hasPortalGameInfo = true
				continue
			}

			if(isRetailVpk(path)) {
				ensureParent(fullPath)
				try {
					FS.lookupPath(fullPath, { follow: false })
				} catch(_) {
					FS.writeFile(fullPath, new Uint8Array(0))
				}
				vpkPlaceholders++
				continue
			}

			// Loose retail files (cfg/, scripts/, resource/, maps/) need names
			// in this shared namespace too: Source finds them by *listing*
			// directories (the New Game dialog enumerates cfg/chapter*.cfg),
			// and listings come from here. Opens and stats are intercepted by
			// filesystem_stdio and served from the real File, so a zero-byte
			// name costs nothing and never shadows the content.
			if(/^(?:portal|hl2|platform)\/(?:cfg|scripts|resource|maps)\//i.test(path)) {
				ensureParent(fullPath)
				try {
					FS.lookupPath(fullPath, { follow: false })
				} catch(_) {
					FS.writeFile(fullPath, new Uint8Array(0))
				}
				loosePlaceholders++
			}
		}

		if(!hasPortalGameInfo) {
			throw new Error('portal/gameinfo.txt was not provided by the selected Portal folder')
		}
		const stat = FS.stat('/portal/gameinfo.txt')
		if(!stat || Number(stat.size || 0) <= 0) {
			throw new Error('/portal/gameinfo.txt is empty or not visible in shared MEMFS')
		}
		if(vpkPlaceholders <= 0) {
			throw new Error('no Portal VPK names were exposed to the shared Source namespace')
		}

		Module.render360Phase3StartupMemfsBytes = bytes
		Module.render360Phase3StartupMemfsFiles = count
		Module.render360Phase3VpkPlaceholders = vpkPlaceholders
		Module.print?.(`[Render360 Phase 3] staged ${count} startup metadata files (${bytes} bytes) plus ${vpkPlaceholders} zero-byte VPK and ${loosePlaceholders} loose-file namespace placeholders; retail payload remains browser-backed`)
		try { globalThis.render360SetPhase?.(`phase3-startup-metadata-ready:vpk=${vpkPlaceholders}`) } catch(_) {}
	}

	window.addEventListener('message', event => {
		if(finished || event.origin !== location.origin || event.source !== window.parent) return
		const data = event && event.data
		if(!data || data.type !== FILES_TYPE || data.token !== token) return
		finished = true
		clearTimeout(timer)
		stage(data.files).then(release, fail)
	})

	Module.preRun = Module.preRun || []
	Module.preRun.push(() => {
		if(held || finished) return
		addRunDependency(DEPENDENCY)
		held = true
		try {
			window.parent.postMessage({ type: REQUEST_TYPE, token }, location.origin)
		} catch(error) {
			finished = true
			fail(error)
			return
		}
		timer = setTimeout(() => {
			if(finished) return
			finished = true
			fail(new Error('timed out waiting for startup metadata File handles'))
		}, TIMEOUT_MS)
	})
})();

// Diagnostic-only addition for PROXY_TO_PTHREAD / worker-side failures.
// Keep this WorkerGlobalScope-safe: hl2_launcher.js is imported by pthreads and
// there is deliberately no `window` object in those workers.
if (typeof globalThis !== 'undefined' && globalThis.addEventListener) {
	globalThis.addEventListener('error', event => {
		const error = event && event.error
		const message = event && (event.message || event.type) || 'worker/global error'
		if (typeof globalThis.render360SetPhase === 'function') {
			globalThis.render360SetPhase(`worker-error:${String(message).slice(0, 160)}`)
		}
		console.error(
			'[Render360 worker/global error]',
			message,
			error && error.stack ? error.stack : error || ''
		)
	})

	globalThis.addEventListener('unhandledrejection', event => {
		const reason = event && event.reason
		const message = reason && reason.message ? reason.message : String(reason)
		if (typeof globalThis.render360SetPhase === 'function') {
			globalThis.render360SetPhase(`worker-unhandled-rejection:${message.slice(0, 160)}`)
		}
		console.error(
			'[Render360 worker/global unhandled rejection]',
			reason && reason.stack ? reason.stack : reason
		)
	})
}
