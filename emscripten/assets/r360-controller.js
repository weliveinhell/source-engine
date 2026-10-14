// Render360 on-screen controller for touch devices.
//
// A gamepad-style overlay above the game canvas. Buttons are sent to the
// engine as ordinary keyboard and mouse events (Portal's default bindings),
// so nothing in the engine has to change. Touches that miss every button fall
// through to the canvas, where Source's touch layer turns them into camera
// look (pre.js writes a touch.cfg with one full-screen look zone).
;(() => {
  'use strict';

  let touch = false;
  try { touch = navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches; } catch (_) {}
  if (!touch) return;

  const KEYS = {
    W: { key: 'w', code: 'KeyW', keyCode: 87 },
    A: { key: 'a', code: 'KeyA', keyCode: 65 },
    S: { key: 's', code: 'KeyS', keyCode: 83 },
    D: { key: 'd', code: 'KeyD', keyCode: 68 },
    E: { key: 'e', code: 'KeyE', keyCode: 69 },
    SPACE: { key: ' ', code: 'Space', keyCode: 32 },
    CTRL: { key: 'Control', code: 'ControlLeft', keyCode: 17, location: 1 },
    SHIFT: { key: 'Shift', code: 'ShiftLeft', keyCode: 16, location: 1 },
    ESC: { key: 'Escape', code: 'Escape', keyCode: 27 },
    ENTER: { key: 'Enter', code: 'Enter', keyCode: 13 },
    TAB: { key: 'Tab', code: 'Tab', keyCode: 9 },
    F6: { key: 'F6', code: 'F6', keyCode: 117 },
    F9: { key: 'F9', code: 'F9', keyCode: 120 },
    UP: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
    DOWN: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
    LEFT: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
    RIGHT: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  };

  // Two mappings. "game" drives Portal; "menu" drives Source's menus and
  // dialogs: the stick moves the selection, A/Start accept, B/Pause go back.
  // The mode follows the game: menu on the background map and while paused,
  // game once a real map loads.
  const MENU_KEYS = { a: 'ENTER', start: 'ENTER', x: 'ENTER', b: 'ESC', y: null, back: 'ESC',
    lb: 'LEFT', rb: 'RIGHT', lt: null, rt: null };
  let mode = 'menu';

  // Portal's default bindings. Geometry is measured one-to-one from the
  // reference pad (iPhone 11 landscape, 896x350 CSS px below Safari's bar):
  // x/y are the top-left corner as fractions of the page, w/h in CSS px.
  const BUTTONS = [
    { id: 'pause', label: 'Pause', sub: 'Menu', key: 'ESC', tint: 'amber', menuToggle: true, x: .1094, y: .111, w: 92, h: 40 },
    { id: 'back', label: 'Back', sub: 'Quick save', key: 'F6', tint: 'gray', x: .4068, y: .111, w: 61, h: 40 },
    { id: 'start', label: 'Start', sub: 'Quick load', key: 'F9', tint: 'gray', x: .4955, y: .111, w: 65, h: 40 },
    { id: 'lb', label: 'LB', sub: 'Walk', key: 'SHIFT', tint: 'navy', x: .6362, y: .120, w: 64, h: 40 },
    { id: 'rb', label: 'RB', sub: 'Use', key: 'E', tint: 'navy', x: .7243, y: .120, w: 65, h: 40 },
    { id: 'lt', label: 'LT', sub: 'Blue portal', mouse: 0, tint: 'green', x: .1546, y: .419, w: 92, h: 39 },
    { id: 'rt', label: 'RT', sub: 'Orange portal', mouse: 2, tint: 'red', x: .8058, y: .419, w: 92, h: 39 },
    { id: 'y', label: 'Y', sub: 'Walk', key: 'SHIFT', tint: 'amber', face: true, x: .7210, y: .473, w: 50, h: 41 },
    { id: 'x', label: 'X', sub: 'Use', key: 'E', tint: 'navy', face: true, x: .6680, y: .570, w: 50, h: 41 },
    { id: 'b', label: 'B', sub: 'Crouch', key: 'CTRL', tint: 'red', face: true, x: .7734, y: .570, w: 50, h: 41 },
    { id: 'a', label: 'A', sub: 'Jump', key: 'SPACE', tint: 'green', face: true, x: .7199, y: .670, w: 50, h: 41 },
  ];
  const STICK = { x: .1211, y: .551, w: 145, h: 110 };
  const REF_W = 896, REF_H = 350;

  const css = `
    #r360c { position: fixed; inset: 0; z-index: 25; pointer-events: none; display: none;
      font: 600 9px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; color: #e9eaee;
      -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
    body.r360-playing #r360c.r360c-on { display: block; }
    #r360c { transition: opacity .45s ease; }
    /* Fades out of the way when the screen is not being touched; any touch
       brings it straight back (and still presses the button under it). */
    #r360c.r360c-idle { opacity: .16; }
    /* Dark, faintly tinted glass with a hairline border, as in the reference;
       the fill is translucent so the game shows through. */
    #r360c button, #r360c-stick { pointer-events: auto; position: absolute; appearance: none; margin: 0; padding: 0;
      color: #e9eaee; font: inherit; touch-action: none;
      background: rgba(var(--bg), .62); border: 1px solid rgba(var(--bd), .95);
      display: flex; align-items: center; justify-content: center; line-height: 1;
      transition: transform .06s ease, background-color .06s ease, border-color .06s ease; }
    #r360c button { border-radius: 999px; }
    /* Face buttons are short pills (50x41), not circles or ellipses. */
    #r360c button.r360c-face { border-radius: 999px; }
    #r360c button.r360c-down { transform: scale(.94); background: rgba(var(--bd), .7); border-color: rgba(255,255,255,.55); }
    .r360c-gray  { --bg: 27,28,32;  --bd: 60,62,68; }
    .r360c-amber { --bg: 52,40,22;  --bd: 120,94,48; }
    .r360c-navy  { --bg: 18,26,40;  --bd: 44,60,86; }
    .r360c-green { --bg: 16,32,27;  --bd: 40,74,60; }
    .r360c-red   { --bg: 38,22,22;  --bd: 80,46,42; }
    #r360c-stick { --bg: 27,28,32; --bd: 60,62,68; display: block; }
    #r360c-stick .r360c-arrow { position: absolute; width: 9px; height: 9px; border: solid rgba(233,234,238,.92);
      border-width: 0 1.6px 1.6px 0; }
    #r360c-stick .r360c-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      transition: opacity .1s; }
    #r360c-knob { position: absolute; border-radius: 50%; background: rgba(233,234,238,.16);
      border: 1px solid rgba(233,234,238,.45); opacity: 0; transition: opacity .1s; pointer-events: none; }
    #r360c-stick.r360c-active #r360c-knob { opacity: 1; }
    #r360c-stick.r360c-active .r360c-label { opacity: 0; }
  `;

  // ------------------------------------------------------------------ input
  const held = new Map();   // key name -> press count (two buttons may share a key)

  function keyEvent(type, name) {
    const k = KEYS[name];
    if (!k) return;
    const event = new KeyboardEvent(type, {
      key: k.key, code: k.code, location: k.location || 0,
      keyCode: k.keyCode, which: k.keyCode, bubbles: true, cancelable: true,
    });
    // WebKit ignores keyCode/which in the init dictionary on some versions;
    // Emscripten's key handler reads them, so pin them on the instance.
    try { Object.defineProperty(event, 'keyCode', { get: () => k.keyCode }); } catch (_) {}
    try { Object.defineProperty(event, 'which', { get: () => k.keyCode }); } catch (_) {}
    window.dispatchEvent(event);
  }

  function press(name) {
    const count = held.get(name) || 0;
    held.set(name, count + 1);
    if (count === 0) keyEvent('keydown', name);
  }

  function release(name) {
    const count = held.get(name) || 0;
    if (count <= 1) {
      held.delete(name);
      if (count === 1) keyEvent('keyup', name);
    } else {
      held.set(name, count - 1);
    }
  }

  function mouseEvent(type, button) {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const init = {
      bubbles: true, cancelable: true, view: window, button,
      buttons: type === 'mousedown' ? (button === 2 ? 2 : 1) : 0,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
      screenX: rect.left + rect.width / 2, screenY: rect.top + rect.height / 2,
    };
    canvas.dispatchEvent(new MouseEvent(type, init));
  }

  function releaseAll() {
    for (const name of Array.from(held.keys())) {
      held.set(name, 1);
      release(name);
    }
  }

  // ------------------------------------------------------------------ build
  const root = document.createElement('div');
  root.id = 'r360c';
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const elements = {};
  for (const spec of BUTTONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `r360c-${spec.tint}${spec.face ? ' r360c-face' : ''}`;
    button.dataset.id = spec.id;
    button.textContent = spec.label;
    button.setAttribute('aria-label', `${spec.label}: ${spec.sub}`);
    root.appendChild(button);
    elements[spec.id] = button;

    let pointer = null;
    const down = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (pointer !== null) return;
      pointer = event.pointerId;
      try { button.setPointerCapture(pointer); } catch (_) {}
      button.classList.add('r360c-down');
      if (spec.menuToggle) {
        // Escape opens the pause menu in a level and backs out of menus.
        keyEvent('keydown', spec.key);
        keyEvent('keyup', spec.key);
        releaseAll();
        if (inMap) setMode(mode === 'game' ? 'menu' : 'game');
        return;
      }
      if (mode === 'menu') {
        const name = MENU_KEYS[spec.id];
        if (name) {
          keyEvent('keydown', name);
          keyEvent('keyup', name);
          // Backing out of the pause menu returns to the game.
          if (name === 'ESC' && inMap) setMode('game');
        }
        return;
      }
      if (spec.key) {
        press(spec.key);
      } else if (spec.mouse !== undefined) {
        mouseEvent('mousedown', spec.mouse);
      }
      button.dataset.held = '1';
    };
    const up = (event) => {
      if (pointer === null || event.pointerId !== pointer) return;
      event.preventDefault();
      pointer = null;
      button.classList.remove('r360c-down');
      if (button.dataset.held !== '1') return;
      delete button.dataset.held;
      if (spec.key) release(spec.key);
      else if (spec.mouse !== undefined) mouseEvent('mouseup', spec.mouse);
    };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Move stick: 8-way WASD with a dead zone.
  const stick = document.createElement('div');
  stick.id = 'r360c-stick';
  stick.innerHTML = '<i class="r360c-arrow r360c-up"></i><i class="r360c-arrow r360c-down"></i>' +
    '<i class="r360c-arrow r360c-left"></i><i class="r360c-arrow r360c-right"></i>' +
    '<span class="r360c-label">Move</span><div id="r360c-knob"></div>';
  root.appendChild(stick);
  const knob = stick.querySelector('#r360c-knob');
  let stickPointer = null;
  const stickKeys = new Set();

  // Menu mode: one arrow press per direction change, then auto-repeat while
  // the stick is held, like a console pad in a list.
  let menuDir = null;
  let menuTimer = 0;
  function menuStep(dir) {
    if (dir === menuDir) return;
    menuDir = dir;
    clearTimeout(menuTimer);
    if (!dir) return;
    const tap = () => { keyEvent('keydown', dir); keyEvent('keyup', dir); };
    tap();
    const repeat = () => { if (menuDir !== dir) return; tap(); menuTimer = setTimeout(repeat, 140); };
    menuTimer = setTimeout(repeat, 380);
  }

  function setStickKeys(next) {
    if (mode === 'menu') {
      let dir = null;
      if (next.has('W')) dir = 'UP';
      else if (next.has('S')) dir = 'DOWN';
      else if (next.has('A')) dir = 'LEFT';
      else if (next.has('D')) dir = 'RIGHT';
      menuStep(dir);
      return;
    }
    menuStep(null);
    for (const name of stickKeys) if (!next.has(name)) { stickKeys.delete(name); release(name); }
    for (const name of next) if (!stickKeys.has(name)) { stickKeys.add(name); press(name); }
  }

  function moveStick(event) {
    const rect = stick.getBoundingClientRect();
    const knobSize = knob.offsetWidth || 40;
    const maxX = Math.max(10, rect.width / 2 - knobSize / 2 - 4);
    const maxY = Math.max(10, rect.height / 2 - knobSize / 2 - 4);
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    let nx = dx / maxX, ny = dy / maxY;
    const length = Math.hypot(nx, ny);
    if (length > 1) { nx /= length; ny /= length; }
    knob.style.transform = `translate(${nx * maxX}px, ${ny * maxY}px)`;
    const next = new Set();
    const dead = 0.32;
    if (ny < -dead) next.add('W');
    if (ny > dead) next.add('S');
    if (nx < -dead) next.add('A');
    if (nx > dead) next.add('D');
    setStickKeys(next);
  }

  stick.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (stickPointer !== null) return;
    stickPointer = event.pointerId;
    try { stick.setPointerCapture(stickPointer); } catch (_) {}
    stick.classList.add('r360c-active');
    moveStick(event);
  });
  stick.addEventListener('pointermove', (event) => {
    if (event.pointerId !== stickPointer) return;
    event.preventDefault();
    moveStick(event);
  });
  const endStick = (event) => {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null;
    stick.classList.remove('r360c-active');
    knob.style.transform = '';
    setStickKeys(new Set());
  };
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);
  stick.addEventListener('lostpointercapture', endStick);

  // ------------------------------------------------------------------ layout
  // Safe-area insets. The game runs in a full-screen iframe, where env()
  // reports 0, so measure them in the (same-origin) parent page.
  function safeInsets() {
    const read = (doc) => {
      const probe = doc.createElement('div');
      probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      doc.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      const out = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
        b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
      probe.remove();
      return out;
    };
    let own = { t: 0, r: 0, b: 0, l: 0 };
    try { own = read(document); } catch (_) {}
    try {
      if (window.parent && window.parent !== window && window.parent.document && window.parent.document.body) {
        const p = read(window.parent.document);
        return { t: Math.max(own.t, p.t), r: Math.max(own.r, p.r), b: Math.max(own.b, p.b), l: Math.max(own.l, p.l) };
      }
    } catch (_) {}
    return own;
  }

  // Thumb-zone layout, mirrored left/right:
  //   top row     Pause (left) · Back Start (centre) · LB RB (right)
  //   left thumb  Move pad in the bottom corner, LT just above it
  //   right thumb Y/X/B/A diamond level with the pad, RT just above it
  // Sizes and shapes come from the reference pad; positions are anchored to
  // the edges and safe area so spacing stays natural on any screen.
  function layout() {
    const vv = window.visualViewport;
    const W = vv ? vv.width : window.innerWidth;
    const H = vv ? vv.height : window.innerHeight;
    const k = Math.max(0.75, Math.min(1.35, Math.min(W / REF_W, H / REF_H)));
    const inset = safeInsets();
    const side = Math.max(inset.l, inset.r);          // the notch can be on either side
    const M = side + 40 * k;                           // side margin
    const top = inset.t + Math.max(38, 38 * k);        // below the ••• menu pill (8–30 px)
    const bottom = H - inset.b - 24 * k;
    root.style.fontSize = `${9 * k}px`;

    const spec = Object.fromEntries(BUTTONS.map((b) => [b.id, b]));
    const put = (el, w, h, left, topY) => {
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(topY)}px`;
    };
    const dims = (id) => [spec[id].w * k, spec[id].h * k];

    // Top row.
    let [w, h] = dims('pause'); put(elements.pause, w, h, M, top);
    // Back and Start flank the 44 px ••• pill with a fixed gap.
    const flank = 22 + 12 * k;
    [w, h] = dims('back'); put(elements.back, w, h, W / 2 - flank - w, top);
    [w, h] = dims('start'); put(elements.start, w, h, W / 2 + flank, top);
    const [rbw, rbh] = dims('rb'); put(elements.rb, rbw, rbh, W - M - rbw, top);
    [w, h] = dims('lb'); put(elements.lb, w, h, W - M - rbw - 14 * k - w, top);

    // Left thumb: Move pad, LT above it.
    const sw = STICK.w * k, sh = STICK.h * k;
    const padLeft = M, padTop = bottom - sh;
    put(stick, sw, sh, padLeft, padTop);
    [w, h] = dims('lt'); put(elements.lt, w, h, padLeft + sw / 2 - w / 2, padTop - 14 * k - h);

    // Right thumb: face diamond level with the pad, RT above it.
    const [fw, fh] = dims('a');
    const dx = 47.5 * k, dy = 34.5 * k;
    const cx = W - M - fw / 2 - dx;
    const cy = padTop + sh / 2;
    put(elements.y, fw, fh, cx - fw / 2, cy - dy - fh / 2);
    put(elements.a, fw, fh, cx - fw / 2, cy + dy - fh / 2);
    put(elements.x, fw, fh, cx - dx - fw / 2, cy - fh / 2);
    put(elements.b, fw, fh, cx + dx - fw / 2, cy - fh / 2);
    [w, h] = dims('rt'); put(elements.rt, w, h, cx - w / 2, cy - dy - fh / 2 - 12 * k - h);

    // Move pad internals.
    stick.style.borderRadius = `${48 * k}px / ${46 * k}px`;
    const a = 9 * k;
    const arrows = {
      up: [sw / 2 - a / 2, 12 * k, -135], down: [sw / 2 - a / 2, sh - 12 * k - a, 45],
      left: [16 * k, sh / 2 - a / 2, 135], right: [sw - 16 * k - a, sh / 2 - a / 2, -45],
    };
    for (const [dir, [x, y, rot]] of Object.entries(arrows)) {
      const el = stick.querySelector(`.r360c-${dir}`);
      el.style.width = el.style.height = `${a}px`;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.transform = `rotate(${rot}deg)`;
    }
    const kn = 40 * k;
    knob.style.width = knob.style.height = `${kn}px`;
    knob.style.left = `${(sw - kn) / 2}px`;
    knob.style.top = `${(sh - kn) / 2}px`;
  }

  // ------------------------------------------------------------------ state
  // Visible by default on touch screens, on the menus too, so the menus can
  // be driven with the stick and A. The ••• menu can hide or show it.
  let wanted = null;    // null = automatic, true/false = player's choice
  let inMap = false;

  function setMode(next) {
    if (mode === next) return;
    releaseAll();
    menuStep(null);
    for (const name of Array.from(stickKeys)) { stickKeys.delete(name); }
    mode = next;
    root.dataset.mode = mode;
    const label = stick.querySelector('.r360c-label');
    if (label) label.textContent = mode === 'menu' ? 'Select' : 'Move';
  }

  function apply() {
    const on = wanted === null ? true : wanted;
    root.classList.toggle('r360c-on', on);
    if (!on) { releaseAll(); menuStep(null); }
    const toggle = document.getElementById('r360-controller-row');
    if (toggle) toggle.textContent = on ? 'Hide controller' : 'Show controller';
  }

  window.render360ToggleController = () => {
    const on = root.classList.contains('r360c-on');
    wanted = !on;
    apply();
  };

  // pre.js / phase3 loaders announce every map they load.
  window.render360ControllerSeeLine = (line) => {
    const match = /\[Render360 Phase 3\]\s+([A-Za-z0-9_]+):\s+current-map-only/.exec(line) ||
      /\bloaded\s+([A-Za-z0-9_]+)\.data\b/.exec(line);
    if (!match) return;
    inMap = !/^background/i.test(match[1]);
    setMode(inMap ? 'game' : 'menu');
    apply();
  };

  // Idle fade.
  const IDLE_MS = 4000;
  let idleTimer = 0;
  function wake() {
    root.classList.remove('r360c-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      // Never fade while a control is held.
      if (stickPointer !== null || held.size) { wake(); return; }
      root.classList.add('r360c-idle');
    }, IDLE_MS);
  }
  for (const type of ['pointerdown', 'touchstart']) {
    document.addEventListener(type, wake, { capture: true, passive: true });
  }

  function mount() {
    root.dataset.mode = mode;
    const label = stick.querySelector('.r360c-label');
    if (label) label.textContent = mode === 'menu' ? 'Select' : 'Move';
    document.body.appendChild(root);
    layout();
    apply();
    wake();
  }

  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 300));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
