/* ============================================================================
   NEXUS 监控台 —— 六个真实活动看板
   每个看板一种视觉逻辑，全部由真实采样驱动
   ============================================================================ */
(function () {
  'use strict';

  const boards = {};
  document.querySelectorAll('.board').forEach(el => {
    boards[el.dataset.board] = {
      el,
      canvas: el.querySelector('canvas'),
      det: el.querySelector('.det'),
      ctx: el.querySelector('canvas').getContext('2d'),
      w: 0, h: 0, t: 0
    };
  });

  function fit(b) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const r = b.canvas.getBoundingClientRect();
    const w = Math.max(40, r.width), h = Math.max(20, r.height);
    if (b.w !== w || b.h !== h) {
      b.w = w; b.h = h;
      b.canvas.width = Math.round(w * dpr);
      b.canvas.height = Math.round(h * dpr);
      b.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function rgba(hex, a) {
    const h = hex.replace('#', '');
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
  }

  /* ------------------------------------------------------------ 处理器 */
  const cpuState = { flows: [] };
  function drawCpu(b, s, accent, dt) {
    const c = b.ctx, w = b.w, h = b.h;
    c.clearRect(0, 0, w, h);
    if (!s) return;
    const cores = (s.cpu.cores || []).slice(0, 32);
    const cols = Math.ceil(Math.sqrt(cores.length * 1.8));
    const cellW = w / cols;
    const rows = Math.ceil(cores.length / cols);
    const cellH = (h * 0.62) / rows;

    // 每逻辑核心负载格
    cores.forEach((v, i) => {
      const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
      c.fillStyle = rgba(accent, 0.06 + (v / 100) * 0.5);
      c.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
      if (v > 55) {
        c.fillStyle = rgba(accent, 0.22);
        c.fillRect(x + 1, y + cellH - 3, (cellW - 2) * (v / 100), 2);
      }
    });

    // 顶部进程任务流：沿四条线流向计算单元
    const procs = (s.cpu.procs || []).slice(0, 4);
    const lanes = 4;
    for (let i = 0; i < lanes; i++) {
      const y = h * 0.74 + i * ((h * 0.24) / lanes);
      c.beginPath();
      c.moveTo(0, y); c.lineTo(w, y);
      c.strokeStyle = rgba(accent, 0.06);
      c.lineWidth = 1;
      c.stroke();
    }
    if (cpuState.flows.length < 40) {
      const p = procs[(Math.random() * procs.length) | 0];
      if (p && p.cpu > 0.4) cpuState.flows.push({ y: (Math.random() * lanes) | 0, x: 0, v: 0.15 + p.cpu / 100, n: p.name });
    }
    for (let i = cpuState.flows.length - 1; i >= 0; i--) {
      const f = cpuState.flows[i];
      f.x += dt * f.v;
      if (f.x > 1) { cpuState.flows.splice(i, 1); continue; }
      const y = h * 0.74 + f.y * ((h * 0.24) / lanes);
      c.fillStyle = rgba(accent, 0.5);
      c.fillRect(f.x * w, y - 1, 2.5, 2);
    }
  }

  /* ------------------------------------------------------------ 内存 */
  function drawMem(b, s, accent) {
    const c = b.ctx, w = b.w, h = b.h;
    c.clearRect(0, 0, w, h);
    if (!s) return;
    const pct = s.mem.pct / 100;
    const total = s.mem.total || 1;
    const pages = 96, cols = 16, rows = Math.ceil(pages / cols);
    const cw = (w - 2) / cols, ch = (h - 4) / rows;
    for (let i = 0; i < pages; i++) {
      const filled = i / pages < pct;
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      c.fillStyle = filled ? rgba(accent, 0.16 + (i % 5) * 0.03) : rgba(accent, 0.035);
      c.fillRect(x + 0.5, y + 0.5, cw - 1.2, ch - 1.2);
      if (filled && i % 7 === 0) {
        c.fillStyle = rgba(accent, 0.45);
        c.fillRect(x + 0.5, y + ch - 2, cw - 1.2, 1);
      }
    }
    // 进程工作集占比条（不代表物理内存相加）
    const procs = (s.mem.procs || []).slice(0, 5);
    const maxWs = Math.max(1, ...procs.map(p => p.ws));
    procs.forEach((p, i) => {
      const y = h - 10 + i * 2;
      const len = (p.ws / maxWs) * (w * 0.45);
      c.fillStyle = rgba(accent, 0.25 - i * 0.03);
      c.fillRect(0, y, len, 1.4);
    });
    void total;
  }

  /* ------------------------------------------------------------ 显卡 */
  function drawGpu(b, s, accent, dt) {
    const c = b.ctx, w = b.w, h = b.h;
    c.clearRect(0, 0, w, h);
    if (!s || !s.gpu) return;
    if (!s.gpu.available) {
      c.fillStyle = 'rgba(120,130,142,.5)';
      c.font = '9px monospace';
      c.fillText('GPU 指标不可用', 4, h / 2);
      return;
    }
    const engines = s.gpu.engines || [];
    const list = ['3D', 'Copy', 'VideoDecode', 'Compute'].map(name => {
      const hit = engines.find(e => e.name.toLowerCase().indexOf(name.toLowerCase()) >= 0);
      return { name, util: hit ? hit.util : 0 };
    });
    const n = list.length;
    const gap = 4;
    const cw = (w - gap * (n - 1)) / n;
    list.forEach((e, i) => {
      const x = i * (cw + gap);
      const bh = (h - 14) * Math.min(1, e.util / 100);
      c.strokeStyle = rgba(accent, 0.10);
      c.strokeRect(x + 0.5, 2.5, cw - 1, h - 16);
      c.fillStyle = rgba(accent, e.util > 0 ? 0.16 : 0.03);
      c.fillRect(x + 1, h - 14 - bh, cw - 2, bh);
      // 单元阵列
      const units = 6;
      for (let u = 0; u < units; u++) {
        const on = e.util / 100 > (u + 1) / units * 0.9;
        c.fillStyle = rgba(accent, on ? 0.5 : 0.08);
        c.fillRect(x + 3 + (u % 3) * (cw / 3.4), 5 + Math.floor(u / 3) * 4, cw / 4.2, 2);
      }
      c.fillStyle = 'rgba(140,150,162,.75)';
      c.font = '7.5px monospace';
      c.fillText(e.name.slice(0, 6), x + 2, h - 2);
      void dt;
    });
  }

  /* ------------------------------------------------------------ 网络（下载 / 上传） */
  const netState = { down: [], up: [] };
  function drawNet(b, s, accent, dir, dt) {
    const c = b.ctx, w = b.w, h = b.h;
    c.clearRect(0, 0, w, h);
    if (!s || !s.net) return;
    const v = dir === 'down' ? s.net.down : s.net.up;
    const st = netState[dir];
    const rate = dir === 'down' ? s.net.downPkts : s.net.upPkts;

    // 缓存格
    const cells = 10;
    const cw = w / cells;
    for (let i = 0; i < cells; i++) {
      c.fillStyle = rgba(accent, 0.05);
      c.fillRect(i * cw + 1, h * 0.42, cw - 2, h * 0.34);
    }
    // 满载程度
    const fill = Math.min(1, Math.log(1 + v) / Math.log(1 + 4096));
    for (let i = 0; i < cells * fill; i++) {
      c.fillStyle = rgba(accent, 0.22);
      c.fillRect(i * cw + 1, h * 0.42, cw - 2, h * 0.34);
    }

    // 数据包
    const spawn = Math.min(4, 0.4 + Math.log(1 + (rate || 0)) * 0.35);
    if (Math.random() < spawn) {
      st.push({ x: dir === 'down' ? 1 : 0, y: h * 0.46 + Math.random() * h * 0.26, v: 0.35 + Math.random() * 0.5 });
    }
    for (let i = st.length - 1; i >= 0; i--) {
      const p = st[i];
      p.x += (dir === 'down' ? -1 : 1) * p.v * dt;
      if (p.x < 0 || p.x > 1) { st.splice(i, 1); continue; }
      c.fillStyle = rgba(accent, 0.55);
      c.fillRect(p.x * w, p.y, dir === 'down' ? 3 : 2, 1.4);
    }

    // 汇合指示
    c.strokeStyle = rgba(accent, 0.12);
    c.beginPath();
    c.moveTo(dir === 'down' ? 0 : w, h * 0.20);
    c.lineTo(dir === 'down' ? w : 0, h * 0.20);
    c.stroke();
    c.fillStyle = rgba(accent, 0.35);
    c.font = '7.5px monospace';
    c.fillText(dir === 'down' ? '接收 → 汇合 → 缓存' : '缓存 → 汇合 → 分发', 3, h * 0.13);
  }

  /* ------------------------------------------------------------ 系统采样 */
  const sysState = { hist: [], procs: [] };
  function drawSys(b, s, accent, dt) {
    const c = b.ctx, w = b.w, h = b.h;
    c.clearRect(0, 0, w, h);
    if (!s || !s.sys) return;

    if (sysState.hist.length < 2) sysState.hist = new Array(40).fill(s.sys.ctx || 0);
    sysState.hist.push(s.sys.ctx || 0);
    if (sysState.hist.length > 60) sysState.hist.shift();

    const max = Math.max(1, ...sysState.hist);
    c.beginPath();
    sysState.hist.forEach((v, i) => {
      const x = (i / (sysState.hist.length - 1)) * w;
      const y = h * 0.72 - (v / max) * h * 0.5;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.strokeStyle = rgba(accent, 0.42);
    c.lineWidth = 1;
    c.stroke();

    // 进程启停刻度
    const pcount = s.sys.procCount || 0;
    if (sysState.procs.length === 0) sysState.procs = [{ n: pcount, t: 0 }];
    const lastP = sysState.procs[sysState.procs.length - 1];
    if (lastP.n !== pcount) {
      sysState.procs.push({ n: pcount, t: 1 });
    }
    for (let i = sysState.procs.length - 1; i >= 0; i--) {
      const p = sysState.procs[i];
      if (p.t === 1) p.t = 0; else p.t += dt * 0.6;
      if (p.t > 1) { sysState.procs.splice(i, 1); continue; }
      const x = w * 0.86;
      c.fillStyle = rgba(accent, 0.25 * (1 - p.t));
      c.fillRect(x - (p.n > pcount ? 6 : 0), h * 0.86 + i * 2, 6, 1.2);
    }
    if (sysState.procs.length > 8) sysState.procs.splice(0, sysState.procs.length - 8);

    c.fillStyle = 'rgba(140,150,162,.55)';
    c.font = '7.5px monospace';
    c.fillText('上下文切换 ' + (s.sys.ctx || 0).toLocaleString() + '/s', 3, h * 0.16);
  }

  /* ------------------------------------------------------------ 主循环 */
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    const s = NX.S.sample;
    const accent = NX.accentHex();
    const map = {
      cpu: (b) => drawCpu(b, s, accent, dt),
      mem: (b) => drawMem(b, s, accent),
      gpu: (b) => drawGpu(b, s, accent, dt),
      down: (b) => drawNet(b, s, accent, 'down', dt),
      up: (b) => drawNet(b, s, accent, 'up', dt),
      sys: (b) => drawSys(b, s, accent, dt)
    };
    for (const k in boards) {
      const b = boards[k];
      fit(b);
      if (map[k]) map[k](b);
    }
  }
  requestAnimationFrame(frame);

  window.BOARDS = boards;
})();
