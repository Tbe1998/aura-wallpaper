/* ============================================================================
   AURA · 桌面动态背景 —— 渲染引擎
   · WebGL2 全屏着色器，纯程序化，无外部依赖
   · 场景交叉淡入淡出、帧率上限、分辨率倍率、负载平滑
   · 对外接口：window.AURA.setConfig({...}) 或宿主 postMessage
   ============================================================================ */
(function () {
  'use strict';

  const canvas = document.getElementById('c');
  const fadeEl = document.getElementById('fade');
  const errEl  = document.getElementById('err');

  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false,
    powerPreference: 'high-performance'
  });
  if (!gl) { errEl.style.display = 'block'; return; }

  const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const THEMES = {
    silver: '#D2DCE5',
    gold:   '#CBB68A',
    blue:   '#43A9CF',
    violet: '#AFA2D9'
  };

  const cfg = {
    scene: 'nebula',
    accent: 'silver',
    intensity: 1.0,
    fps: 30,
    scale: 1.0,
    loadFollow: true,
    paused: false
  };

  const S = {
    prog: new Map(),
    cur: null,
    curProg: null,
    time: 0,
    load: 0,
    loadTarget: 0,
    lastTs: 0,
    lastDraw: 0,
    raf: 0,
    switching: false
  };

  /* ---------------------------------------------------------------- GL 基础 */
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  3, -1, -1,  3
  ]), gl.STATIC_DRAW);

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      console.error('[AURA] shader error:', log);
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function build(sceneDef) {
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, sceneDef.frag);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('[AURA] link error:', gl.getProgramInfoLog(p));
      return null;
    }
    const loc = {
      aPos:    gl.getAttribLocation(p, 'aPos'),
      uRes:    gl.getUniformLocation(p, 'uRes'),
      uTime:   gl.getUniformLocation(p, 'uTime'),
      uAccent: gl.getUniformLocation(p, 'uAccent'),
      uLoad:   gl.getUniformLocation(p, 'uLoad'),
      uIntensity: gl.getUniformLocation(p, 'uIntensity')
    };
    return { p, loc };
  }

  function getProgram(id) {
    if (S.prog.has(id)) return S.prog.get(id);
    const def = window.AURA_SCENES.find(s => s.id === id);
    if (!def) return null;
    const built = build(def);
    if (built) S.prog.set(id, built);
    return built;
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255
    ];
  }

  /* ---------------------------------------------------------------- 尺寸 */
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * (cfg.scale || 1);
    const w = Math.max(2, Math.round(window.innerWidth * dpr));
    const h = Math.max(2, Math.round(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }
  window.addEventListener('resize', resize);

  /* ---------------------------------------------------------------- 绘制 */
  function draw(now) {
    S.raf = requestAnimationFrame(draw);
    if (cfg.paused) return;

    const cap = Math.max(10, Math.min(120, cfg.fps || 30));
    if (now - S.lastDraw < (1000 / cap) - 1.5) return;
    const dt = S.lastDraw ? Math.min(0.1, (now - S.lastDraw) / 1000) : 0.016;
    S.lastDraw = now;
    S.time += dt;

    if (!S.curProg) return;
    S.load += (S.loadTarget - S.load) * Math.min(1, dt * 1.6);

    const r = hexToRgb(THEMES[cfg.accent] || THEMES.silver);
    const { p, loc } = S.curProg;
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(loc.uRes, canvas.width, canvas.height);
    gl.uniform1f(loc.uTime, S.time);
    gl.uniform3f(loc.uAccent, r[0], r[1], r[2]);
    gl.uniform1f(loc.uLoad, cfg.loadFollow ? S.load : 0.0);
    gl.uniform1f(loc.uIntensity, cfg.intensity);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ---------------------------------------------------------------- 场景切换 */
  function applyScene(id, instant) {
    if (!window.AURA_SCENES.some(s => s.id === id)) return;
    const prog = getProgram(id);
    if (!prog) return;
    if (S.cur === id && S.curProg) return;

    const commit = () => {
      S.cur = id;
      S.curProg = prog;
      S.switching = false;
      resize();
      fadeEl.classList.remove('on');
    };

    if (instant || !S.curProg) {
      S.cur = null;
      commit();
      return;
    }
    if (S.switching) { commit(); return; }
    S.switching = true;
    fadeEl.classList.add('on');
    setTimeout(commit, 430);
  }

  /* ---------------------------------------------------------------- 配置入口 */
  function setConfig(patch) {
    if (!patch || typeof patch !== 'object') return;
    if (patch.scene && patch.scene !== cfg.scene) {
      cfg.scene = patch.scene;
      applyScene(patch.scene, false);
    }
    if (patch.accent && THEMES[patch.accent]) cfg.accent = patch.accent;
    if (typeof patch.intensity === 'number') cfg.intensity = Math.max(0.4, Math.min(1.6, patch.intensity));
    if (typeof patch.fps === 'number') cfg.fps = patch.fps;
    if (typeof patch.scale === 'number') { cfg.scale = Math.max(0.5, Math.min(2, patch.scale)); resize(); }
    if (typeof patch.loadFollow === 'boolean') cfg.loadFollow = patch.loadFollow;
    if (typeof patch.paused === 'boolean') cfg.paused = patch.paused;
    if (typeof patch.load === 'number') S.loadTarget = Math.max(0, Math.min(1, patch.load));
    if (typeof patch.accentHex === 'string') THEMES.__custom = patch.accentHex;
  }

  /* ------------------------------------------------- 宿主的消息通道（WebView2） */
  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener('message', (e) => {
      let m = e.data;
      if (typeof m === 'string') { try { m = JSON.parse(m); } catch (_) { return; } }
      if (!m) return;
      if (m.type === 'config') setConfig(m.value);
      else if (m.type === 'ping') window.chrome.webview.postMessage({ type: 'pong', t: Date.now() });
    });
  }

  // 测试/预览用 URL 参数：?scene=fluid&accent=gold&intensity=1&fps=60&load=0.3
  const qs = new URLSearchParams(location.search);
  if (qs.get('scene'))        cfg.scene = qs.get('scene');
  if (qs.get('accent'))       cfg.accent = qs.get('accent');
  if (qs.get('intensity'))    cfg.intensity = parseFloat(qs.get('intensity')) || 1;
  if (qs.get('fps'))          cfg.fps = parseInt(qs.get('fps'), 10) || 60;
  if (qs.get('load'))         S.loadTarget = parseFloat(qs.get('load')) || 0;
  if (qs.get('scale'))        cfg.scale = parseFloat(qs.get('scale')) || 1;
  if (qs.get('paused') === '1') cfg.paused = true;

  // 运行期停止动画（省电）：窗口不可见时
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(S.raf); S.raf = 0; }
    else if (!S.raf) { S.lastDraw = 0; S.raf = requestAnimationFrame(draw); }
  });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    S.prog.clear(); S.curProg = null; S.cur = null;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    applyScene(cfg.scene, true);
  });

  /* ---------------------------------------------------------------- 启动 */
  resize();
  applyScene(cfg.scene, true);
  requestAnimationFrame(draw);

  window.AURA = {
    cfg, setConfig,
    scenes: window.AURA_SCENES.map(s => ({ id: s.id, name: s.name })),
    get state() { return { scene: S.cur, time: S.time, load: S.load, w: canvas.width, h: canvas.height }; }
  };
})();
