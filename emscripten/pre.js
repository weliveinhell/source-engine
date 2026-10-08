// NOTE: this file is also loaded by every pthread worker, where there is no
// `window` and no DOM. Guard anything browser-side with isMainThread.
var isMainThread = (typeof window !== 'undefined' && typeof document !== 'undefined');

Module['arguments'] = Module['arguments'] || []
Module['arguments'].push(
	'-game', 'portal',
	'-noip',
	'-language', 'english',
	'-windowed',
	'+mat_hdr_level', '0',
	'+mat_colorcorrection', '1'
)

if (isMainThread) {
	var host = window.GameHost || {};
	var res = window.gameResolution;

	// Start at the resolution the shell picked for this screen. Without this the
	// engine falls back to a desktop default, and on a phone that means both a
	// wrong aspect ratio and a render target far too large to hit a playable
	// frame rate.
	if (res && res.w && res.h) {
		Module['arguments'].push('-w', String(res.w), '-h', String(res.h))
	}

	if (host.isTouch) {
		// A phone has no keyboard and no pointer lock (iOS has never shipped
		// it), so the engine's on-screen touch controls are the only way to
		// move or look. They default to off everywhere except Android.
		Module['arguments'].push('+touch_enable', '1')
		Module['arguments'].push('+touch_draw', '1')

		// Memory, not shading, is what kills this build on an iPhone: drop
		// texture detail so the working set fits.
		Module['arguments'].push('+mat_picmip', '2')
	}
}

// Where the packed map data lives. It defaults to ./chunks next to the page,
// but the whole game is far too big for some hosts -- GitHub Pages caps a
// published site at 1GB and GitHub refuses any file over 100MB -- so the data
// often has to live somewhere else. Point at it with ?chunks=<url>, or set
// window.CHUNK_BASE_URL before the engine loads.
//
// A cross-origin host must send CORS headers, or the browser blocks the
// request before the data ever arrives.
function chunkBaseUrl() {
	if (!isMainThread) return 'chunks'

	try {
		const fromQuery = new URLSearchParams(window.location.search).get('chunks')
		if (fromQuery) return fromQuery.replace(/\/+$/, '')
	} catch (e) { /* malformed query string; fall through */ }

	if (typeof window.CHUNK_BASE_URL === 'string' && window.CHUNK_BASE_URL) {
		return window.CHUNK_BASE_URL.replace(/\/+$/, '')
	}

	return 'chunks'
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

	async loadMapWithDeps(mapName) {
		const index = this.mapsOrdered.indexOf(mapName)
		if(index === -1) {
			throw new Error(`no such map: ${mapName}`)
		}

		// load past maps and current one
		for(let i = 0; i < index + 1; i++) {
			await this.loadMapCached(this.mapsOrdered[i])
		}

		// schedule next map if it exists
		const next = this.mapsOrdered[index + 1]
		if(next) {
			// Prefetching must never take the current load down with it, and an
			// unhandled rejection here would surface as a fatal error dialog.
			this.loadMapCached(next).catch(err => {
				console.warn(`prefetch of ${next} failed:`, err)
			})
		}
	}

	async loadMapCached(mapName) {
		if(mapName in this.loadedMaps) return this.loadedMaps[mapName]
		const promise = this.loadMap(mapName)
		// A failed download must not be cached as permanently failed, otherwise
		// every later attempt at this map replays the same error.
		promise.catch(() => { delete this.loadedMaps[mapName] })
		this.loadedMaps[mapName] = promise
		return promise
	}

	setProgress(mapName, progress) {
		if(!isMainThread || typeof spinnerElement === 'undefined') return

		if(progress < 1) {
			spinnerElement.style.display = ''
			statusElement.textContent = `Downloading map ${mapName}`
			progressElement.hidden = false
			progressElement.max = 1
			progressElement.value = progress
		} else {
			spinnerElement.style.display = 'none'
			statusElement.textContent = ''
			progressElement.hidden = true
		}
	}

	async loadMap(mapName) {
		this.setProgress(mapName, 0)

		let resolve, reject
		const promise = new Promise((res, rej) => { resolve = res; reject = rej })

		const xhr = new XMLHttpRequest()
		xhr.responseType = 'arraybuffer'
		xhr.onprogress = e => {
			if(e.lengthComputable) this.setProgress(mapName, e.loaded / e.total)
		}

		xhr.onerror = () => {
			this.setProgress(mapName, 1)
			reject(new Error(`cannot load map ${mapName}: network error`))
		}

		xhr.ontimeout = () => {
			this.setProgress(mapName, 1)
			reject(new Error(`cannot load map ${mapName}: timed out`))
		}

		xhr.onload = e => {
			this.setProgress(mapName, 1)

			// A 404 still fires onload. Parsing an error page as chunk data
			// walks off the end of the buffer and takes the engine with it.
			if(xhr.status !== 200 && xhr.status !== 0) {
				reject(new Error(`cannot load map ${mapName}: HTTP ${xhr.status} ` +
					`from ${chunkBaseUrl()}/${mapName}.data`))
				return
			}

			if(!xhr.response || xhr.response.byteLength === 0) {
				reject(new Error(`cannot load map ${mapName}: empty response`))
				return
			}

			try {
				const dv = new DataView(xhr.response)

				let offset = 0

				// data format: { pathLen: uint32le, dataLen: uint32le, path: bytes, blob: bytes }[]
				while(offset < dv.byteLength) {
					if(offset + 8 > dv.byteLength) {
						throw new Error('truncated chunk header')
					}

					const pathLen = dv.getInt32(offset, true)
					const dataLen = dv.getInt32(offset + 4, true)

					if(pathLen < 0 || dataLen < 0 || offset + 8 + pathLen + dataLen > dv.byteLength) {
						throw new Error('corrupt chunk entry')
					}

					const path = new TextDecoder().decode(new DataView(
						dv.buffer,
						offset + 8,
						pathLen
					))
					const blob = new Uint8Array(
						dv.buffer,
						offset + 8 + pathLen,
						dataLen
					)
					offset += 8 + pathLen + dataLen

					const dir = path.replace(/\/[^\/]+$/, '')
					FS.mkdirTree(dir)
					FS.writeFile(path, blob)
				}

				resolve()
			} catch(err) {
				reject(new Error(`cannot unpack map ${mapName}: ${err.message}`))
			}
		}

		try {
			xhr.open('GET', `${chunkBaseUrl()}/${mapName}.data`, true)
			xhr.send()
		} catch(err) {
			reject(err)
		}

		return promise
	}
}

const dataLoader = new DataLoader()

Module.downloadMap = (lock, mapName) => {
	// The engine thread is parked in memory.atomic.wait32 with no timeout. If we
	// ever fail to store-and-notify, the game hangs forever with a black screen,
	// so release the lock on failure too and let the engine report the missing
	// map itself.
	const release = () => {
		Atomics.store(HEAP32, lock, 0)
		Atomics.notify(HEAP32, lock)
	}

	dataLoader.loadMapWithDeps(mapName).then(release, err => {
		console.error(err)
		if(isMainThread && typeof window.showFatal === 'function') {
			window.showFatal('Could not load map data', String(err && err.message || err))
		}
		release()
	})
}
