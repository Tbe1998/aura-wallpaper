/* ============================================================================
   NEXUS 监控台 —— 数据层
   真实采样 → 归一化 → 通道速度映射 → 过载状态机 → 设置持久化
   ============================================================================ */
(function () {
  'use strict';

  const THEMES = {
    silver: { hex: '#D2DCE5', name: '冷白银' },
    gold: { hex: '#CBB68A', name: '香槟金' },
    blue: { hex: '#43A9CF', name: '深海蓝' },
    violet: { hex: '#AFA2D9', name: '星云紫' }
  };

  const CH = [
    { key: 'cpu', name: '处理器', idx: '01', unit: '%', net: false },
    { key: 'mem', name: '内存', idx: '02', unit: '%', net: false },
    { key: 'gpu', name: '显卡', idx: '03', unit: '%', net: false },
    { key: 'down', name: '下载', idx: '04', unit: 'KiB/s', net: true },
    { key: 'up', name: '上传', idx: '05', unit: 'KiB/s', net: true }
  ];

  const ENGINES = [
    { key: 'ring', name: '环状流场', sub: 'RING FLOW FIELD', theme: null,
      kicker: 'NEURAL COMPUTE CORE', title: 'NX<span>·01</span>',
      meta2: '异步计算阵列 · 本地采样' },
    { key: 'bh', name: '黑洞引擎', sub: 'SINGULARITY DRIVE', theme: 'violet',
      kicker: 'ACCRETION COMPUTE CORE', title: 'BH<span>·02</span>',
      meta2: '引力透镜 · 吸积盘并行' },
    { key: 'fusion', name: '聚变引擎', sub: 'FUSION CORE', theme: 'gold',
      kicker: 'STELLAR FUSION CORE', title: 'FS<span>·03</span>',
      meta2: '黑体辐射 · 空间折射流' },
    { key: 'three', name: '三体引擎', sub: 'THREE-BODY FIELD', theme: 'silver',
      kicker: 'GRAVITY TRIAD', title: 'TB<span>·04</span>',
      meta2: '软化引力 · 弹射分发' },
    { key: 'infer', name: '推理引擎', sub: 'INFERENCE FABRIC', theme: 'blue',
      kicker: 'SIX-LAYER INFERENCE', title: 'IF<span>·05</span>',
      meta2: '6 层 62 节点 · 异步并行' }
  ];

  const DEFAULTS = {
    scale: 1.0,
    parts: 900,
    glow: 0.85,
    beat: 1.0,
    light: true,
    over: true,
    mouse: true,
    autoFocus: false
  };

  const DEFAULTS_TH = { cpu: 45, mem: 60, gpu: 50, down: 512, up: 128 };

  const LS = {
    get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (_) { return fb; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { } }
  };

  const S = {
    mode: LS.get('nx.mode', 'ring'),
    theme: LS.get('nx.theme', 'silver'),
    turbo: false,
    settings: Object.assign({}, DEFAULTS, LS.get('nx.settings', {})),
    th: Object.assign({}, DEFAULTS_TH, LS.get('nx.th', {})),
    sample: null,
    seq: 0,
    online: false,
    stale: false,
    lastAt: 0,
    startedAt: Date.now(),
    chan: CH.map(() => ({ v: null, speed: 0.05, target: 0.05, over: false, overSince: 0, previewUntil: 0, hist: [] })),
    focus: -1,
    mock: new URLSearchParams(location.search).get('mock') === '1'
  };

  const listeners = { sample: [], ui: [] };
  function on(evt, fn) { (listeners[evt] || (listeners[evt] = [])).push(fn); }
  function emit(evt, arg) { (listeners[evt] || []).forEach(fn => { try { fn(arg); } catch (e) { console.error(e); } }); }

  /* ------------------------------------------------------------ 速度映射 */
  // 百分比：0.035 + u^1.15 * 1.35；网络：对数压缩，避免低速看不见、高速失控
  function mapSpeed(ch, v) {
    if (v == null || isNaN(v)) return 0.05;
    if (ch.net) {
      const bytes = Math.max(0, v) * 1024;
      const n = Math.log(1 + bytes / 8192) / Math.log(1 + 10485760 / 8192);
      return 0.025 + Math.max(0, Math.min(1, n)) * 1.65;
    }
    const u = Math.max(0, Math.min(1, v / 100));
    return 0.035 + Math.pow(u, 1.15) * 1.35;
  }

  /* ------------------------------------------------------------ 采样对象 */
  function valueOf(key, s) {
    if (!s) return null;
    try {
      if (key === 'cpu') return s.cpu ? s.cpu.pct : null;
      if (key === 'mem') return s.mem ? s.mem.pct : null;
      if (key === 'gpu') return (s.gpu && s.gpu.available) ? s.gpu.pct : null;
      if (key === 'down') return s.net ? s.net.down : null;
      if (key === 'up') return s.net ? s.net.up : null;
    } catch (_) { }
    return null;
  }

  function apply(sample) {
    if (!sample) return;
    if (sample.seq != null && sample.seq === S.seq) return;   // 同一采样序号只处理一次
    S.seq = sample.seq != null ? sample.seq : S.seq + 1;
    S.sample = sample;
    S.online = true;
    S.stale = false;
    S.lastAt = Date.now();

    CH.forEach((ch, i) => {
      const c = S.chan[i];
      const v = valueOf(ch.key, sample);
      c.v = (v == null || isNaN(v)) ? null : v;
      c.target = mapSpeed(ch, c.v);
      // 平滑：采样每秒更新，不让整条粒子流突然跳速
      c.speed += (c.target - c.speed) * 0.28;

      const inPreview = performance.now() < c.previewUntil;
      c.over = (c.v != null && c.v > S.th[ch.key]) || inPreview;
      c.hist.push(c.v == null ? null : c.v);
      if (c.hist.length > 90) c.hist.shift();
    });

    emit('sample', sample);
  }

  /* ------------------------------------------------------------ 轮询 */
  let pollTimer = 0;

  async function poll() {
    clearTimeout(pollTimer);
    try {
      if (S.mock) {
        apply(mockSample());
        pollTimer = setTimeout(poll, 1000);
        return;
      }
      const ctrl = new AbortController();
      const kill = setTimeout(() => ctrl.abort(), 3500);
      const r = await fetch('/api/sample', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(kill);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      apply(await r.json());
    } catch (e) {
      if (!S.mock) {
        S.stale = S.online;
        S.online = false;
        emit('ui');
      }
    }
    pollTimer = setTimeout(poll, 1000);
  }

  /* ------------------------------------------------------------ 测试用假数据 */
  // 只在 URL 带 ?mock=1 时使用，绝不进入正常监控界面
  let mockT = 0;
  function mockSample() {
    mockT += 1;
    const w = (a, b, p) => a + (Math.sin(mockT * p) * 0.5 + 0.5) * (b - a);
    return {
      seq: mockT, ts: Date.now(),
      cpu: { pct: w(22, 78, 0.31), cores: new Array(16).fill(0).map((_, i) => w(8, 92, 0.4 + i * 0.05)),
        procs: [{ name: 'chrome', pid: 4211, cpu: w(3, 22, 1.1), ws: 8.2e8, threads: 42 },
                { name: 'Code', pid: 6102, cpu: w(1, 14, .7), ws: 6.1e8, threads: 31 }] },
      mem: { total: 34359738368, used: 2.2e10, avail: 1.2e10, pct: w(48, 82, .21),
        procs: [{ name: 'chrome', pid: 4211, ws: 8.2e8 }, { name: 'Code', pid: 6102, ws: 6.1e8 }] },
      gpu: { pct: w(10, 88, .17), available: true, engines: [{ name: '3D', util: w(5, 80, .17) }, { name: 'Copy', util: w(0, 24, .9) }] },
      net: { down: w(20, 2400, .23), up: w(4, 380, .41), downPkts: w(10, 400, .3), upPkts: w(2, 120, .5), iface: '以太网' },
      sys: { procCount: 240, threadCount: 3100, ctx: w(20000, 90000, .3), cores: 16, host: 'TEST-PC' },
      os: 'Windows 11'
    };
  }

  /* ------------------------------------------------------------ 设置 */
  function setSetting(k, v) {
    S.settings[k] = v;
    LS.set('nx.settings', S.settings);
    emit('ui');
  }
  function setThreshold(k, v) {
    S.th[k] = v;
    LS.set('nx.th', S.th);
    emit('ui');
  }
  function setMode(key) {
    const e = ENGINES.find(x => x.key === key) || ENGINES[0];
    S.mode = e.key;
    if (e.theme) S.theme = e.theme;
    LS.set('nx.mode', S.mode);
    LS.set('nx.theme', S.theme);
    emit('ui');
  }
  function setTheme(key) {
    if (!THEMES[key]) return;
    S.theme = key;
    LS.set('nx.theme', S.theme);
    emit('ui');
  }
  function preview(key) {
    const i = CH.findIndex(c => c.key === key);
    if (i < 0) return;
    S.chan[i].previewUntil = performance.now() + 2000;
    emit('ui');
  }
  function resetAll() {
    S.settings = Object.assign({}, DEFAULTS);
    S.th = Object.assign({}, DEFAULTS_TH);
    LS.set('nx.settings', S.settings);
    LS.set('nx.th', S.th);
    emit('ui');
  }

  function accentHex() { return (THEMES[S.theme] || THEMES.silver).hex; }

  window.NX = {
    THEMES, CH, ENGINES, S, on, emit, apply, setSetting, setThreshold, setMode, setTheme,
    preview, resetAll, accentHex, DEFAULTS, DEFAULTS_TH,
    start() { poll(); },
    get engine() { return ENGINES.find(e => e.key === S.mode) || ENGINES[0]; }
  };
})();
