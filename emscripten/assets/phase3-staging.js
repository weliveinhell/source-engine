(() => {
  'use strict';

  const FILES_TYPE = 'render360-retail-files';
  const REQUEST_TYPE = 'render360-retail-request';
  const CRASH_STATE_KEY = 'render360-ios-crash-state-v2';
  const DIRECT_ROOT_RE = /^(portal|hl2|platform)\//i;
  const DIRECT_LOOSE_RE = /\/(?:gameinfo\.txt|steam\.inf|game\.inf)$/i;
  const DIRECT_MAP_TREE_RE = /^(?:portal|hl2)\/maps\//i;
  const DIRECT_SMALL_TREE_RE = /\/(?:cfg|resource|scripts)\//i;
  const MAX_LOOSE_BYTES = 8 * 1024 * 1024;
  const RESIDENCY_POLICY = 'menu-only → current-map-only → no future-map prefetch';

  let retailDescriptors = [];
  let runtimeFrame = null;
  let runtimeOverlay = null;
  let phase3Button = null;

  function normalize(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').toLowerCase();
  }

  function inferRelativePath(file) {
    const raw = normalize(file?.webkitRelativePath || file?.name || '');
    if(!file?.webkitRelativePath) return raw;
    const parts = raw.split('/');
    return parts.length > 1 ? parts.slice(1).join('/') : raw;
  }

  function keepForDirectVPK(path, file) {
    if(!DIRECT_ROOT_RE.test(path)) return false;
    if(/\.vpk$/i.test(path)) return true;
    // Portal ships its BSPs as loose files (for example
    // portal/maps/background1.bsp). Keep File handles for the entire maps tree,
    // including graphs, but never copy their payload into MEMFS.
    if(DIRECT_MAP_TREE_RE.test(path)) return true;
    if(DIRECT_LOOSE_RE.test(path)) return true;
    if(DIRECT_SMALL_TREE_RE.test(path) && Number(file?.size || 0) <= MAX_LOOSE_BYTES) return true;
    return false;
  }

  function summarize(descriptors) {
    let bytes = 0;
    let vpks = 0;
    let dirs = 0;
    let maps = 0;
    let gameinfo = false;
    let background1 = false;
    for(const item of descriptors) {
      const path = normalize(item.path);
      bytes += Number(item.file?.size || 0);
      if(/\.vpk$/i.test(path)) vpks++;
      if(/_dir\.vpk$/i.test(path)) dirs++;
      if(DIRECT_MAP_TREE_RE.test(path)) maps++;
      if(path === 'portal/gameinfo.txt') gameinfo = true;
      if(path === 'portal/maps/background1.bsp') background1 = true;
    }
    return { files: descriptors.length, bytes, vpks, dirs, maps, gameinfo, background1 };
  }

  // The page's own refresh() also writes launchHint, with technical text
  // about the old packed-chunk path. Once the folder is ready for Phase 3,
  // keep showing the short message instead.
  let phase3Hint = '';
  let hintObserver = null;
  function setPhase3Status(text) {
    const hint = document.getElementById('launchHint');
    if(!hint) return;
    phase3Hint = text;
    hint.textContent = text;
    if(!hintObserver && typeof MutationObserver === 'function') {
      hintObserver = new MutationObserver(() => {
        if(phase3Hint && globalThis.render360Phase3DirectSelected && hint.textContent !== phase3Hint) {
          hint.textContent = phase3Hint;
        }
      });
      hintObserver.observe(hint, { childList: true, characterData: true, subtree: true });
    }
  }

  function refreshButton() {
    if(!phase3Button) return;
    const stats = summarize(retailDescriptors);
    const ready = stats.gameinfo && stats.background1 && stats.dirs > 0 && stats.vpks > 0;
    phase3Button.disabled = !ready;
    globalThis.render360Phase3DirectSelected = ready;
    if(ready) {
      phase3Button.textContent = 'Play Portal';
      setPhase3Status(`Ready. ${stats.vpks} game archives and ${stats.maps} maps found.`);
    } else if(stats.gameinfo && stats.vpks > 0 && !stats.background1) {
      setPhase3Status('Some files are missing (portal/maps/background1.bsp). Choose the whole Portal folder.');
    }
  }

  function rememberFolder(fileList) {
    const files = Array.from(fileList || []);
    const next = [];
    for(const file of files) {
      const path = inferRelativePath(file);
      if(!keepForDirectVPK(path, file)) continue;
      next.push({ path, file });
    }
    retailDescriptors = next;
    globalThis.render360Phase3RetailFiles = retailDescriptors;
    const stats = summarize(retailDescriptors);
    globalThis.render360Phase3DirectSelected = !!(stats.gameinfo && stats.background1 && stats.dirs > 0 && stats.vpks > 0);
    try {
      sessionStorage.setItem('render360-phase3-retail-summary-v1', JSON.stringify({
        at: Date.now(), files: stats.files, vpks: stats.vpks, dirs: stats.dirs,
        maps: stats.maps, bytes: stats.bytes, gameinfo: stats.gameinfo,
        background1: stats.background1, residencyPolicy: RESIDENCY_POLICY
      }));
    } catch(_) {}
    refreshButton();
  }

  function markFreshLaunch() {
    try {
      const state = JSON.parse(localStorage.getItem(CRASH_STATE_KEY) || 'null');
      if(state) {
        state.active = false;
        state.blocked = false;
        state.interruption = null;
        state.phase = 'phase3-manual-relaunch';
        state.updatedAt = Date.now();
        localStorage.setItem(CRASH_STATE_KEY, JSON.stringify(state));
      }
      localStorage.removeItem('render360-ios-last-error-v1');
      localStorage.removeItem('render360-missing-shader-v1');
      localStorage.removeItem('render360-startup-checkpoint-v1');
    } catch(_) {}
  }

  function closeRuntime() {
    if(runtimeFrame) {
      try { runtimeFrame.src = 'about:blank'; } catch(_) {}
      runtimeFrame.remove();
      runtimeFrame = null;
    }
    if(runtimeOverlay) {
      runtimeOverlay.remove();
      runtimeOverlay = null;
    }
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    leaveImmersive();
    try {
      if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if(document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch(_) {}
  }

  function launchDirectVPK() {
    const stats = summarize(retailDescriptors);
    if(!stats.gameinfo || !stats.background1 || !stats.dirs || !stats.vpks) {
      setPhase3Status('Choose your Portal folder again. The browser forgets it after a reload.');
      return;
    }

    closeRuntime();
    markFreshLaunch();
    try {
      const root = document.documentElement;
      const request = root.requestFullscreen || root.webkitRequestFullscreen;
      if(typeof request === 'function') Promise.resolve(request.call(root)).catch(() => {});
    } catch(_) {}
    globalThis.render360Phase3DirectSelected = true;
    setPhase3Status('Starting Portal…');

    // The game owns the whole screen: no header, no borders. The in-game menu
    // (and its Quit button) lives inside the launcher page itself.
    const overlay = document.createElement('div');
    overlay.id = 'render360Phase3Runtime';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#000;';

    const frame = document.createElement('iframe');
    frame.id = 'render360Phase3Frame';
    frame.title = 'Portal';
    // Use both the modern Permissions Policy and legacy iframe fullscreen flags.
    // Safari/iOS implementations have shipped both code paths over time.
    frame.allow = 'fullscreen; autoplay; gamepad';
    frame.allowFullscreen = true;
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('webkitallowfullscreen', '');
    frame.style.cssText = 'position:absolute;inset:0;border:0;width:100%;height:100%;display:block;background:#000;';
    frame.src = './hl2_launcher.html?render360Phase3=' + Date.now();

    overlay.append(frame);
    document.body.appendChild(overlay);
    runtimeOverlay = overlay;
    runtimeFrame = frame;
    enterImmersive();
  }

  // Safari collapses its address bar when the page scrolls down. While the
  // game runs, give the page room to scroll behind the fixed game layer and
  // scroll it on every landscape rotation, so turning the phone sideways
  // goes full screen like it did with the old launcher page.
  let immersiveSpacer = null;
  function collapseBrowserBars() {
    if(!runtimeOverlay) return;
    const landscape = window.matchMedia && matchMedia('(orientation: landscape)').matches;
    if(!landscape) return;
    window.scrollTo(0, document.documentElement.scrollHeight);
  }
  function onRotate() { setTimeout(collapseBrowserBars, 350); setTimeout(collapseBrowserBars, 900); }
  function enterImmersive() {
    if(!immersiveSpacer) {
      immersiveSpacer = document.createElement('div');
      immersiveSpacer.style.cssText = 'height:60vh;pointer-events:none';
      document.body.appendChild(immersiveSpacer);
    }
    window.addEventListener('orientationchange', onRotate);
    window.addEventListener('resize', onRotate);
    onRotate();
  }
  function leaveImmersive() {
    window.removeEventListener('orientationchange', onRotate);
    window.removeEventListener('resize', onRotate);
    if(immersiveSpacer) { immersiveSpacer.remove(); immersiveSpacer = null; }
    window.scrollTo(0, 0);
  }

  function installUI() {
    const folder = document.getElementById('ownershipFolder');
    if(folder) {
      // Register before the page's normal verifier. It later clears input.value,
      // but these File objects remain strongly referenced in this staging page.
      folder.addEventListener('change', event => rememberFolder(event.target.files));
    }

    const existingLaunch = document.getElementById('launch');
    const actions = existingLaunch?.parentElement;
    if(actions && !document.getElementById('launchPhase3')) {
      const button = document.createElement('button');
      button.id = 'launchPhase3';
      button.type = 'button';
      button.disabled = true;
      // Formerly "Launch Phase 3 · Current Map Only".
      button.textContent = 'Play Portal';
      button.addEventListener('click', launchDirectVPK);
      actions.prepend(button);
      phase3Button = button;
    }
    refreshButton();
  }

  window.addEventListener('message', event => {
    if(event.origin !== location.origin) return;
    if(!runtimeFrame || event.source !== runtimeFrame.contentWindow) return;
    const data = event?.data;
    if(data && data.type === 'render360-exit') {
      closeRuntime();
      return;
    }
    if(!data || data.type !== REQUEST_TYPE || !data.token) return;
    const stats = summarize(retailDescriptors);
    if(!stats.gameinfo || !stats.background1 || !stats.dirs || !stats.vpks) return;
    runtimeFrame.contentWindow.postMessage({
      type: FILES_TYPE,
      token: data.token,
      files: retailDescriptors
    }, location.origin);
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUI, { once: true });
  else installUI();
})();