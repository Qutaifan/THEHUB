/* ==========================================================================
   THEHUB — hub-core.js
   The hero's hub core: a real-time WebGL object, homepage only.

   THEHUB's mark is a core with satellites on spokes. This is that object made
   live, and made to MEAN something: there are four orbits because there are
   four pillars, and each orbit carries exactly as many nodes as its pillar has
   tools. The counts and names are read from the stats strip already on the
   page — nothing here states a number the page does not.

   It is interactive. Drag spins it with inertia, hover excites it, a click
   fires a shockwave. Hovering a stat lights that pillar's orbit, and hovering
   near an orbit's lead satellite lights its stat. Scrolling warps it past the
   camera, and on load it assembles out of hyperspace streaks.

   How it is drawn: every particle is positioned on the CPU (a few thousand
   points, no per-particle trig outside the orbits) and uploaded as one
   interleaved buffer; the GPU only rasterises additive point sprites and
   hairlines. The canvas is opaque black on purpose — it sits in .fx-field
   inside a `mix-blend-mode: screen` host (see motion.css §15), so black drops
   out and only light lands on the field.

   Progressive enhancement, because this page earns money:
     - reduced motion, no WebGL, or a lost context  -> the rendered poster
     - the loop runs only while the hero is on screen and the tab is visible
     - device pixel ratio and canvas size are capped
     - the placeholder in the hero owns the layout; this file never shifts it
   ========================================================================== */

(function () {
  'use strict';

  var root = document.documentElement;
  var wrap = document.querySelector('.hero-core');          /* placeholder in the hero grid */
  var inner = document.querySelector('.hero-core-inner');   /* moved into .fx-field by motion.js */
  if (!wrap || !inner) return;

  function fallback() {
    root.classList.add('core-static');
    if (inner.querySelector('.hero-core-poster')) return;
    var img = new Image();
    img.className = 'hero-core-poster';
    img.alt = '';
    img.decoding = 'async';
    img.width = 640; img.height = 640;
    img.src = '/img/fx/core.webp';
    inner.appendChild(img);
  }

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { fallback(); return; }

  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var canvas = document.createElement('canvas');
  canvas.className = 'hero-core-gl';
  var glOpts = { alpha: false, antialias: true, depth: false, stencil: false,
                 preserveDrawingBuffer: false, powerPreference: 'default' };
  var gl = null;
  try { gl = canvas.getContext('webgl', glOpts) || canvas.getContext('experimental-webgl', glOpts); }
  catch (e) { gl = null; }
  if (!gl) { fallback(); return; }

  /* ----------------------------------------------------------------------
     Pillars — colour per orbit; counts and names come from the page
     -------------------------------------------------------------------- */

  var PILLARS = [
    { hex: '#22D3EE', rgb: [0.133, 0.827, 0.933] },   /* cyan    */
    { hex: '#60A5FA', rgb: [0.376, 0.647, 0.980] },   /* blue    */
    { hex: '#A78BFA', rgb: [0.655, 0.545, 0.980] },   /* violet  */
    { hex: '#34D399', rgb: [0.204, 0.827, 0.600] }    /* emerald */
  ];
  var statItems = document.querySelectorAll('.hero-stats-strip .stat-item');
  var labelsOk = statItems.length >= 4;
  for (var pi = 0; pi < 4; pi++) {
    var item = statItems[pi];
    var valEl = item && item.querySelector('[data-count]');
    var lblEl = item && item.querySelector('.stat-lbl');
    var n = valEl ? parseInt(valEl.getAttribute('data-count'), 10) : 0;
    PILLARS[pi].count = n > 0 ? Math.min(n, 120) : 24;
    PILLARS[pi].shown = n > 0 ? String(n) : '';
    PILLARS[pi].name = lblEl ? lblEl.textContent.trim() : '';
    if (!(n > 0) || !PILLARS[pi].name) labelsOk = false;
  }

  /* ----------------------------------------------------------------------
     GL program — one shader, two modes (points / lines), additive
     -------------------------------------------------------------------- */

  var VS =
    'attribute vec2 aPos; attribute float aSize; attribute vec4 aCol;' +
    'varying vec4 vCol;' +
    'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); gl_PointSize = aSize; vCol = aCol; }';
  var FS =
    'precision mediump float; varying vec4 vCol; uniform float uMode;' +
    'void main(){' +
    '  if (uMode > 0.5) { gl_FragColor = vec4(vCol.rgb * vCol.a, 1.0); return; }' +
    '  float d = length(gl_PointCoord - 0.5) * 2.0;' +
    '  if (d > 1.0) discard;' +
    '  float g = pow(1.0 - d, 2.3);' +
    '  float c = smoothstep(0.30, 0.0, d);' +
    '  float a = (g * 0.8 + c) * vCol.a;' +
    '  gl_FragColor = vec4(vCol.rgb * a + vec3(c * vCol.a * 0.4), 1.0);' +
    '}';

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }
  var vs = compile(gl.VERTEX_SHADER, VS), fs = compile(gl.FRAGMENT_SHADER, FS);
  var prog = gl.createProgram();
  if (!vs || !fs) { fallback(); return; }
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { fallback(); return; }
  gl.useProgram(prog);

  var aPos = gl.getAttribLocation(prog, 'aPos');
  var aSize = gl.getAttribLocation(prog, 'aSize');
  var aCol = gl.getAttribLocation(prog, 'aCol');
  var uMode = gl.getUniformLocation(prog, 'uMode');
  var STRIDE = 7, BYTES = 4;
  var MAXP = 9500, MAXL = 9000;
  var P = new Float32Array(MAXP * STRIDE), pn = 0;
  var L = new Float32Array(MAXL * STRIDE), ln = 0;
  var bufP = gl.createBuffer(), bufL = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bufP); gl.bufferData(gl.ARRAY_BUFFER, P.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufL); gl.bufferData(gl.ARRAY_BUFFER, L.byteLength, gl.DYNAMIC_DRAW);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.clearColor(0, 0, 0, 1);
  var maxPoint = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) || [1, 64])[1];

  function bindLayout() {
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aSize); gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, STRIDE * BYTES, 0);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, STRIDE * BYTES, 2 * BYTES);
    gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, STRIDE * BYTES, 3 * BYTES);
  }

  /* ----------------------------------------------------------------------
     Geometry, built once
     -------------------------------------------------------------------- */

  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  function mul(a, b) {
    return [
      a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
      a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
      a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8]
    ];
  }

  /* Deterministic, so the object is the same object on every visit. */
  var rs = 1337;
  function rnd() { rs = (rs * 1664525 + 1013904223) | 0; return ((rs >>> 8) & 0xFFFFFF) / 0x1000000; }

  function fibSphere(n) {
    var out = new Float32Array(n * 4), ga = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < n; i++) {
      var y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i;
      out[i*4] = Math.cos(th) * r; out[i*4+1] = y; out[i*4+2] = Math.sin(th) * r; out[i*4+3] = rnd();
    }
    return out;
  }

  var NUC_N = fine ? 1300 : 800;
  var nucleus = fibSphere(NUC_N);
  var SHELL_N = 240;
  var shell = fibSphere(SHELL_N);

  /* A lat/long cage around the nucleus, as line segments in object space. */
  var cage = [];
  (function () {
    var R = 0.52, SEG = 56, i, j, a, b;
    for (i = 0; i < 6; i++) {                                   /* meridians */
      var m = rotY(i / 6 * Math.PI);
      for (j = 0; j < SEG; j++) {
        a = j / SEG * Math.PI * 2; b = (j + 1) / SEG * Math.PI * 2;
        var x1 = Math.cos(a) * R, y1 = Math.sin(a) * R, x2 = Math.cos(b) * R, y2 = Math.sin(b) * R;
        cage.push(m[0]*x1, y1, m[6]*x1, m[0]*x2, y2, m[6]*x2);
      }
    }
    for (i = 1; i < 6; i++) {                                   /* parallels */
      var lat = (i / 6 - 0.5) * Math.PI, rr = Math.cos(lat) * R, yy = Math.sin(lat) * R;
      for (j = 0; j < SEG; j++) {
        a = j / SEG * Math.PI * 2; b = (j + 1) / SEG * Math.PI * 2;
        cage.push(Math.cos(a) * rr, yy, Math.sin(a) * rr, Math.cos(b) * rr, yy, Math.sin(b) * rr);
      }
    }
  })();

  var RING_R = [0.74, 0.86, 0.98, 1.10];
  var RING_W = [0.55, -0.42, 0.34, -0.62];                      /* rad/s, alternating */
  var RING_M = [
    mul(rotZ(0.00), rotX(1.25)),
    mul(rotZ(1.05), rotX(1.25)),
    mul(rotZ(2.10), rotX(1.25)),
    mul(rotZ(0.40), rotX(0.22))
  ];
  var LOOP_SEG = 120, TRAIL_N = fine ? 80 : 48;
  var rings = [];
  for (var r = 0; r < 4; r++) {
    var cnt = PILLARS[r].count, nodes = new Float32Array(cnt * 2);
    for (var k = 0; k < cnt; k++) {
      nodes[k*2] = (k + (rnd() - 0.5) * 0.5) / cnt * Math.PI * 2;
      nodes[k*2+1] = rnd();
    }
    rings.push({ nodes: nodes, phase: rnd() * 6.28, sx: 0, sy: 0, sz: 0 });
  }

  /* Inflow: particles spiralling down into the core along the equatorial
     orbit's plane — tools arriving at the hub. Each is tinted by a pillar. */
  var INFLOW_N = fine ? 300 : 160;
  var inflow = new Float32Array(INFLOW_N * 4);
  for (var fi = 0; fi < INFLOW_N; fi++) {
    inflow[fi*4] = rnd() * 6.2832;          /* entry angle */
    inflow[fi*4+1] = rnd();                 /* phase through the fall */
    inflow[fi*4+2] = Math.floor(rnd() * 4); /* pillar */
    inflow[fi*4+3] = rnd();                 /* seed */
  }
  var TUBE_N = fine ? 300 : 180;            /* glowing points per orbit path */

  var DUST_N = fine ? 1500 : 800;
  var dust = new Float32Array(DUST_N * 4);
  for (var di = 0; di < DUST_N; di++) {
    var u = rnd() * 2 - 1, th = rnd() * 6.2832, rr2 = Math.sqrt(1 - u * u), rad = 1.28 + Math.pow(rnd(), 1.6) * 0.85;
    dust[di*4] = Math.cos(th) * rr2 * rad; dust[di*4+1] = u * rad * 0.72; dust[di*4+2] = Math.sin(th) * rr2 * rad;
    dust[di*4+3] = rnd();
  }

  /* ----------------------------------------------------------------------
     State
     -------------------------------------------------------------------- */

  var CAM = 3.4;            /* camera distance; z = 0 projects at scale 1 */
  var UNIT = 0.52;          /* object-space 1.0 in clip space (the canvas overscans the box 1.7x) */
  var OVERSCAN = 1.7;
  var dpr = 1, cssSize = 0, hostLeft = 0, labelW = [0, 0, 0, 0];

  var yaw = 0.6, pitch = 0.34, yawV = 0.16, REST_PITCH = 0.34;
  var parX = 0, parY = 0, parXT = 0, parYT = 0;
  var dragging = false, dragMoved = 0, lastX = 0, lastY = 0, lastMoveT = 0;
  var hovering = false, ex = 0;
  var asm = 0, asmStart = -1;
  var warp = 0, burst = 0;
  var waveOn = false, waveR = 0, waveAmp = 0;
  var ringT = 0, t = 0, lastTs = 0;
  var hot = [0, 0, 0, 0], hotStat = [0, 0, 0, 0], hotSat = [0, 0, 0, 0], hotClass = [false, false, false, false];
  var ptrX = -1, ptrY = -1;   /* pointer inside the placeholder, CSS px */
  var nextAuto = 0, touched = false;

  /* per-particle effect outputs */
  var fxA = 1, fxG = 0, fxS = 0;
  function radial(len, seed, gain) {
    var k = asm * 1.7 - seed * 0.7; k = k < 0 ? 0 : (k > 1 ? 1 : k);
    var e = k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
    var f = 1 + (1 - e) * (3 + 5 * seed);
    f *= 1 + warp * (0.5 + seed * 2.2) * gain;
    fxA = e * (1 - warp * 0.72);
    fxG = 0;
    if (waveOn) {
      var d = len - waveR, g = Math.exp(-d * d / 0.02) * waveAmp;
      f *= 1 + g * 0.2; fxG = g;
    }
    var s = warp * gain, a = (1 - e) * 0.9;
    fxS = s > a ? s : a;
    return f;
  }

  var M = null;             /* current rotation, set per group */
  var ox = 0, oy = 0, oz = 0, op = 1;
  function xf(x, y, z) {
    ox = M[0]*x + M[1]*y + M[2]*z; oy = M[3]*x + M[4]*y + M[5]*z; oz = M[6]*x + M[7]*y + M[8]*z;
    op = CAM / (CAM - oz);
  }
  function pt(size, cr, cg, cb, a) {
    if (a <= 0.004 || pn >= MAXP) return;
    var s = size * op * dpr; if (s > maxPoint) s = maxPoint;
    var o = pn * STRIDE;
    P[o] = ox * op * UNIT; P[o+1] = oy * op * UNIT; P[o+2] = s;
    P[o+3] = cr; P[o+4] = cg; P[o+5] = cb; P[o+6] = a > 1 ? 1 : a;
    pn++;
  }
  function lv(x, y, p, cr, cg, cb, a) {
    var o = ln * STRIDE;
    L[o] = x * p * UNIT; L[o+1] = y * p * UNIT; L[o+2] = 1;
    L[o+3] = cr; L[o+4] = cg; L[o+5] = cb; L[o+6] = a;
    ln++;
  }
  function depthA(z) { var d = 0.55 + 0.45 * ((z + 1.3) / 2.6); return d < 0.3 ? 0.3 : (d > 1 ? 1 : d); }

  /* ----------------------------------------------------------------------
     HUD — reticle and orbit labels (decorative, aria-hidden with the core)
     -------------------------------------------------------------------- */

  var reticle = document.createElement('div');
  reticle.className = 'fx-core-reticle';
  reticle.innerHTML =
    '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
      '<circle class="rt-ticks" cx="50" cy="50" r="48.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="0.35 2.19"/>' +
      '<circle class="rt-arcs"  cx="50" cy="50" r="45.5" fill="none" stroke="currentColor" stroke-width="0.35" stroke-dasharray="52 19.47"/>' +
      '<path class="rt-cross" d="M50 0.5v4 M50 95.5v4 M0.5 50h4 M95.5 50h4" stroke="currentColor" stroke-width="0.5" fill="none"/>' +
    '</svg>';
  inner.appendChild(canvas);
  inner.appendChild(reticle);

  var labels = [];
  if (labelsOk) {
    for (var li = 0; li < 4; li++) {
      var el = document.createElement('span');
      el.className = 'fx-core-label';
      el.style.setProperty('--pc', PILLARS[li].hex);
      var num = document.createElement('b'); num.textContent = PILLARS[li].shown;
      el.appendChild(num);
      el.appendChild(document.createTextNode(PILLARS[li].name));
      inner.appendChild(el);
      labels.push(el);
    }
  }

  var hint = document.createElement('span');
  hint.className = 'hero-core-hint';
  hint.textContent = 'drag to rotate · click to pulse';
  wrap.appendChild(hint);

  /* ----------------------------------------------------------------------
     Input
     -------------------------------------------------------------------- */

  function pulse(dir) {
    waveOn = true; waveR = 0; waveAmp = 1;
    burst = 1;
    yawV += (dir || 1) * 2.4;
  }
  function markTouched() {
    if (touched) return;
    touched = true;
    wrap.classList.add('is-touched');
  }

  wrap.addEventListener('pointerenter', function () { hovering = true; });
  wrap.addEventListener('pointerleave', function () { hovering = false; ptrX = ptrY = -1; });
  wrap.addEventListener('pointerdown', function (e) {
    if (e.button) return;
    dragging = true; dragMoved = 0; lastX = e.clientX; lastY = e.clientY; lastMoveT = performance.now();
    try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
    wrap.classList.add('is-grabbing');
  });
  wrap.addEventListener('pointermove', function (e) {
    var rc = wrap.getBoundingClientRect();
    ptrX = e.clientX - rc.left; ptrY = e.clientY - rc.top;
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY, now = performance.now();
    var dtm = Math.max(8, now - lastMoveT) / 1000;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    yaw += dx * 0.0085; pitch += dy * 0.0065;
    if (pitch > 1.25) pitch = 1.25; if (pitch < -1.25) pitch = -1.25;
    yawV = yawV * 0.5 + (dx * 0.0085 / dtm) * 0.5;
    lastX = e.clientX; lastY = e.clientY; lastMoveT = now;
    if (dragMoved > 6) markTouched();
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    wrap.classList.remove('is-grabbing');
    try { wrap.releasePointerCapture(e.pointerId); } catch (err) {}
    if (dragMoved < 6) { pulse(yawV < 0 ? -1 : 1); markTouched(); }
    if (yawV > 7) yawV = 7; if (yawV < -7) yawV = -7;
  }
  wrap.addEventListener('pointerup', endDrag);
  wrap.addEventListener('pointercancel', endDrag);

  if (fine) {
    window.addEventListener('pointermove', function (e) {
      parXT = (e.clientX / window.innerWidth - 0.5);
      parYT = (e.clientY / window.innerHeight - 0.5);
    }, { passive: true });
  }

  for (var si = 0; si < 4 && si < statItems.length; si++) {
    (function (i) {
      statItems[i].addEventListener('pointerenter', function () { hotStat[i] = 1; });
      statItems[i].addEventListener('pointerleave', function () { hotStat[i] = 0; });
    })(si);
  }

  /* ----------------------------------------------------------------------
     Size
     -------------------------------------------------------------------- */

  function resize() {
    var w = inner.clientWidth;
    if (!w) return;
    cssSize = w;
    dpr = Math.min(window.devicePixelRatio || 1, fine ? 2 : 1.5);
    var px = Math.round(w * OVERSCAN * dpr);
    if (px > 1700) { dpr = dpr * 1700 / px; px = 1700; }
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; gl.viewport(0, 0, px, px); }
    hostLeft = wrap.getBoundingClientRect().left;
    for (var q = 0; q < labels.length; q++) labelW[q] = labels[q].offsetWidth;
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(inner);
  window.addEventListener('resize', resize, { passive: true });

  /* ----------------------------------------------------------------------
     Frame
     -------------------------------------------------------------------- */

  var ION = [0.81, 0.98, 1.0];

  function frame(ts) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!cssSize) { resize(); if (!cssSize) return; }

    var dt = lastTs ? (ts - lastTs) / 1000 : 0.016; lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    t += dt;

    /* assembly: held while the landing sequence brings up the logo and headline */
    if (asmStart < 0) asmStart = ts + (root.classList.contains('is-intro') ? 650 : 60);
    if (asm < 1 && ts >= asmStart) { asm += dt / 1.7; if (asm > 1) asm = 1; }

    /* scroll warp, from the progress motion.js already writes */
    var st = root.style;
    var hp = parseFloat(st.getPropertyValue('--hero')) || 0;
    var fp = parseFloat(st.getPropertyValue('--field')) || 0;
    var sc = hp > fp ? hp : fp;
    burst *= Math.exp(-dt * 2.2);
    var w = Math.pow(sc, 1.4) + burst * 0.2;
    warp = w > 1 ? 1 : w;

    if (waveOn) {
      waveR += dt * 2.3; waveAmp = 1 - waveR / 2.5;
      if (waveAmp <= 0) { waveOn = false; waveAmp = 0; }
    }

    /* keep it alive when nobody is touching it */
    if (!nextAuto) nextAuto = ts + 7000 + Math.random() * 3000;
    if (ts > nextAuto && asm >= 1) {
      if (!dragging && !hovering && sc < 0.15) pulse(Math.random() < 0.5 ? -1 : 1);
      nextAuto = ts + 8000 + Math.random() * 5000;
    }

    ex += ((hovering || dragging ? 1 : 0) - ex) * (1 - Math.exp(-dt * 5));
    parX += (parXT - parX) * (1 - Math.exp(-dt * 3));
    parY += (parYT - parY) * (1 - Math.exp(-dt * 3));

    if (!dragging) {
      yawV += (0.16 + ex * 0.22 - yawV) * (1 - Math.exp(-dt * 1.1));
      yaw += yawV * dt;
      pitch += (REST_PITCH - pitch) * (1 - Math.exp(-dt * 1.4));
    }
    ringT += dt * (1 + ex * 1.4 + burst * 5);

    var R = mul(rotX(pitch + parY * 0.35), rotY(yaw + parX * 0.55));
    pn = 0; ln = 0;
    var i, o, f, x, y, z, a, c1, c2, c3;

    /* --- nucleus ------------------------------------------------------- */
    M = mul(R, rotY(t * 0.35));
    for (i = 0; i < NUC_N; i++) {
      o = i * 4;
      var sd = nucleus[o+3];
      var rn = 0.37 * (1 + 0.05 * Math.sin(t * 2.1 + sd * 31) + ex * 0.08 * Math.sin(t * 7.3 + sd * 53));
      f = radial(rn, sd, 0.6) * rn;
      xf(nucleus[o] * f, nucleus[o+1] * f, nucleus[o+2] * f);
      a = (0.55 + 0.4 * sd + ex * 0.25 + fxG * 1.5) * fxA * depthA(oz * 3);
      pt(3.6 + sd * 2.6 + ex * 1.2, 0.30 + 0.5 * sd, 0.88 + 0.1 * sd, 1.0, a);
    }
    /* the heart: two stacked sprites, and the beat */
    var beat = 0.5 + 0.5 * Math.sin(t * 1.9);
    var ha = asm * (1 - warp * 0.6);
    M = R; xf(0, 0, 0);
    pt(230 + beat * 30 + ex * 40, 0.10, 0.48, 0.70, (0.50 + 0.15 * beat + ex * 0.2) * ha);
    pt(120 + beat * 16 + ex * 20, 0.16, 0.66, 0.84, (0.60 + 0.15 * beat + ex * 0.2) * ha);
    pt(58 + beat * 8, ION[0], ION[1], ION[2], 1.0 * ha);

    /* --- data shell + cage, counter-rotating --------------------------- */
    M = mul(R, mul(rotY(-t * 0.22), rotX(0.4)));
    for (i = 0; i < SHELL_N; i++) {
      o = i * 4; sd = shell[o+3];
      f = radial(0.62, sd, 0.8) * 0.62;
      xf(shell[o] * f, shell[o+1] * f, shell[o+2] * f);
      var tw = Math.sin(t * 1.5 + sd * 40); tw = tw > 0 ? tw * tw * tw * tw : 0;
      pt(4.0 + tw * 4.0, 0.38, 0.74, 0.98, (0.18 + 0.9 * tw + fxG) * fxA * depthA(oz * 2));
    }
    f = radial(0.52, 0.5, 0.7);
    var ca = (0.20 + ex * 0.14 + fxG * 0.6) * fxA;
    for (i = 0; i + 5 < cage.length && ln + 2 <= MAXL; i += 6) {
      xf(cage[i] * f, cage[i+1] * f, cage[i+2] * f); var x1 = ox, y1 = oy, p1 = op, z1 = oz;
      xf(cage[i+3] * f, cage[i+4] * f, cage[i+5] * f);
      lv(x1, y1, p1, 0.13, 0.83, 0.93, ca * depthA(z1 * 2));
      lv(ox, oy, op, 0.13, 0.83, 0.93, ca * depthA(oz * 2));
    }

    /* --- the four orbits ------------------------------------------------ */
    var hmax = Math.max(hot[0], hot[1], hot[2], hot[3]);
    for (var rI = 0; rI < 4; rI++) {
      var ring = rings[rI], RM = RING_M[rI], RR = RING_R[rI], col = PILLARS[rI].rgb;
      hot[rI] += (Math.max(hotStat[rI], hotSat[rI]) - hot[rI]) * (1 - Math.exp(-dt * 7));
      var bright = (1 + 1.5 * hot[rI]) * (1 - 0.55 * (hmax - hot[rI]));
      var ph = ring.phase + RING_W[rI] * ringT;
      c1 = col[0]; c2 = col[1]; c3 = col[2];
      M = R;

      /* orbit path */
      f = radial(RR, 0.35, 0.9) * RR;
      var la = 0.34 * bright * fxA;
      for (i = 0; i < LOOP_SEG && ln + 2 <= MAXL; i++) {
        var a1 = i / LOOP_SEG * 6.2832, a2 = (i + 1) / LOOP_SEG * 6.2832;
        x = Math.cos(a1) * f; y = Math.sin(a1) * f;
        xf(RM[0]*x + RM[1]*y, RM[3]*x + RM[4]*y, RM[6]*x + RM[7]*y);
        var lx = ox, ly = oy, lp = op, lz = oz;
        x = Math.cos(a2) * f; y = Math.sin(a2) * f;
        xf(RM[0]*x + RM[1]*y, RM[3]*x + RM[4]*y, RM[6]*x + RM[7]*y);
        lv(lx, ly, lp, c1, c2, c3, la * depthA(lz));
        lv(ox, oy, op, c1, c2, c3, la * depthA(oz));
      }

      /* the path again as a run of soft points: a hairline has no width, so
         this is what gives the orbit its neon-tube body. A brighter arc
         travels round it, ahead of the lead satellite. */
      for (i = 0; i < TUBE_N; i++) {
        var tu = i / TUBE_N * 6.2832;
        x = Math.cos(tu) * f; y = Math.sin(tu) * f;
        xf(RM[0]*x + RM[1]*y, RM[3]*x + RM[4]*y, RM[6]*x + RM[7]*y);
        var arc = Math.cos(tu - ph - 0.6 * (RING_W[rI] < 0 ? -1 : 1));
        arc = arc > 0 ? arc * arc * arc * arc : 0;
        pt(3.8 + arc * 4.0 + hot[rI] * 1.5, c1, c2, c3, (0.30 + 0.55 * arc) * bright * fxA * depthA(oz));
      }

      /* one node per tool in the pillar */
      var nd = ring.nodes, cntN = nd.length / 2;
      for (i = 0; i < cntN; i++) {
        sd = nd[i*2+1];
        var an = nd[i*2] + ph;
        f = radial(RR, sd, 1.0) * RR * (1 + 0.012 * Math.sin(t * 1.3 + sd * 20));
        x = Math.cos(an) * f; y = Math.sin(an) * f;
        var wx = RM[0]*x + RM[1]*y, wy = RM[3]*x + RM[4]*y, wz = RM[6]*x + RM[7]*y;
        xf(wx, wy, wz);
        a = (1.0 + fxG * 1.2) * bright * fxA * depthA(oz);
        pt(6.0 + hot[rI] * 2.6 + fxG * 4, c1 * 0.8 + 0.2, c2 * 0.8 + 0.2, c3 * 0.8 + 0.2, a);
        if (fxS > 0.02 && ln + 2 <= MAXL) {
          var px1 = ox, py1 = oy, pp1 = op, k2 = 1 + fxS * 0.4;
          xf(wx * k2, wy * k2, wz * k2);
          lv(px1, py1, pp1, c1, c2, c3, a * 0.7);
          lv(ox, oy, op, c1, c2, c3, 0);
        }
      }

      /* lead satellite, its comet tail, and the spoke back to the core */
      var dir = RING_W[rI] < 0 ? 1 : -1;
      f = radial(RR, 0.2, 0.9) * RR;
      for (i = TRAIL_N; i >= 0; i--) {
        var ta = ph + dir * i * 0.013, fall = 1 - i / TRAIL_N;
        x = Math.cos(ta) * f; y = Math.sin(ta) * f;
        xf(RM[0]*x + RM[1]*y, RM[3]*x + RM[4]*y, RM[6]*x + RM[7]*y);
        if (i === 0) {
          ring.sx = ox * op * UNIT; ring.sy = oy * op * UNIT; ring.sz = oz;
          pt(64 + hot[rI] * 24, c1, c2, c3, 0.42 * bright * fxA);
          pt(20 + hot[rI] * 6, c1 * 0.4 + 0.6, c2 * 0.4 + 0.6, c3 * 0.4 + 0.6, 1.0 * fxA * bright);
          if (ln + 2 <= MAXL) {
            lv(0, 0, 1, c1, c2, c3, 0.02 * fxA);
            lv(ox, oy, op, c1, c2, c3, 0.55 * bright * fxA);
          }
          var fr = (t * 0.55 + rI * 0.27) % 1, sx0 = ox, sy0 = oy, sz0 = oz;
          ox = sx0 * fr; oy = sy0 * fr; oz = sz0 * fr; op = CAM / (CAM - oz);
          pt(10, 1, 1, 1, 0.9 * fxA * bright * Math.sin(fr * Math.PI));
        } else {
          pt(1.6 + 6.5 * fall, c1, c2, c3, 0.8 * fall * fall * bright * fxA * depthA(oz));
        }
      }
    }

    /* --- inflow: spiralling down into the core -------------------------- */
    M = R;
    var IM = RING_M[3];
    for (i = 0; i < INFLOW_N; i++) {
      o = i * 4; sd = inflow[o+3];
      var life = (inflow[o+1] + t * (0.10 + sd * 0.08) * (1 + ex * 1.2 + burst * 4)) % 1;
      var ir = 1.30 - life * life * 0.98;                     /* accelerates inward */
      var ia = inflow[o] + (1.30 - ir) * 5.5 + t * 0.12;      /* winds tighter as it falls */
      f = radial(ir, sd, 1.2) * ir;
      x = Math.cos(ia) * f; y = Math.sin(ia) * f;
      xf(IM[0]*x + IM[1]*y, IM[3]*x + IM[4]*y + (sd - 0.5) * 0.05, IM[6]*x + IM[7]*y);
      var pc = PILLARS[inflow[o+2]].rgb, heat = life * life;
      var ia2 = Math.sin(life * Math.PI); ia2 = ia2 * (0.35 + 0.65 * life);
      pt(2.6 + heat * 4.5, pc[0] + (1 - pc[0]) * heat, pc[1] + (1 - pc[1]) * heat, pc[2] + (1 - pc[2]) * heat,
         0.85 * ia2 * fxA * depthA(oz));
    }

    /* --- dust, streaking when the object is arriving or warping -------- */
    M = mul(R, rotY(-t * 0.05));
    for (i = 0; i < DUST_N; i++) {
      o = i * 4; sd = dust[o+3];
      x = dust[o]; y = dust[o+1]; z = dust[o+2];
      f = radial(Math.sqrt(x*x + y*y + z*z), sd, 1.6);
      xf(x * f, y * f, z * f);
      var v = sd * sd;
      c1 = 0.13 + 0.52 * v; c2 = 0.83 - 0.28 * v; c3 = 0.93 + 0.05 * v;
      a = (0.24 + 0.42 * sd + fxG * 0.8) * fxA * depthA(oz * 0.7);
      pt(2.2 + sd * 2.6, c1, c2, c3, a);
      if (fxS > 0.02 && ln + 2 <= MAXL) {
        var qx = ox, qy = oy, qp = op, k3 = 1 + fxS * 0.55;
        xf(x * f * k3, y * f * k3, z * f * k3);
        lv(qx, qy, qp, c1, c2, c3, a * 1.4);
        lv(ox, oy, op, c1, c2, c3, 0);
      }
    }

    /* --- shockwave front, camera-facing -------------------------------- */
    if (waveOn) {
      var wa = waveAmp * 0.9;
      for (i = 0; i < 96 && ln + 2 <= MAXL; i++) {
        var b1 = i / 96 * 6.2832, b2 = (i + 1) / 96 * 6.2832;
        lv(Math.cos(b1) * waveR, Math.sin(b1) * waveR, 1, ION[0], ION[1], ION[2], wa);
        lv(Math.cos(b2) * waveR, Math.sin(b2) * waveR, 1, ION[0], ION[1], ION[2], wa);
      }
    }

    /* --- draw ----------------------------------------------------------- */
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufL);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, L.subarray(0, ln * STRIDE));
    bindLayout(); gl.uniform1f(uMode, 1); gl.drawArrays(gl.LINES, 0, ln);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufP);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, P.subarray(0, pn * STRIDE));
    bindLayout(); gl.uniform1f(uMode, 0); gl.drawArrays(gl.POINTS, 0, pn);

    /* --- labels and the satellite <-> stat link ------------------------- */
    var half = cssSize / 2, span = cssSize * OVERSCAN / 2;
    var showL = asm >= 1 && warp < 0.25;
    for (i = 0; i < 4; i++) {
      var lxp = half + rings[i].sx * span, lyp = half - rings[i].sy * span;
      if (labels[i]) {
        var front = depthA(rings[i].sz);
        var lxl = lxp + 14, maxX = root.clientWidth - hostLeft - labelW[i] - 14;
        if (lxl > maxX) lxl = maxX;
        labels[i].style.transform = 'translate3d(' + lxl.toFixed(1) + 'px,' + (lyp - 9).toFixed(1) + 'px,0)';
        labels[i].style.opacity = showL ? ((0.25 + 0.75 * (front - 0.3) / 0.7) * (0.55 + 0.45 * hot[i]) * (1 - 0.6 * (hmax - hot[i]))).toFixed(3) : '0';
      }
      var near = 0;
      if (ptrX >= 0 && !dragging) {
        var ddx = ptrX - lxp, ddy = ptrY - lyp;
        if (ddx * ddx + ddy * ddy < 46 * 46) near = 1;
      }
      hotSat[i] = near;
      var on = hot[i] > 0.5;
      if (on !== hotClass[i] && statItems[i]) { hotClass[i] = on; statItems[i].classList.toggle('is-hot', on); }
    }
  }

  /* ----------------------------------------------------------------------
     Lifecycle — run only while on screen and visible
     -------------------------------------------------------------------- */

  var running = false, raf = 0, onScreen = true;
  function sync() {
    var want = onScreen && !document.hidden;
    if (want && !running) { running = true; lastTs = 0; raf = requestAnimationFrame(frame); }
    else if (!want && running) { running = false; cancelAnimationFrame(raf); }
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { onScreen = entries[0].isIntersecting; sync(); },
      { threshold: 0.01 }).observe(wrap);
  }
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault(); running = false; cancelAnimationFrame(raf);
    canvas.style.display = 'none'; fallback();
  });

  root.classList.add('core-live');
  resize();
  sync();
})();
