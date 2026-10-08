const fs = require('node:fs')

const loadLogFile = name => fs.readFileSync(name)
	.toString()
	.trim()
	.split(/\n/)
	.map(x => x.trim())
	.filter(x => x.startsWith('OpenForRead '))
	.map(x => x.slice('OpenForRead '.length))

const knownMaps = `background01
d1_trainstation_01
d1_trainstation_02
d1_trainstation_03
d1_trainstation_04
d1_trainstation_05
d1_trainstation_06
background02
d1_canals_01
d1_canals_01a
d1_canals_02
d1_canals_03
d1_canals_05
d1_canals_06
d1_canals_07
d1_canals_08
d1_canals_09
d1_canals_10
d1_canals_11
d1_canals_12
d1_canals_13
d1_eli_01
d1_eli_02
background03
d1_town_01
d1_town_01a
d1_town_02
d1_town_02a
d1_town_03
d1_town_04
d1_town_05
background04
d2_coast_01
d2_coast_03
d2_coast_04
d2_coast_05
d2_coast_07
d2_coast_08
d2_coast_09
d2_coast_10
d2_coast_11
d2_coast_12
d2_prison_01
d2_prison_02
d2_prison_03
d2_prison_04
d2_prison_05
d2_prison_06
d2_prison_07
d2_prison_08
background05
d3_c17_01
d3_c17_02
d3_c17_03
d3_c17_04
d3_c17_05
d3_c17_06a
d3_c17_06b
d3_c17_07
d3_c17_08
d3_c17_09
d3_c17_10a
d3_c17_10b
d3_c17_11
d3_c17_12
background06
d3_citadel_01
d3_citadel_02
d3_citadel_03
d3_citadel_04
d3_citadel_05
d3_breen_01`.trim().split(/\n/)

const lines = [].concat(...knownMaps.map(map => loadLogFile(`./map-${map}.txt`)))

const baseGamePath = '' // game data with hl2 and platform folders
// all vpks should be unpacked with `vpkeditcli -e / -o . ./vpk_dir.vpk`

const baseFontPath = './fonts/'

function getSearchPaths(path) {
	if(path.endsWith('.bsp')) return null

	switch(path) {
		case 'GAME':
			return [
				[ baseGamePath + 'hl2/hl2_textures', 'hl2'],
				[ baseGamePath + 'hl2/hl2_misc', 'hl2'],
				[ baseGamePath + 'hl2/hl2_pak', 'hl2'],
				[ baseGamePath + 'hl2', 'hl2']
			]
		case 'PLATFORM':
			return [
				[ baseGamePath + 'platform/platform_misc', 'platform' ],
				[ baseGamePath + 'platform', 'platform' ],
			]
		case '__FONT':
			return [
				[ baseFontPath, 'platform/resource/linux_fonts' ]
			]
		default:
			return [
				[ baseGamePath + 'hl2/hl2_textures', 'hl2' ],
				[ baseGamePath + 'hl2', 'hl2' ]
			]
	}
}

let processedPaths = Object.create(null)
let maps = Object.create(null)

const prepend = [
	'GAME resource/gameui_english.txt',
	'/hl2/ resource/hl2_english.txt',
	'PLATFORM resource/vgui_english.txt',
	'PLATFORM resource/platform_english.txt',
	'__FONT dejavusans.ttf',
	'__FONT dejavusansmono.ttf',
	'__FONT dejavusans-bold.ttf'
]

prepend.push(...[
	...fs.globSync(baseGamePath + '/platform/resource/*.res'),
	...fs.globSync(baseGamePath + '/platform/resource/*.tga'),
	...fs.globSync(baseGamePath + '/platform/resource/*.txt'),
].map(x => 
	`PLATFORM ${x.replace(/^.+\/resource/g, 'resource')}`
))

prepend.push(...[
	...fs.globSync(baseGamePath + '/hl2/resource/ui/**/*.*'),
	...fs.globSync(baseGamePath + '/hl2/resource/*.res'),
	...fs.globSync(baseGamePath + '/hl2/resource/*.txt'),
].map(x => 
	`GAME ${x.replace(/^.+\/resource/g, 'resource')}`
))

prepend.push(...[
	...fs.globSync(baseGamePath + '/hl2/cfg/*'),
	...fs.globSync(baseGamePath + '/hl2/hl2_misc/cfg/*'),
].map(x => 
	`GAME ${x.replace(/^.+\/cfg/g, 'cfg')}`
))

prepend.push(...[
	...fs.globSync(baseGamePath + '/hl2/hl2_textures/materials/vgui/**/*.*'),
	...fs.globSync(baseGamePath + '/hl2/hl2_misc/materials/vgui/**/*.*'),
	...fs.globSync(baseGamePath + '/hl2/hl2_pak/materials/vgui/**/*.*'),
	...fs.globSync(baseGamePath + '/hl2/hl2_textures/materials/console/*')
].map(x =>
	`GAME ${x.replace(/^.+\/hl2\/.+?\//g, '')}`
))

// Touch button icons. These are not in the desktop VPKs -- they come from the
// Android build of source-engine -- so they sit loose in the mod folder and the
// globs above miss them. Without them the on-screen controls still work, but
// every button draws with the missing-material texture. The globs are no-ops
// when the files are absent.
prepend.push(...[
	...fs.globSync(baseGamePath + '/hl2/materials/vgui/touch/*.vtf'),
	...fs.globSync(baseGamePath + '/portal/materials/vgui/touch/*.vtf'),
].map(x =>
	`GAME ${x.replace(/^.+?\/materials\//, 'materials/')}`
))

let currentMap = 'background01'
let initMapLoaded = false

for(let line of [...prepend, ...lines]) {
	let [ pathId, filePath ] = line.split(/ /)

	filePath = filePath.toLowerCase().replace(/\\/g, '/')

	if(filePath.endsWith('.bsp')) {
		const mapName = filePath.replace(/^.+\/([^/]+)\.bsp$/, '$1')
		if(/[./]/.test(mapName)) {
			throw new Error('bad map regex')
		}

		initMapLoaded = true
		currentMap = mapName
	}

	maps[currentMap] ??= []

	const uniqueId = pathId+':'+filePath

	if(uniqueId in processedPaths) {
		continue
	}
	processedPaths[uniqueId] = 1

	let ok = 0
	let fileDst = ''
	let size = 0

	const searchPaths = getSearchPaths(pathId)
	if(searchPaths === null) continue
	
	for(const [ searchPath, dstPrefix ] of searchPaths) try {
		const src = `/${searchPath}/${filePath}`
		fileDst = `/${dstPrefix}/${filePath}`

		const blob = fs.readFileSync(src)
		const prefix = Buffer.alloc(8)
		const pathBuf = Buffer.from(fileDst)
		prefix.writeUint32LE(pathBuf.length)
		prefix.writeUint32LE(blob.length, 4)
		maps[currentMap].push(prefix, pathBuf, blob)

		size = blob.length
		ok = 1
		break
	} catch {}
	
	console.log(ok, pathId, filePath, ok ? fileDst : '', size)
}

// add stub map files to base chunk
for(const mapName of Object.keys(maps)) {
	if(mapName === 'background01') continue
	const prefix = Buffer.alloc(8)
	const pathBuf = Buffer.from(`/hl2/maps/${mapName}.bsp`)
	prefix.writeUint32LE(pathBuf.length)
	// blobLength = 0

	maps.background01.push(prefix, pathBuf)
}


try { fs.mkdirSync('./chunks') } catch {}
for(const [ mapName, chunks ] of Object.entries(maps)) {
	console.log('saving', mapName + '...')
	const dst = './chunks/' + mapName + '.data'
	fs.writeFileSync(dst, Buffer.concat(chunks))
}