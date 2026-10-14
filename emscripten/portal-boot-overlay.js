(() => {
  'use strict';

  // Phase 2 memory model:
  // 1. Build a deterministic first-frame overlay under a hard 20 MiB budget.
  // 2. Never copy the complete retail .vcs cache into bootstrap MEMFS.
  // 3. Inspect each Portal BSP's referenced VMTs and build a shader-only delta
  //    pack for that map. The service worker appends that tiny pack to the map
  //    chunk only when Source actually requests the map.
  //
  // The selected Portal files stay local. Cache Storage holds the generated
  // packed records; no retail data is uploaded to GitHub Pages.
  const CACHE_NAME = 'render360-portal-boot-overlay-v3';
  const MAP_SHADER_CACHE_NAME = 'render360-portal-map-shaders-v1';
  const OVERLAY_PATH = './render360-bootstrap-overlay.data';
  const MANIFEST_VERSION = 'portal-first-frame-v1';
  const BOOTSTRAP_SHADER_BUDGET_BYTES = 20 * 1024 * 1024;
  const MAX_SINGLE_SHADER_BYTES = 16 * 1024 * 1024;
  const MAX_VMT_BYTES = 2 * 1024 * 1024;
  const MAX_BSP_TEXT_SCAN_BYTES = 24 * 1024 * 1024;

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

  const BOOT_ASSET_SUFFIXES = [
    'materials/debug/debugempty.vtf',
    'materials/debug/debugluxels.vtf',
    'materials/debug/debugluxelsnoalpha.vtf',
    'materials/dev/identitylightwarp.vtf',
    'materials/engine/defaultcubemap.vtf',
    'materials/engine/framesync1.vtf',
    'materials/engine/framesync2.vtf',
    'materials/engine/glinthighlight.vtf',
    'materials/engine/lightsprite.vtf',
    'materials/engine/noise-blur-256x256.vtf',
    'materials/engine/normalize.vtf',
    'materials/engine/normalizedrandomdirections2d.vtf',
    'materials/effects/flashlight001.vtf',
    'materials/effects/flashlight_border.vtf',
    'materials/console/background01.vmt',
    'materials/console/background01.vtf',
    'materials/console/background01_widescreen.vmt',
    'materials/console/background01_widescreen.vtf',
    'materials/console/loading.vtf',
    'materials/console/startup_loading.vtf'
  ];

  // Ordered first-frame manifest. Required families are always retained if
  // present. Optional families are admitted only while the packed overlay still
  // fits the 20 MiB budget. Any new bootstrap dependency must be explicit here.
  const FIRST_FRAME_SHADER_MANIFEST = [
    { family: 'vertexlit_and_unlit_generic', prefixes: ['vertexlit_and_unlit_generic'], required: true },
    { family: 'lightmappedgeneric', prefixes: ['lightmappedgeneric'], required: true },
    { family: 'unlitgeneric', prefixes: ['unlitgeneric'], required: true },
    { family: 'screenspace_general', prefixes: ['screenspace_general'], required: true },
    { family: 'sky', prefixes: ['sky'], required: false },
    { family: 'sprite', prefixes: ['sprite', 'spritecard'], required: false },
    { family: 'worldvertextransition', prefixes: ['worldvertextransition'], required: false },
    { family: 'worldtwotextureblend', prefixes: ['worldtwotextureblend'], required: false },
    { family: 'depthwrite', prefixes: ['depthwrite'], required: false },
    { family: 'shadow', prefixes: ['shadow', 'shadowmodel'], required: false },
    { family: 'decalmodulate', prefixes: ['decalmodulate'], required: false }
  ];

  const SHADER_RE = /(?:^|\/)shaders\/(?:fxc|vsh|psh)\/[^/]+\.vcs$/i;
  const MAP_RESOURCE_RE = /(?:^|\/)(?:maps\/[^/]+\.bsp|materials\/[^/]+(?:\/[^/]+)*\.vmt)$/i;

  function normalizePath(value) {
    return String(value || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+/g, '/')
      .toLowerCase();
  }

  function dirname(path) {
    const p = normalizePath(path);
    const at = p.lastIndexOf('/');
    return at === -1 ? '' : p.slice(0, at);
  }

  function basename(path) {
    const p = normalizePath(path);
    const at = p.lastIndexOf('/');
    return at === -1 ? p : p.slice(at + 1);
  }

  function inferRelativePath(file) {
    const raw = normalizePath(file.webkitRelativePath || file.name);
    if (!file.webkitRelativePath) return raw;
    const parts = raw.split('/');
    return parts.length > 1 ? parts.slice(1).join('/') : raw;
  }

  function compactShaderName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function compiledShaderFamily(path) {
    const stem = basename(path).replace(/\.vcs$/i, '');
    // Retail cache names normally end in _vs20/_ps20b/_vs30/_ps30 plus
    // optional combo suffixes. Remove the stage portion to obtain the family.
    return stem.replace(/_(?:vs|ps|vsh|psh)[a-z0-9_]*$/i, '');
  }

  function materialShaderCandidateKeys(shaderName) {
    const key = compactShaderName(shaderName).replace(/^sdk/, '');
    const aliases = {
      vertexlitgeneric: ['vertexlitandunlitgeneric', 'vertexlitgeneric'],
      unlitgeneric: ['vertexlitandunlitgeneric', 'unlitgeneric'],
      lightmappedgeneric: ['lightmappedgeneric'],
      screenspacegeneral: ['screenspacegeneral'],
      worldvertextransition: ['worldvertextransition'],
      worldtwotextureblend: ['worldtwotextureblend'],
      decalmodulate: ['decalmodulate'],
      sprite: ['sprite', 'spritecard'],
      spritecard: ['spritecard', 'sprite'],
      sky: ['sky'],
      water: ['water'],
      refract: ['refract'],
      cable: ['cable'],
      teeth: ['teeth'],
      eyes: ['eyes', 'eyerefract'],
      eyerefract: ['eyerefract', 'eyes'],
      modulate: ['modulate'],
      unlittwotexture: ['unlittwotexture'],
      depthwrite: ['depthwrite'],
      shadow: ['shadow', 'shadowmodel']
    };
    return aliases[key] || (key ? [key] : []);
  }

  function readCString(bytes, state) {
    const start = state.offset;
    while (state.offset < bytes.length && bytes[state.offset] !== 0) state.offset++;
    if (state.offset >= bytes.length) throw new Error('unterminated VPK directory string');
    const value = new TextDecoder('utf-8').decode(bytes.subarray(start, state.offset));
    state.offset++;
    return value;
  }

  function fixedSuffixFor(path) {
    const clean = normalizePath(path);
    for (const suffix of BOOT_ASSET_SUFFIXES) {
      const wanted = normalizePath(suffix);
      if (clean === wanted || clean.endsWith('/' + wanted)) return wanted;
    }
    return null;
  }

  function shaderManifestEntry(path) {
    const clean = normalizePath(path);
    if (!SHADER_RE.test(clean)) return null;
    const stem = basename(clean).replace(/\.vcs$/i, '');
    for (const entry of FIRST_FRAME_SHADER_MANIFEST) {
      for (const prefix of entry.prefixes) {
        if (stem === prefix || stem.startsWith(prefix + '_')) return entry;
      }
    }
    return null;
  }

  function addDescriptor(found, descriptor) {
    const key = normalizePath(descriptor.path);
    if (!key || found.has(key)) return false;
    found.set(key, descriptor);
    return true;
  }

  function descriptorCost(descriptor) {
    return Number(descriptor.size || 0) + 8 + String(descriptor.path || '').length * 2;
  }

  function selectWithinBudget(found, log) {
    const boot = [];
    const byFamily = new Map(FIRST_FRAME_SHADER_MANIFEST.map(x => [x.family, []]));
    for (const descriptor of found.values()) {
      if (descriptor.category !== 'shader') {
        boot.push(descriptor);
        continue;
      }
      if (!byFamily.has(descriptor.family)) byFamily.set(descriptor.family, []);
      byFamily.get(descriptor.family).push(descriptor);
    }

    let bytes = boot.reduce((sum, descriptor) => sum + descriptorCost(descriptor), 0);
    const selected = [...boot];
    const includedFamilies = [];
    const omittedFamilies = [];

    const includeFamily = entry => {
      const files = byFamily.get(entry.family) || [];
      if (!files.length) {
        log(`Boot shader manifest: family not present in selected install: ${entry.family}`);
        return;
      }
      const familyBytes = files.reduce((sum, descriptor) => sum + descriptorCost(descriptor), 0);
      if (!entry.required && bytes + familyBytes > BOOTSTRAP_SHADER_BUDGET_BYTES) {
        omittedFamilies.push({ family: entry.family, files: files.length, bytes: familyBytes, reason: 'budget' });
        log(`Boot shader manifest: deferred optional ${entry.family} (${files.length} files/${familyBytes} bytes) to stay under 20 MiB.`);
        return;
      }
      selected.push(...files);
      bytes += familyBytes;
      includedFamilies.push({ family: entry.family, files: files.length, bytes: familyBytes, required: entry.required });
    };

    for (const entry of FIRST_FRAME_SHADER_MANIFEST.filter(x => x.required)) includeFamily(entry);
    if (bytes > BOOTSTRAP_SHADER_BUDGET_BYTES) {
      const required = includedFamilies.map(x => `${x.family}=${x.bytes}`).join(', ');
      throw new Error(`Required first-frame shader manifest exceeds 20 MiB bootstrap budget (${bytes} bytes). Families: ${required}`);
    }
    for (const entry of FIRST_FRAME_SHADER_MANIFEST.filter(x => !x.required)) includeFamily(entry);

    return { selected, estimatedBytes: bytes, includedFamilies, omittedFamilies };
  }

  async function indexTargets(files, log) {
    const allFiles = Array.from(files || []);
    const filesByRel = new Map();
    const found = new Map();
    const gameEntries = new Map();
    const fixedFound = new Set();
    let discoveredShaderFiles = 0;
    let selectedShaderFiles = 0;
    let omittedShaderFiles = 0;
    let looseShaders = 0;
    let vpkShaders = 0;
    let skippedHugeShaders = 0;

    for (const file of allFiles) {
      const rel = inferRelativePath(file);
      if (!rel) continue;
      filesByRel.set(rel, file);

      if (/^(?:portal|hl2|platform)\//.test(rel)) {
        const looseDescriptor = {
          kind: 'loose', path: '/' + rel, file, size: file.size
        };
        if (MAP_RESOURCE_RE.test(rel) || SHADER_RE.test(rel)) addDescriptor(gameEntries, looseDescriptor);

        const fixed = fixedSuffixFor(rel);
        if (fixed) {
          fixedFound.add(fixed);
          addDescriptor(found, { ...looseDescriptor, category: 'boot' });
        }

        if (SHADER_RE.test(rel)) {
          discoveredShaderFiles++;
          const manifest = shaderManifestEntry(rel);
          if (!manifest) {
            omittedShaderFiles++;
          } else if (file.size <= MAX_SINGLE_SHADER_BYTES) {
            if (addDescriptor(found, {
              ...looseDescriptor, category: 'shader', family: manifest.family
            })) {
              looseShaders++;
              selectedShaderFiles++;
            }
          } else {
            skippedHugeShaders++;
            log(`Boot overlay skipped unusually large loose shader (${file.size} bytes): ${rel}`);
          }
        }
      }
    }

    const dirs = [...filesByRel.entries()].filter(([rel]) => /_dir\.vpk$/i.test(rel));
    if (!dirs.length) throw new Error('No *_dir.vpk files found for boot overlay.');

    for (const [rel, file] of dirs) {
      const headerBytes = new Uint8Array(await file.slice(0, 28).arrayBuffer());
      if (headerBytes.length < 12) continue;
      const headerView = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
      if (headerView.getUint32(0, true) !== 0x55aa1234) continue;
      const version = headerView.getUint32(4, true);
      const treeSize = headerView.getUint32(8, true);
      const headerSize = version === 1 ? 12 : version === 2 ? 28 : 0;
      if (!headerSize || treeSize <= 0 || headerSize + treeSize > file.size) continue;

      const treeBytes = new Uint8Array(await file.slice(headerSize, headerSize + treeSize).arrayBuffer());
      const treeView = new DataView(treeBytes.buffer, treeBytes.byteOffset, treeBytes.byteLength);
      const state = { offset: 0 };
      const parent = dirname(rel);
      const archiveBase = rel.slice(0, -'_dir.vpk'.length);

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
            if (state.offset + 18 > treeBytes.length) throw new Error(`truncated VPK metadata in ${rel}`);

            const fileName = normalizePath(fileNameRaw);
            state.offset += 4;
            const preloadBytes = treeView.getUint16(state.offset, true); state.offset += 2;
            const archiveIndex = treeView.getUint16(state.offset, true); state.offset += 2;
            const entryOffset = treeView.getUint32(state.offset, true); state.offset += 4;
            const entryLength = treeView.getUint32(state.offset, true); state.offset += 4;
            const terminator = treeView.getUint16(state.offset, true); state.offset += 2;
            if (terminator !== 0xffff) throw new Error(`bad VPK entry terminator in ${rel}`);
            if (state.offset + preloadBytes > treeBytes.length) throw new Error(`truncated VPK preload in ${rel}`);
            const preload = treeBytes.slice(state.offset, state.offset + preloadBytes);
            state.offset += preloadBytes;

            const ext = extension === ' ' ? '' : normalizePath(extension);
            const internal = [directory, fileName + (ext ? '.' + ext : '')].filter(Boolean).join('/');
            const path = '/' + [parent, internal].filter(Boolean).join('/');
            const totalSize = preload.length + entryLength;
            const shaderCandidate = SHADER_RE.test(internal);
            const fixed = fixedSuffixFor(internal);
            const manifest = shaderCandidate ? shaderManifestEntry(internal) : null;
            const baseDescriptor = {
              kind: 'vpk', path, dirFile: file, dirRel: rel, archiveBase,
              archiveIndex, entryOffset, entryLength, preload, headerSize, treeSize,
              size: totalSize
            };

            if (MAP_RESOURCE_RE.test(internal) || shaderCandidate) addDescriptor(gameEntries, baseDescriptor);

            if (shaderCandidate) discoveredShaderFiles++;
            if (shaderCandidate && !manifest) omittedShaderFiles++;
            const shader = !!manifest && totalSize <= MAX_SINGLE_SHADER_BYTES;

            if (!fixed && !shader) {
              if (manifest && totalSize > MAX_SINGLE_SHADER_BYTES) {
                skippedHugeShaders++;
                log(`Boot overlay skipped unusually large VPK shader (${totalSize} bytes): ${parent}/${internal}`);
              }
              continue;
            }

            if (fixed) fixedFound.add(fixed);
            if (addDescriptor(found, {
              ...baseDescriptor,
              category: shader ? 'shader' : 'boot',
              family: shader ? manifest.family : null
            }) && shader) {
              vpkShaders++;
              selectedShaderFiles++;
            }
          }
        }
      }
    }

    log(`Boot overlay: found ${fixedFound.size}/${BOOT_ASSET_SUFFIXES.length} fixed Source assets.`);
    for (const suffix of BOOT_ASSET_SUFFIXES) {
      const normalized = normalizePath(suffix);
      if (!fixedFound.has(normalized)) log(`Boot overlay missing from selected install: ${normalized}`);
    }
    log(`Boot shader manifest ${MANIFEST_VERSION}: selected ${selectedShaderFiles}/${discoveredShaderFiles} retail .vcs files; deferred ${omittedShaderFiles} unrelated shader files.`);
    log(`Boot shader sources: ${looseShaders} loose, ${vpkShaders} VPK.`);
    if (skippedHugeShaders) log(`Boot overlay skipped ${skippedHugeShaders} shader file(s) larger than ${MAX_SINGLE_SHADER_BYTES} bytes.`);

    return {
      found, gameEntries, filesByRel, fixedFound, discoveredShaderFiles,
      selectedShaderFiles, omittedShaderFiles, skippedHugeShaders
    };
  }

  async function readDescriptor(descriptor, filesByRel) {
    if (descriptor.kind === 'loose') return descriptor.file;

    const pieces = [];
    if (descriptor.preload.length) pieces.push(descriptor.preload);
    if (descriptor.entryLength) {
      let archiveFile;
      let start;
      if (descriptor.archiveIndex === 0x7fff) {
        archiveFile = descriptor.dirFile;
        start = descriptor.headerSize + descriptor.treeSize + descriptor.entryOffset;
      } else {
        const rel = `${descriptor.archiveBase}_${String(descriptor.archiveIndex).padStart(3, '0')}.vpk`;
        archiveFile = filesByRel.get(rel);
        if (!archiveFile) throw new Error(`missing VPK segment ${rel} required by ${descriptor.path}`);
        start = descriptor.entryOffset;
      }
      const end = start + descriptor.entryLength;
      if (end > archiveFile.size) throw new Error(`VPK entry exceeds ${archiveFile.name}: ${descriptor.path}`);
      pieces.push(archiveFile.slice(start, end));
    }
    return new Blob(pieces, { type: 'application/octet-stream' });
  }

  function resolveGameEntry(entries, ref, preferredRoot = 'portal') {
    const clean = normalizePath(ref).replace(/^\.\//, '').replace(/^\/+/, '');
    if (!clean) return null;
    if (clean.startsWith('portal/') || clean.startsWith('hl2/') || clean.startsWith('platform/')) {
      const exact = '/' + clean;
      return entries.has(exact) ? exact : null;
    }
    const roots = preferredRoot === 'hl2' ? ['hl2', 'portal', 'platform'] : ['portal', 'hl2', 'platform'];
    for (const root of roots) {
      const candidate = '/' + root + '/' + clean;
      if (entries.has(candidate)) return candidate;
    }
    return null;
  }

  function findEntryBySuffix(entries, suffix) {
    const needle = '/' + normalizePath(suffix);
    for (const path of entries.keys()) if (path.endsWith(needle)) return path;
    return null;
  }

  function resolveMaterialEntry(entries, material, preferredRoot = 'portal') {
    let clean = normalizePath(material).replace(/^materials\//, '').replace(/^\/+/, '');
    if (!clean) return null;
    if (!clean.endsWith('.vmt')) clean += '.vmt';
    return resolveGameEntry(entries, 'materials/' + clean, preferredRoot);
  }

  function parseBSPLumps(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 1036) return null;
    const dv = new DataView(buffer);
    if (dv.getUint32(0, true) !== 0x50534256) return null;
    const lumps = [];
    for (let i = 0; i < 64; i++) {
      const offset = 8 + i * 16;
      const fileofs = dv.getInt32(offset, true);
      const filelen = dv.getInt32(offset + 4, true);
      if (fileofs < 0 || filelen < 0 || fileofs + filelen > buffer.byteLength) lumps.push({ fileofs: 0, filelen: 0 });
      else lumps.push({ fileofs, filelen });
    }
    return { dv, lumps };
  }

  function extractCString(bytes, start, limit) {
    let end = start;
    const max = Math.min(bytes.length, limit == null ? bytes.length : limit);
    while (end < max && bytes[end] !== 0) end++;
    return new TextDecoder('utf-8').decode(bytes.subarray(start, end));
  }

  function discoverBSPMaterialRefs(buffer) {
    const refs = new Set();
    const parsed = parseBSPLumps(buffer);
    if (!parsed) return refs;
    const bytes = new Uint8Array(buffer);
    const stringData = parsed.lumps[43];
    const stringTable = parsed.lumps[44];

    if (stringData.filelen && stringTable.filelen) {
      const count = Math.floor(stringTable.filelen / 4);
      for (let i = 0; i < count; i++) {
        const rel = parsed.dv.getUint32(stringTable.fileofs + i * 4, true);
        if (rel >= stringData.filelen) continue;
        const value = normalizePath(extractCString(bytes, stringData.fileofs + rel, stringData.fileofs + stringData.filelen));
        if (value) refs.add(value);
      }
    }

    const scan = bytes.subarray(0, Math.min(bytes.length, MAX_BSP_TEXT_SCAN_BYTES));
    const text = new TextDecoder('latin1').decode(scan);
    const vmtRe = /[a-zA-Z0-9_./\\-]{2,}\.vmt/g;
    let match;
    while ((match = vmtRe.exec(text))) {
      const value = normalizePath(match[0]).replace(/^materials\//, '');
      if (value) refs.add(value);
    }
    return refs;
  }

  function vmtRootShader(text) {
    const clean = String(text || '')
      .replace(/^\uFEFF/, '')
      .replace(/\/\/[^\r\n]*/g, '')
      .trim();
    const match = clean.match(/^(?:"([^"]+)"|([a-zA-Z0-9_]+))/);
    return match ? String(match[1] || match[2] || '').trim() : '';
  }

  function vmtPatchInclude(text) {
    const match = String(text || '').match(/"?include"?\s*"([^"]+)"/i);
    return match ? match[1] : '';
  }

  async function materialShaderName(path, entries, filesByRel, cache, log, depth = 0) {
    if (!path || depth > 4) return '';
    if (cache.has(path)) return cache.get(path);
    const descriptor = entries.get(path);
    if (!descriptor || Number(descriptor.size || 0) > MAX_VMT_BYTES) {
      cache.set(path, '');
      return '';
    }

    try {
      const blob = await readDescriptor(descriptor, filesByRel);
      const text = await blob.text();
      const root = vmtRootShader(text);
      if (compactShaderName(root) === 'patch') {
        const include = vmtPatchInclude(text);
        const preferred = path.startsWith('/hl2/') ? 'hl2' : 'portal';
        const includedPath = include ? resolveMaterialEntry(entries, include, preferred) : null;
        const shader = includedPath
          ? await materialShaderName(includedPath, entries, filesByRel, cache, log, depth + 1)
          : '';
        cache.set(path, shader);
        return shader;
      }
      cache.set(path, root);
      return root;
    } catch (error) {
      log(`Map shader scan skipped ${path}: ${error?.message || error}`);
      cache.set(path, '');
      return '';
    }
  }

  function buildCompiledShaderIndex(entries) {
    const index = new Map();
    for (const path of entries.keys()) {
      if (!SHADER_RE.test(path)) continue;
      const key = compactShaderName(compiledShaderFamily(path));
      if (!key) continue;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(path);
    }
    for (const paths of index.values()) paths.sort();
    return index;
  }

  function shaderPathsForMaterial(shaderName, shaderIndex) {
    const out = new Set();
    const candidates = materialShaderCandidateKeys(shaderName);
    for (const candidate of candidates) {
      for (const [compiledKey, paths] of shaderIndex) {
        if (compiledKey === candidate || compiledKey.startsWith(candidate)) {
          for (const path of paths) out.add(path);
        }
      }
    }
    return out;
  }

  async function packDescriptors(paths, entries, filesByRel) {
    const encoder = new TextEncoder();
    const parts = [];
    let bytes = 0;
    let records = 0;
    for (const path of [...paths].sort()) {
      const descriptor = entries.get(path);
      if (!descriptor) continue;
      const blob = await readDescriptor(descriptor, filesByRel);
      const pathBytes = encoder.encode(path);
      const header = new Uint8Array(8);
      const view = new DataView(header.buffer);
      view.setUint32(0, pathBytes.length, true);
      view.setUint32(4, blob.size, true);
      parts.push(header, pathBytes, blob);
      bytes += 8 + pathBytes.length + blob.size;
      records++;
    }
    return { blob: new Blob(parts, { type: 'application/octet-stream' }), bytes, records };
  }

  async function buildMapShaderPacks(entries, filesByRel, bootSelectedPaths, log) {
    await caches.delete(MAP_SHADER_CACHE_NAME);
    const cache = await caches.open(MAP_SHADER_CACHE_NAME);
    const shaderIndex = buildCompiledShaderIndex(entries);
    const vmtShaderCache = new Map();
    const seenShaderPaths = new Set([...bootSelectedPaths].map(normalizePath));
    const results = [];

    log(`Map shader index: ${shaderIndex.size} compiled retail shader families available for lazy map packs.`);

    for (const mapName of MAPS) {
      let mapPath = resolveGameEntry(entries, `maps/${mapName}.bsp`, 'portal');
      if (!mapPath) mapPath = findEntryBySuffix(entries, `maps/${mapName}.bsp`);
      if (!mapPath) {
        results.push({ mapName, skipped: true, reason: 'map not found' });
        continue;
      }

      const requiredShaderNames = new Set();
      try {
        const mapBlob = await readDescriptor(entries.get(mapPath), filesByRel);
        const refs = discoverBSPMaterialRefs(await mapBlob.arrayBuffer());
        for (const material of refs) {
          const preferred = mapPath.startsWith('/hl2/') ? 'hl2' : 'portal';
          const vmtPath = resolveMaterialEntry(entries, material, preferred);
          if (!vmtPath) continue;
          const shader = await materialShaderName(vmtPath, entries, filesByRel, vmtShaderCache, log);
          if (shader) requiredShaderNames.add(shader);
        }
      } catch (error) {
        log(`Map shader scan failed for ${mapName}: ${error?.message || error}`);
      }

      const deltaPaths = new Set();
      const matchedFamilies = new Set();
      for (const shaderName of requiredShaderNames) {
        const matches = shaderPathsForMaterial(shaderName, shaderIndex);
        if (!matches.size) {
          log(`Map shader manifest: no compiled .vcs family matched ${shaderName} for ${mapName}.`);
          continue;
        }
        matchedFamilies.add(shaderName);
        for (const path of matches) {
          const normalized = normalizePath(path);
          if (seenShaderPaths.has(normalized)) continue;
          const descriptor = entries.get(path);
          if (!descriptor || Number(descriptor.size || 0) > MAX_SINGLE_SHADER_BYTES) continue;
          seenShaderPaths.add(normalized);
          deltaPaths.add(path);
        }
      }

      if (!deltaPaths.size) {
        results.push({
          mapName,
          records: 0,
          bytes: 0,
          shaderFamilies: [...matchedFamilies]
        });
        continue;
      }

      const packed = await packDescriptors(deltaPaths, entries, filesByRel);
      const url = new URL(`./shader-packs/${mapName}.data`, location.href).href;
      await cache.put(url, new Response(packed.blob, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Render360-Shader-Pack': 'map-v1',
          'X-Render360-Map': mapName,
          'X-Render360-Shader-Records': String(packed.records),
          'X-Render360-Shader-Bytes': String(packed.bytes),
          'X-Render360-Shader-Families': [...matchedFamilies].join(',').slice(0, 4096)
        }
      }));

      log(`Map shader pack ${mapName}: ${packed.records} new .vcs files, ${(packed.bytes / 1048576).toFixed(2)} MiB, families=${[...matchedFamilies].join(',') || 'none'}.`);
      results.push({
        mapName,
        records: packed.records,
        bytes: packed.bytes,
        shaderFamilies: [...matchedFamilies]
      });
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    return results;
  }

  async function build(files, options = {}) {
    if (!('caches' in globalThis)) throw new Error('Cache Storage is unavailable.');
    const log = typeof options.log === 'function' ? options.log : () => {};
    const indexed = await indexTargets(files, log);
    const { found, gameEntries, filesByRel, fixedFound } = indexed;
    if (!found.size) throw new Error('None of the shared Source boot assets were found in the selected Portal install.');
    if (!indexed.selectedShaderFiles) throw new Error('No first-frame Source .vcs shader families were found in the selected Portal/HL2/platform files.');

    const selection = selectWithinBudget(found, log);
    const descriptors = selection.selected.sort((a, b) => a.path.localeCompare(b.path));
    const encoder = new TextEncoder();
    const parts = [];
    let bytes = 0;
    let records = 0;
    let shaderBytes = 0;
    let shaderRecords = 0;

    for (const descriptor of descriptors) {
      const blob = await readDescriptor(descriptor, filesByRel);
      const pathBytes = encoder.encode(descriptor.path);
      const header = new Uint8Array(8);
      const view = new DataView(header.buffer);
      view.setUint32(0, pathBytes.length, true);
      view.setUint32(4, blob.size, true);
      parts.push(header, pathBytes, blob);
      bytes += 8 + pathBytes.length + blob.size;
      records++;
      if (descriptor.category === 'shader') {
        shaderBytes += blob.size;
        shaderRecords++;
      }
    }

    if (bytes > BOOTSTRAP_SHADER_BUDGET_BYTES) {
      throw new Error(`Packed first-frame bootstrap is ${bytes} bytes, above the ${BOOTSTRAP_SHADER_BUDGET_BYTES}-byte Phase 2 budget.`);
    }

    const cache = await caches.open(CACHE_NAME);
    const url = new URL(OVERLAY_PATH, location.href).href;
    await cache.put(url, new Response(new Blob(parts, { type: 'application/octet-stream' }), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Render360-Chunk-Source': 'local-vpk-boot-overlay-manifest',
        'X-Render360-Boot-Manifest': MANIFEST_VERSION,
        'X-Render360-Boot-Bytes': String(bytes),
        'X-Render360-Boot-Records': String(records),
        'X-Render360-Shader-Records': String(shaderRecords)
      }
    }));

    log(`Boot overlay ready: ${records} records, ${(bytes / 1048576).toFixed(2)} MiB; shaders=${shaderRecords} records/${(shaderBytes / 1048576).toFixed(2)} MiB.`);
    log(`Boot shader families: ${selection.includedFamilies.map(x => x.family).join(', ') || 'none'}.`);
    if (selection.omittedFamilies.length) log(`Deferred shader families: ${selection.omittedFamilies.map(x => x.family).join(', ')}.`);

    const bootSelectedPaths = new Set(descriptors.filter(x => x.category === 'shader').map(x => normalizePath(x.path)));
    const mapShaderPacks = await buildMapShaderPacks(gameEntries, filesByRel, bootSelectedPaths, log);

    return {
      ok: true,
      manifestVersion: MANIFEST_VERSION,
      records,
      bytes,
      shaderRecords,
      shaderBytes,
      fixedRecords: fixedFound.size,
      discoveredShaderFiles: indexed.discoveredShaderFiles,
      selectedShaderFiles: indexed.selectedShaderFiles,
      deferredShaderFiles: indexed.omittedShaderFiles,
      includedFamilies: selection.includedFamilies,
      omittedFamilies: selection.omittedFamilies,
      mapShaderPacks,
      skippedHugeShaders: indexed.skippedHugeShaders,
      found: descriptors.map(x => x.path)
    };
  }

  async function hasOverlay() {
    if (!('caches' in globalThis)) return false;
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(new URL(OVERLAY_PATH, location.href).href);
    if (!response || !response.ok) return false;
    const version = response.headers.get('X-Render360-Boot-Manifest');
    const bytes = Number(response.headers.get('X-Render360-Boot-Bytes') || 0);
    return version === MANIFEST_VERSION && bytes > 0 && bytes <= BOOTSTRAP_SHADER_BUDGET_BYTES;
  }

  async function clear() {
    if (!('caches' in globalThis)) return;
    await Promise.all([
      caches.delete(CACHE_NAME),
      caches.delete(MAP_SHADER_CACHE_NAME)
    ]);
  }

  globalThis.Render360PortalBootOverlay = {
    CACHE_NAME,
    MAP_SHADER_CACHE_NAME,
    OVERLAY_PATH,
    MANIFEST_VERSION,
    BOOTSTRAP_SHADER_BUDGET_BYTES,
    BOOT_ASSET_SUFFIXES,
    FIRST_FRAME_SHADER_MANIFEST,
    SHADER_RE,
    shaderManifestEntry,
    build,
    hasOverlay,
    clear
  };
})();