(() => {
  'use strict';

  const CACHE_NAME = 'render360-portal-local-chunks-v2';
  const MAPS = [
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
  ];

  const MAX_TEXT_SCAN_BYTES = 24 * 1024 * 1024;
  const MAX_VMT_BYTES = 2 * 1024 * 1024;
  const MAX_MODEL_MATERIALS = 600;
  const NATIVE_BINARY_RE = /\.(?:dll|dylib|exe|so)$/i;

  function normalizePath(value) {
    return String(value || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+/g, '/')
      .toLowerCase();
  }

  function dirname(path) {
    const p = normalizePath(path);
    const i = p.lastIndexOf('/');
    return i === -1 ? '' : p.slice(0, i);
  }

  function basename(path) {
    const p = normalizePath(path);
    const i = p.lastIndexOf('/');
    return i === -1 ? p : p.slice(i + 1);
  }

  function extname(path) {
    const b = basename(path);
    const i = b.lastIndexOf('.');
    return i === -1 ? '' : b.slice(i);
  }

  function stripExt(path) {
    const ext = extname(path);
    return ext ? path.slice(0, -ext.length) : path;
  }

  function bytesToMiB(bytes) {
    return (bytes / 1048576).toFixed(1);
  }

  function inferRelativePath(file) {
    const raw = normalizePath(file.webkitRelativePath || file.name);
    if (!file.webkitRelativePath) return raw;
    const parts = raw.split('/');
    return parts.length > 1 ? parts.slice(1).join('/') : raw;
  }

  function readCString(bytes, state) {
    const start = state.offset;
    while (state.offset < bytes.length && bytes[state.offset] !== 0) state.offset++;
    if (state.offset >= bytes.length) throw new Error('unterminated VPK directory string');
    const out = new TextDecoder('utf-8').decode(bytes.subarray(start, state.offset));
    state.offset++;
    return out;
  }

  class PortalGameSource {
    constructor(files, log) {
      this.log = typeof log === 'function' ? log : () => {};
      this.files = Array.from(files || []);
      this.filesByRel = new Map();
      this.entries = new Map();
      this.vpkDirs = [];
    }

    async init() {
      for (const file of this.files) {
        const rel = inferRelativePath(file);
        if (!rel) continue;
        this.filesByRel.set(rel, file);
        if (/^(portal|hl2|platform)\//.test(rel)) {
          this.entries.set('/' + rel, {
            kind: 'loose', path: '/' + rel, rel, file, size: file.size
          });
        }
      }

      const dirs = [...this.filesByRel.entries()].filter(([rel]) => /_dir\.vpk$/i.test(rel));
      if (!dirs.length) throw new Error('No *_dir.vpk files were found in the selected Portal folder.');

      this.log(`Local fallback: parsing ${dirs.length} VPK directory file(s)…`);
      for (const [rel, file] of dirs) {
        try {
          const parsed = await this.parseVPKDirectory(rel, file);
          this.vpkDirs.push(parsed);
          this.log(`VPK index ${rel}: ${parsed.entryCount} entries`);
        } catch (error) {
          this.log(`VPK index skipped ${rel}: ${error.message || error}`);
        }
      }

      if (!this.vpkDirs.length) throw new Error('Portal VPK indexes were found, but none could be parsed.');
      this.log(`Local fallback indexed ${this.entries.size} virtual game files.`);
      return this;
    }

    async parseVPKDirectory(rel, file) {
      const headerBytes = new Uint8Array(await file.slice(0, 28).arrayBuffer());
      if (headerBytes.length < 12) throw new Error('VPK header is too small');
      const headerView = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
      const signature = headerView.getUint32(0, true);
      if (signature !== 0x55aa1234) throw new Error(`unsupported VPK signature 0x${signature.toString(16)}`);
      const version = headerView.getUint32(4, true);
      const treeSize = headerView.getUint32(8, true);
      const headerSize = version === 1 ? 12 : version === 2 ? 28 : 0;
      if (!headerSize) throw new Error(`unsupported VPK version ${version}`);
      if (treeSize <= 0 || headerSize + treeSize > file.size) throw new Error(`invalid VPK tree size ${treeSize}`);

      const treeBytes = new Uint8Array(await file.slice(headerSize, headerSize + treeSize).arrayBuffer());
      const treeView = new DataView(treeBytes.buffer, treeBytes.byteOffset, treeBytes.byteLength);
      const state = { offset: 0 };
      const parent = dirname(rel);
      const archiveBase = rel.slice(0, -'_dir.vpk'.length);
      let entryCount = 0;

      while (state.offset < treeBytes.length) {
        const extension = readCString(treeBytes, state);
        if (!extension) break;
        while (state.offset < treeBytes.length) {
          const directoryRaw = readCString(treeBytes, state);
          if (!directoryRaw) break;
          const directory = directoryRaw === ' ' ? '' : normalizePath(directoryRaw);

          while (state.offset < treeBytes.length) {
            const fileNameRaw = readCString(treeBytes, state);
            if (!fileNameRaw) break;
            const fileName = normalizePath(fileNameRaw);
            if (state.offset + 18 > treeBytes.length) throw new Error('truncated VPK entry metadata');

            const crc = treeView.getUint32(state.offset, true); state.offset += 4;
            const preloadBytes = treeView.getUint16(state.offset, true); state.offset += 2;
            const archiveIndex = treeView.getUint16(state.offset, true); state.offset += 2;
            const entryOffset = treeView.getUint32(state.offset, true); state.offset += 4;
            const entryLength = treeView.getUint32(state.offset, true); state.offset += 4;
            const terminator = treeView.getUint16(state.offset, true); state.offset += 2;
            if (terminator !== 0xffff) throw new Error(`bad VPK entry terminator 0x${terminator.toString(16)}`);
            if (state.offset + preloadBytes > treeBytes.length) throw new Error('truncated VPK preload bytes');
            const preload = treeBytes.slice(state.offset, state.offset + preloadBytes);
            state.offset += preloadBytes;

            const ext = extension === ' ' ? '' : normalizePath(extension);
            const internal = [directory, fileName + (ext ? '.' + ext : '')].filter(Boolean).join('/');
            const vfsPath = '/' + [parent, internal].filter(Boolean).join('/');
            const descriptor = {
              kind: 'vpk', path: vfsPath, dirRel: rel, dirFile: file, archiveBase,
              headerSize, treeSize, crc, preload, archiveIndex, entryOffset, entryLength,
              size: preload.length + entryLength
            };
            if (!this.entries.has(vfsPath)) this.entries.set(vfsPath, descriptor);
            entryCount++;
          }
        }
      }

      return { rel, file, version, headerSize, treeSize, entryCount };
    }

    has(path) { return this.entries.has('/' + normalizePath(path)); }
    get(path) { return this.entries.get('/' + normalizePath(path)) || null; }

    findBySuffix(suffix) {
      const needle = '/' + normalizePath(suffix);
      for (const key of this.entries.keys()) if (key.endsWith(needle)) return key;
      return null;
    }

    resolveGamePath(ref, preferredRoot = 'portal') {
      const clean = normalizePath(ref).replace(/^\.\//, '');
      if (!clean) return null;
      if (clean.startsWith('portal/') || clean.startsWith('hl2/') || clean.startsWith('platform/')) {
        const exact = '/' + clean;
        return this.entries.has(exact) ? exact : null;
      }
      const roots = preferredRoot === 'hl2' ? ['hl2', 'portal', 'platform'] : ['portal', 'hl2', 'platform'];
      for (const root of roots) {
        const candidate = '/' + root + '/' + clean;
        if (this.entries.has(candidate)) return candidate;
      }
      return null;
    }

    resolveMaterial(name, preferredRoot = 'portal') {
      let clean = normalizePath(name).replace(/^materials\//, '').replace(/^\/+/, '');
      if (!clean) return null;
      if (!/\.(vmt|vtf)$/.test(clean)) clean += '.vmt';
      return this.resolveGamePath('materials/' + clean, preferredRoot);
    }

    resolveSound(name, preferredRoot = 'portal') {
      const clean = normalizePath(name).replace(/^sound\//, '').replace(/^\/+/, '');
      if (!clean) return null;
      return this.resolveGamePath('sound/' + clean, preferredRoot);
    }

    resolveModel(name, preferredRoot = 'portal') {
      let clean = normalizePath(name).replace(/^models\//, '').replace(/^\/+/, '');
      if (!clean) return null;
      if (!clean.endsWith('.mdl')) clean += '.mdl';
      return this.resolveGamePath('models/' + clean, preferredRoot);
    }

    async read(path) {
      const descriptor = this.get(path);
      if (!descriptor) throw new Error(`game asset not found: ${path}`);
      if (descriptor.kind === 'loose') return descriptor.file;
      const pieces = [];
      if (descriptor.preload && descriptor.preload.length) pieces.push(descriptor.preload);
      if (descriptor.entryLength) {
        let archiveFile;
        let start;
        if (descriptor.archiveIndex === 0x7fff) {
          archiveFile = descriptor.dirFile;
          start = descriptor.headerSize + descriptor.treeSize + descriptor.entryOffset;
        } else {
          const rel = `${descriptor.archiveBase}_${String(descriptor.archiveIndex).padStart(3, '0')}.vpk`;
          archiveFile = this.filesByRel.get(rel);
          if (!archiveFile) throw new Error(`missing VPK segment ${rel} required by ${path}`);
          start = descriptor.entryOffset;
        }
        const end = start + descriptor.entryLength;
        if (end > archiveFile.size) throw new Error(`VPK entry ${path} exceeds ${archiveFile.name}`);
        pieces.push(archiveFile.slice(start, end));
      }
      return new Blob(pieces, { type: 'application/octet-stream' });
    }

    entriesMatching(predicate) {
      const out = [];
      for (const [path, descriptor] of this.entries) if (predicate(path, descriptor)) out.push(path);
      return out;
    }
  }

  function parseBSPLumps(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 1036) return null;
    const dv = new DataView(buffer);
    if (dv.getUint32(0, true) !== 0x50534256) return null;
    const lumps = [];
    for (let i = 0; i < 64; i++) {
      const o = 8 + i * 16;
      const fileofs = dv.getInt32(o, true);
      const filelen = dv.getInt32(o + 4, true);
      if (fileofs < 0 || filelen < 0 || fileofs + filelen > buffer.byteLength) lumps.push({ fileofs: 0, filelen: 0 });
      else lumps.push({ fileofs, filelen });
    }
    return { dv, lumps };
  }

  function extractCString(bytes, start) {
    let end = start;
    while (end < bytes.length && bytes[end] !== 0) end++;
    return new TextDecoder('utf-8').decode(bytes.subarray(start, end));
  }

  function discoverBSPReferences(buffer) {
    const refs = new Set();
    const parsed = parseBSPLumps(buffer);
    if (!parsed) return refs;
    const bytes = new Uint8Array(buffer);
    const stringData = parsed.lumps[43];
    const stringTable = parsed.lumps[44];
    if (stringData.filelen && stringTable.filelen) {
      const tableCount = Math.floor(stringTable.filelen / 4);
      for (let i = 0; i < tableCount; i++) {
        const rel = parsed.dv.getUint32(stringTable.fileofs + i * 4, true);
        if (rel >= stringData.filelen) continue;
        const value = normalizePath(extractCString(bytes, stringData.fileofs + rel));
        if (value) refs.add('material:' + value);
      }
    }
    const scanBytes = bytes.subarray(0, Math.min(bytes.length, MAX_TEXT_SCAN_BYTES));
    const text = new TextDecoder('latin1').decode(scanBytes);
    const assetRe = /[a-zA-Z0-9_./\\-]{2,}\.(?:mdl|vmt|vtf|vvd|vtx|phy|wav|mp3|pcf|res|txt|cfg)/g;
    let match;
    while ((match = assetRe.exec(text))) {
      const value = normalizePath(match[0]);
      if (value) refs.add('path:' + value);
    }
    return refs;
  }

  function discoverTextReferences(text) {
    const refs = new Set();
    if (!text) return refs;
    const quoted = /"([^"\r\n]{1,260})"/g;
    let match;
    while ((match = quoted.exec(text))) {
      const value = normalizePath(match[1]).trim();
      if (!value || value.startsWith('$') || value.startsWith('%')) continue;
      if (/\.(vmt|vtf|mdl|wav|mp3|pcf|res|txt|cfg)$/.test(value)) refs.add('path:' + value);
      else if (value.includes('/') && /^[a-z0-9_./-]+$/.test(value)) refs.add('material-token:' + value);
    }
    return refs;
  }

  function commonAssetPaths(source) {
    return source.entriesMatching((path, descriptor) => {
      if (NATIVE_BINARY_RE.test(path)) return false;
      if (/\/(portal|hl2)\/gameinfo\.txt$/.test(path)) return true;
      if (/^\/(portal|hl2|platform)\/(resource|cfg|scripts|media)\//.test(path)) return descriptor.size <= 16 * 1024 * 1024;
      if (/^\/(portal|hl2|platform)\/materials\/(vgui|console|hud)\//.test(path)) return descriptor.size <= 16 * 1024 * 1024;
      if (/^\/platform\/resource\//.test(path)) return descriptor.size <= 16 * 1024 * 1024;
      if (/^\/(portal|hl2)\/(steam|game)\.inf$/.test(path)) return true;
      return false;
    });
  }

  async function expandReferences(source, initialPaths, log) {
    const wanted = new Set();
    const queue = [...initialPaths];
    const processedText = new Set();
    const processedModels = new Set();
    const enqueue = path => { if (path && !wanted.has(path) && !NATIVE_BINARY_RE.test(path)) queue.push(path); };

    const resolveLooseReference = (value, preferredRoot) => {
      const clean = normalizePath(value).replace(/^\/+/, '');
      if (!clean || NATIVE_BINARY_RE.test(clean)) return null;
      if (clean.startsWith('materials/') || clean.startsWith('models/') || clean.startsWith('sound/') || clean.startsWith('portal/') || clean.startsWith('hl2/') || clean.startsWith('platform/')) return source.resolveGamePath(clean, preferredRoot);
      if (/\.(wav|mp3)$/.test(clean)) return source.resolveSound(clean, preferredRoot);
      if (/\.mdl$/.test(clean)) return source.resolveModel(clean, preferredRoot);
      if (/\.(vmt|vtf)$/.test(clean)) return source.resolveGamePath(clean, preferredRoot) || source.resolveMaterial(clean, preferredRoot);
      return source.resolveGamePath(clean, preferredRoot);
    };

    while (queue.length) {
      const path = queue.shift();
      if (!path || wanted.has(path) || NATIVE_BINARY_RE.test(path) || !source.get(path)) continue;
      wanted.add(path);
      const ext = extname(path);
      const root = path.startsWith('/hl2/') ? 'hl2' : 'portal';

      if (ext === '.vmt' && !processedText.has(path)) {
        processedText.add(path);
        try {
          const blob = await source.read(path);
          if (blob.size <= MAX_VMT_BYTES) {
            const text = await blob.text();
            for (const ref of discoverTextReferences(text)) {
              const sep = ref.indexOf(':');
              const kind = ref.slice(0, sep);
              const raw = ref.slice(sep + 1);
              if (kind === 'path') enqueue(resolveLooseReference(raw, root));
              else if (kind === 'material-token') {
                enqueue(source.resolveMaterial(raw + '.vtf', root));
                enqueue(source.resolveMaterial(raw + '.vmt', root));
              }
            }
          }
        } catch (error) {
          log(`VMT dependency scan skipped ${path}: ${error.message || error}`);
        }
      }

      if (ext === '.mdl' && !processedModels.has(path)) {
        processedModels.add(path);
        const stem = stripExt(path);
        for (const suffix of ['.vvd', '.dx90.vtx', '.sw.vtx', '.phy']) enqueue(source.get(stem + suffix) ? stem + suffix : null);
        const marker = '/models/';
        const at = path.indexOf(marker);
        if (at !== -1) {
          const modelDir = dirname(path.slice(at + marker.length));
          if (modelDir) {
            const prefix = `/${root}/materials/models/${modelDir}/`;
            let count = 0;
            for (const candidate of source.entries.keys()) {
              if (candidate.startsWith(prefix)) {
                enqueue(candidate);
                if (++count >= MAX_MODEL_MATERIALS) break;
              }
            }
          }
        }
      }
    }
    return wanted;
  }

  async function buildMapPaths(source, mapName, includeCommon, log) {
    const seed = new Set(includeCommon ? commonAssetPaths(source) : []);
    let mapPath = source.resolveGamePath(`maps/${mapName}.bsp`, 'portal');
    if (!mapPath) mapPath = source.findBySuffix(`maps/${mapName}.bsp`);
    if (!mapPath) {
      log(`Local fallback: ${mapName}.bsp was not found in the selected install.`);
      return { paths: seed, mapFound: false };
    }
    seed.add(mapPath);
    const graphPath = source.resolveGamePath(`maps/graphs/${mapName}.ain`, 'portal');
    if (graphPath) seed.add(graphPath);

    try {
      const mapBlob = await source.read(mapPath);
      const buffer = await mapBlob.arrayBuffer();
      const refs = discoverBSPReferences(buffer);
      for (const tagged of refs) {
        const sep = tagged.indexOf(':');
        const kind = tagged.slice(0, sep);
        const raw = tagged.slice(sep + 1);
        if (kind === 'material') {
          const p = source.resolveMaterial(raw, mapPath.startsWith('/hl2/') ? 'hl2' : 'portal');
          if (p) seed.add(p);
          continue;
        }
        const clean = normalizePath(raw).replace(/^\/+/, '');
        if (NATIVE_BINARY_RE.test(clean)) continue;
        let resolved = null;
        if (clean.startsWith('models/') || clean.startsWith('materials/') || clean.startsWith('sound/')) resolved = source.resolveGamePath(clean, 'portal');
        else if (/\.mdl$/.test(clean)) resolved = source.resolveModel(clean, 'portal');
        else if (/\.(wav|mp3)$/.test(clean)) resolved = source.resolveSound(clean, 'portal');
        else if (/\.(vmt|vtf)$/.test(clean)) resolved = source.resolveMaterial(clean, 'portal');
        else resolved = source.resolveGamePath(clean, 'portal');
        if (resolved) seed.add(resolved);
      }
    } catch (error) {
      log(`Local fallback: could not inspect ${mapName}.bsp dependencies: ${error.message || error}`);
    }

    const paths = await expandReferences(source, seed, log);
    return { paths, mapFound: true };
  }

  async function packPaths(source, paths, log) {
    const encoder = new TextEncoder();
    const parts = [];
    let files = 0;
    let bytes = 0;
    for (const path of paths) {
      if (NATIVE_BINARY_RE.test(path)) {
        log(`Local fallback ignored native binary: ${path}`);
        continue;
      }
      try {
        const blob = await source.read(path);
        if (blob.size > 0xffffffff) throw new Error('single file exceeds 4 GiB packed format limit');
        const pathBytes = encoder.encode(path);
        const header = new Uint8Array(8);
        const dv = new DataView(header.buffer);
        dv.setUint32(0, pathBytes.length, true);
        dv.setUint32(4, blob.size, true);
        parts.push(header, pathBytes, blob);
        bytes += 8 + pathBytes.length + blob.size;
        files++;
      } catch (error) {
        log(`Local fallback skipped ${path}: ${error.message || error}`);
      }
    }
    return { blob: new Blob(parts, { type: 'application/octet-stream' }), files, bytes };
  }

  async function clearLocalChunks() { await caches.delete(CACHE_NAME); }

  async function hasLocalChunk(mapName = 'background1') {
    if (!('caches' in globalThis)) return false;
    const cache = await caches.open(CACHE_NAME);
    const url = new URL(`./chunks/${mapName}.data`, location.href).href;
    return !!(await cache.match(url));
  }

  async function buildChunks(files, options = {}) {
    if (!('caches' in globalThis)) throw new Error('Cache Storage is unavailable in this browser.');
    const log = typeof options.log === 'function' ? options.log : () => {};
    const progress = typeof options.progress === 'function' ? options.progress : () => {};
    const source = await new PortalGameSource(files, log).init();
    await clearLocalChunks();
    const cache = await caches.open(CACHE_NAME);
    const seen = new Set();
    const results = [];

    for (let i = 0; i < MAPS.length; i++) {
      const mapName = MAPS[i];
      progress({ phase: 'scan', mapName, index: i, total: MAPS.length, message: `Scanning ${mapName}` });
      const { paths, mapFound } = await buildMapPaths(source, mapName, i === 0, log);
      if (!mapFound && i !== 0) {
        results.push({ mapName, skipped: true, reason: 'map not found' });
        continue;
      }
      const delta = [];
      for (const path of paths) if (!seen.has(path) && !NATIVE_BINARY_RE.test(path)) { seen.add(path); delta.push(path); }
      progress({ phase: 'pack', mapName, index: i, total: MAPS.length, message: `Packing ${mapName}` });
      const packed = await packPaths(source, delta, log);
      const url = new URL(`./chunks/${mapName}.data`, location.href).href;
      await cache.put(url, new Response(packed.blob, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Render360-Chunk-Source': 'local-vpk',
          'X-Render360-Map': mapName
        }
      }));
      results.push({ mapName, files: packed.files, bytes: packed.bytes, pathCount: delta.length });
      log(`Local chunk ${mapName}: ${packed.files} files, ${bytesToMiB(packed.bytes)} MiB`);
      progress({ phase: 'done-map', mapName, index: i + 1, total: MAPS.length, bytes: packed.bytes, files: packed.files });
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (!(await hasLocalChunk('background1'))) throw new Error('Local VPK fallback did not produce background1.data.');
    progress({ phase: 'done', total: MAPS.length, results });
    return { ok: true, results, indexedFiles: source.entries.size };
  }

  globalThis.Render360PortalVPK = { CACHE_NAME, MAPS, buildChunks, clearLocalChunks, hasLocalChunk };
})();
