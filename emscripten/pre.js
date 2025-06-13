Module['arguments'] = Module['arguments'] || []
Module['arguments'].push(
	'-game', 'portal',
	'-noip',
	'-language', 'english',
	'-windowed',
	'+mat_hdr_level', '0',
	'+mat_colorcorrection', '1'
)

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
			this.loadMapCached(next)
		}
	}

	async loadMapCached(mapName) {
		if(mapName in this.loadedMaps) return this.loadedMaps[mapName]
		const promise = this.loadMap(mapName)
		this.loadedMaps[mapName] = promise
		return promise
	}

	async setProgress(mapName, progress) {
		if(progress < 1) {
			spinnerElement.style.display = ''
			statusElement.innerText = `Downloading map ${mapName}`
			progressElement.hidden = false
			progressElement.value = progress
		} else {
			spinnerElement.style.display = 'none'
			statusElement.innerText = ''
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
			this.setProgress(mapName, e.loaded / e.total)
		}

		xhr.onerror = () => {
			reject(new Error(`cannot load map ${mapName}`))
		}

		xhr.onload = e => {
			this.setProgress(mapName, 1)
			const dv = new DataView(xhr.response)

			let offset = 0
			
			// data format: { pathLen: uint32le, dataLen: uint32le, path: bytes, blob: bytes }[]
			while(offset < dv.byteLength) {
				const pathLen = dv.getInt32(offset, true)
				const dataLen = dv.getInt32(offset + 4, true)
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
		}
		xhr.open('GET', `chunks/${mapName}.data`, true)
		xhr.send()

		return promise
	}
}

const dataLoader = new DataLoader()

Module.downloadMap = (lock, mapName) => {
	dataLoader.loadMapWithDeps(mapName).then(() => {
		Atomics.store(HEAP32, lock, 0)
		Atomics.notify(HEAP32, lock)
	})
}