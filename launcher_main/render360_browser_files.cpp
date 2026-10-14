// Render360 browser-backed retail file bridge.
//
// This code is linked into the MAIN_MODULE and exported for filesystem_stdio.so.
// Source runs under PROXY_TO_PTHREAD, so the EM_ASM calls below execute on the
// calling Source pthread. Phase 3/4 transfers the user's File objects into that
// worker; FileReaderSync can therefore service synchronous Source/VPK reads
// without copying the retail archives into MEMFS or the Wasm heap permanently.
//
// Keep this bridge on EM_ASM rather than EM_JS. Emscripten emits generated `.sig`
// metadata for EM_JS helpers; in the baseline 4.0.9 MAIN_MODULE + pthread build
// that metadata can land in an invalid optimizer context. Inline asm-const calls
// avoid that generated helper layer while preserving synchronous worker reads.

#ifdef __EMSCRIPTEN__

#include <emscripten.h>
#include <stddef.h>

extern "C" EMSCRIPTEN_KEEPALIVE int render360_browser_file_open(const char *pathPtr)
{
    return EM_ASM_INT({
        try {
            if (typeof FileReaderSync === 'undefined') return -1;
            var path = UTF8ToString($0 || 0);
            path = path.split('\\\\').join('/');
            while (path.indexOf('//') >= 0) path = path.split('//').join('/');
            while (path.charAt(0) === '/') path = path.slice(1);
            while (path.indexOf('/./') >= 0) path = path.split('/./').join('/');
            while (path.slice(0, 2) === './') path = path.slice(2);
            path = path.toLowerCase();

            var file = null;
            var files = globalThis.__render360RetailFileMap;
            if (files && typeof files.get === 'function') file = files.get(path) || null;
            if (!file && typeof FS !== 'undefined') {
                try {
                    var resolved = FS.lookupPath('/render360-retail/' + path, { follow: true });
                    var node = resolved && resolved.node;
                    if (node && node.contents && typeof node.contents.slice === 'function') file = node.contents;
                } catch (_) {}
            }
            if (!file) return -1;

            var handles = globalThis.__render360RetailHandles;
            if (!handles) handles = globalThis.__render360RetailHandles = new Map();
            var next = (globalThis.__render360RetailNextHandle | 0) || 1;
            while (handles.has(next)) {
                next = (next + 1) | 0;
                if (next <= 0) next = 1;
            }
            handles.set(next, file);
            globalThis.__render360RetailNextHandle = (next + 1) | 0;
            return next;
        } catch (e) {
            try { console.error('[Render360 direct file] open failed', e); } catch (_) {}
            return -1;
        }
    }, pathPtr);
}

extern "C" EMSCRIPTEN_KEEPALIVE double render360_browser_file_size(int handle)
{
    return EM_ASM_DOUBLE({
        try {
            var handles = globalThis.__render360RetailHandles;
            var file = handles && handles.get($0 | 0);
            return file ? Number(file.size || 0) : -1;
        } catch (_) {
            return -1;
        }
    }, handle);
}

extern "C" EMSCRIPTEN_KEEPALIVE int render360_browser_file_read(int handle, double offset, void *dest, int length)
{
    return EM_ASM_INT({
        try {
            var handles = globalThis.__render360RetailHandles;
            var file = handles && handles.get($0 | 0);
            if (!file || typeof FileReaderSync === 'undefined') return -1;
            var start = Math.max(0, Math.floor(Number($1) || 0));
            var requested = Math.max(0, $3 | 0);
            if (!requested || start >= file.size) return 0;
            var end = Math.min(file.size, start + requested);
            var buffer = new FileReaderSync().readAsArrayBuffer(file.slice(start, end));
            var bytes = new Uint8Array(buffer);
            HEAPU8.set(bytes, $2 >>> 0);
            return bytes.byteLength | 0;
        } catch (e) {
            try { console.error('[Render360 direct file] read failed', e); } catch (_) {}
            return -1;
        }
    }, handle, offset, dest, length);
}

extern "C" EMSCRIPTEN_KEEPALIVE void render360_browser_file_close(int handle)
{
    EM_ASM({
        try {
            var handles = globalThis.__render360RetailHandles;
            if (handles) handles.delete($0 | 0);
        } catch (_) {}
    }, handle);
}

extern "C" EMSCRIPTEN_KEEPALIVE double render360_browser_file_stat(const char *pathPtr)
{
    return EM_ASM_DOUBLE({
        try {
            var path = UTF8ToString($0 || 0);
            path = path.split('\\\\').join('/');
            while (path.indexOf('//') >= 0) path = path.split('//').join('/');
            while (path.charAt(0) === '/') path = path.slice(1);
            while (path.indexOf('/./') >= 0) path = path.split('/./').join('/');
            while (path.slice(0, 2) === './') path = path.slice(2);
            path = path.toLowerCase();

            var file = null;
            var files = globalThis.__render360RetailFileMap;
            if (files && typeof files.get === 'function') file = files.get(path) || null;
            if (!file && typeof FS !== 'undefined') {
                try {
                    var resolved = FS.lookupPath('/render360-retail/' + path, { follow: true });
                    var node = resolved && resolved.node;
                    if (node && node.contents && typeof node.contents.slice === 'function') file = node.contents;
                } catch (_) {}
            }
            return file ? Number(file.size || 0) : -1;
        } catch (_) {
            return -1;
        }
    }, pathPtr);
}

#endif // __EMSCRIPTEN__
