/* ============================================================================
   NEXUS 监控台 —— 主视觉与五种引擎
   左侧巨环 / 神经网络球 + 中部核心 + 五路粒子分发
   全部 Canvas2D 叠加绘制，按真实采样驱动速度与过载
   ============================================================================ */
(function () {
  'use strict';

  const cv = document.getElementById('stage');
  const ctx = cv.getContext('2d', { alpha: true });
  let W = 0, H = 0, DPR = 1;

  const TAU = Math.PI * 2;
  const CH = NX.CH;

  /* ------------------------------------------------------------------ 工具 */
  function rgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgba(hex, a) {
    const c = rgb(hex);
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }
  function mix(c1, c2, t) {
    return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    const r = cv.parentElement.getBoundingClientRect();
    W = Math.max(320, r.width);
    H = Math.max(220, r.height);
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function geo() {
    return { cx: W * 0.27, cy: H * 0.52, R: Math.min(H * 0.50, W * 0.29) };
  }

  /* ------------------------------------------------------------------ 粒子流 */
  const streams = CH.map(() => []);

  function rebuildParticles() {
    const total = NX.S.settings.parts;
    const per = Math.max(20, Math.round(total / 5));
    streams.forEach((arr, i) => {
      arr.length = 0;
      for (let k = 0; k < per; k++) {
        arr.push({
          t: Math.random(),
          jitter: (Math.random() - 0.5) * 2,
          size: 0.6 + Math.random() * 1.2,
          phase: Math.random() * TAU
        });
      }
    });
  }

  // 每路一条通道曲线：从巨环右侧边缘到画布右缘，五路纵向分布
  function channelPath(i) {
    const g = geo();
    // 五路从巨环右半侧的五个扇区出发，各自对应右侧一个接收端，互不交叉
    const ang = (-0.38 + i * 0.19) * Math.PI;
    const x0 = g.cx + Math.cos(ang) * g.R * 0.95;
    const y0 = g.cy + Math.sin(ang) * g.R * 0.95;
    const y1 = g.cy + (i - 2) * (H * 0.150);
    const mx = x0 + (W - x0) * 0.45;
    return { x0, y0, x1: W + 10, y1, mx, my: (y0 + y1) / 2 - (y0 - y1) * 0.08 };
  }

  function pathPoint(p, t) {
    const it = 1 - t;
    return {
      x: it * it * p.x0 + 2 * it * t * p.mx + t * t * p.x1,
      y: it * it * p.y0 + 2 * it * t * p.my + t * t * p.y1
    };
  }

  /* ------------------------------------------------------------------ 巨环 */
  function drawRing(now, accent, cores) {
    const g = geo();
    const beat = NX.S.settings.beat;
    const glow = NX.S.settings.glow;

    // 外环
    ctx.save();
    ctx.translate(g.cx, g.cy);

    // 外圈多层
    for (let layer = 0; layer < 3; layer++) {
      const r = g.R * (1 - layer * 0.055);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.strokeStyle = rgba(accent, 0.10 - layer * 0.025);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 计算刻度
    const ticks = 96;
    for (let i = 0; i < ticks; i++) {
      const a = (i / ticks) * TAU;
      const long = i % 8 === 0;
      const r0 = g.R * (long ? 0.965 : 0.982);
      const r1 = g.R * 1.0;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.strokeStyle = rgba(accent, long ? 0.20 : 0.07);
      ctx.lineWidth = long ? 1 : 0.7;
      ctx.stroke();
    }

    // 五路计算扇区：错峰活跃
    CH.forEach((ch, i) => {
      const c = NX.S.chan[i];
      const base = -Math.PI / 2 + i * (TAU / 5);
      const active = clamp(c.speed / 1.4, 0, 1);
      const sweep = 0.20 + 0.30 * active;
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.0011 * beat + i * 1.7);

      ctx.beginPath();
      ctx.arc(0, 0, g.R * 0.925, base - sweep / 2, base + sweep / 2);
      ctx.strokeStyle = rgba(accent, (0.10 + 0.35 * active) * (0.55 + 0.45 * pulse) * glow);
      ctx.lineWidth = 5 + 8 * active;
      ctx.stroke();

      // 扇区内的寄存格
      const cells = 6;
      for (let k = 0; k < cells; k++) {
        const a = base - sweep / 2 + (k + 0.5) * (sweep / cells);
        const rr = g.R * 0.855;
        const on = ((now * 0.001 * (0.6 + c.speed) + k * 0.31 + i) % 1) > 0.45;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1.6, 0, TAU);
        ctx.fillStyle = rgba(accent, on ? 0.42 : 0.10);
        ctx.fill();
      }

      // 任务提交短脉冲
      const ph = (now * 0.0004 * (0.4 + c.speed * 1.1) + i * 0.23) % 1;
      const a2 = base + (ph - 0.5) * sweep;
      ctx.beginPath();
      ctx.arc(Math.cos(a2) * g.R * 0.99, Math.sin(a2) * g.R * 0.99, 1.4, 0, TAU);
      ctx.fillStyle = rgba(accent, 0.65 * (1 - ph));
      ctx.fill();
    });

    // 内部细密数据环
    for (let k = 0; k < 3; k++) {
      const r = g.R * (0.60 + k * 0.075);
      const off = now * (0.00006 + k * 0.00002) * (k % 2 ? -1 : 1);
      ctx.beginPath();
      for (let s = 0; s <= 36; s++) {
        const a = off + (s / 36) * TAU;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(accent, 0.05 + 0.02 * Math.sin(now * 0.0009 + k));
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    ctx.restore();
  }

  /* ------------------------------------------------------------------ 神经网络球 */
  const sphere = { nodes: [], edges: [], bullets: [], mouse: { x: -1, y: -1, active: false } };

  function buildSphere() {
    sphere.nodes.length = 0;
    const N = 92;
    for (let i = 0; i < N; i++) {
      // 球面均匀分布
      const phi = Math.acos(1 - 2 * (i + 0.5) / N);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      sphere.nodes.push({
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.sin(phi) * Math.sin(theta),
        z: Math.cos(phi),
        flash: Math.random(),
        r: 0.7 + Math.random() * 1.1
      });
    }
    sphere.edges.length = 0;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = sphere.nodes[i], b = sphere.nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (d < 0.62) sphere.edges.push({ a: i, b: j, d });
      }
    }
    // 限制连线数量，保证结构清晰不糊成亮球
    if (sphere.edges.length > 320) sphere.edges.length = 320;
  }

  function drawSphere(now, accent, g) {
    if (!NX.S.settings.light) return;
    const rotY = now * 0.00006;
    const rotX = Math.sin(now * 0.00004) * 0.22;
    const cy = Math.cos(rotY), sy = Math.sin(rotY);
    const cxr = Math.cos(rotX), sxr = Math.sin(rotX);
    const R = g.R * 0.40;
    const glow = NX.S.settings.glow;

    const pts = sphere.nodes.map(n => {
      // 旋转 + 鼠标局部吸引
      let x = n.x * cy - n.z * sy;
      let z = n.x * sy + n.z * cy;
      let y = n.y * cxr - z * sxr;
      z = n.y * sxr + z * cxr;

      const px = g.cx + x * R;
      const py = g.cy + y * R;

      let dx = 0, dy = 0;
      if (sphere.mouse.active) {
        const ddx = sphere.mouse.x - px, ddy = sphere.mouse.y - py;
        const d = Math.hypot(ddx, ddy);
        if (d < 90 && d > 1) {
          const pull = (1 - d / 90) * 9;
          dx = ddx / d * pull;
          dy = ddy / d * pull;
        }
      }
      return { px: px + dx, py: py + dy, z, n };
    });

    // 连线
    for (let e = 0; e < sphere.edges.length; e++) {
      const ed = sphere.edges[e];
      const A = pts[ed.a], B = pts[ed.b];
      const depth = (A.z + B.z) * 0.5;
      if (depth < -0.25) continue;
      const a = clamp((depth + 0.3) * 0.16 + 0.03, 0.02, 0.22) * glow;
      ctx.beginPath();
      ctx.moveTo(A.px, A.py);
      ctx.lineTo(B.px, B.py);
      ctx.strokeStyle = rgba(accent, a);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    // 节点
    for (const p of pts) {
      const depth = (p.z + 1) * 0.5;
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(now * 0.002 + p.n.flash * 20));
      const a = (0.18 + 0.62 * depth) * tw * glow;
      ctx.beginPath();
      ctx.arc(p.px, p.py, p.n.r * (0.7 + depth * 0.7), 0, TAU);
      ctx.fillStyle = rgba(accent, a);
      ctx.fill();
    }

    // 传导脉冲：沿随机连线传播
    if (Math.random() < 0.5 && sphere.edges.length) {
      const ed = sphere.edges[(Math.random() * sphere.edges.length) | 0];
      sphere.bullets.push({ e: ed, t: 0, v: 0.9 + Math.random() * 1.4 });
    }
    if (sphere.bullets.length > 40) sphere.bullets.splice(0, sphere.bullets.length - 40);
    for (let i = sphere.bullets.length - 1; i >= 0; i--) {
      const b = sphere.bullets[i];
      b.t += b.v * 0.016;
      const A = pts[b.e.a], B = pts[b.e.b];
      if (b.t >= 1) { sphere.bullets.splice(i, 1); continue; }
      const x = A.px + (B.px - A.px) * b.t;
      const y = A.py + (B.py - A.py) * b.t;
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, TAU);
      ctx.fillStyle = rgba(accent, 0.85 * (1 - Math.abs(b.t - 0.5) * 1.4));
      ctx.fill();
    }
  }

  /* ------------------------------------------------------------------ 五路粒子流 */
  const arrivals = [];

  function drawStreams(dt, now, accent, style) {
    const glow = NX.S.settings.glow;
    const turbo = NX.S.turbo ? 2.8 : 1;

    CH.forEach((ch, i) => {
      const c = NX.S.chan[i];
      const p = channelPath(i);
      const arr = streams[i];
      const speed = c.speed * 0.14 * turbo;
      const over = c.over && NX.S.settings.over;

      // 通道底色：低速仍有可辨认的连续细线
      ctx.beginPath();
      ctx.moveTo(p.x0, p.y0);
      ctx.quadraticCurveTo(p.mx, p.my, p.x1, p.y1);
      ctx.strokeStyle = rgba(accent, 0.035 + Math.min(0.14, c.speed * 0.06));
      ctx.lineWidth = 1;
      ctx.stroke();

      const col = over ? mix(rgb(accent), [232, 168, 112], 0.55) : rgb(accent);
      const streamColor = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;

      for (const q of arr) {
        q.t += speed * dt * (0.8 + q.size * 0.25);
        if (q.t >= 1) {
          q.t -= 1;
          if (Math.random() < 0.35) arrivals.push({ i, t: 0 });
        }
        const pt = pathPoint(p, q.t);
        const spread = (1 - q.t * 0.35) * 3.2 * q.jitter;
        const fade = Math.sin(Math.min(1, q.t / 0.08) * Math.PI / 2) * (1 - q.t * 0.15);

        if (style === 'refraction') {
          // 空间折射：细亮边 + 半透明扰动
          const w = 1.5 + q.size * 1.6;
          ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.16 * fade * glow})`;
          ctx.lineWidth = w * 2.4;
          ctx.beginPath();
          ctx.moveTo(pt.x - 3, pt.y + spread);
          ctx.lineTo(pt.x + 7, pt.y + spread * 0.6);
          ctx.stroke();
          ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.55 * fade * glow})`;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(pt.x - 2, pt.y + spread);
          ctx.lineTo(pt.x + 5, pt.y + spread * 0.7);
          ctx.stroke();
        } else {
          const r = 0.7 + q.size * 0.55;
          const tail = Math.min(7, 1 + c.speed * 3.2);
          // 不用逐粒子渐变（每帧上千个渐变会拖垮合成器）
          ctx.globalAlpha = 0.55 * fade * glow;
          ctx.strokeStyle = streamColor;
          ctx.lineWidth = r;
          ctx.beginPath();
          ctx.moveTo(pt.x - tail, pt.y + spread);
          ctx.lineTo(pt.x + 0.8, pt.y + spread);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // 过载：通道额外压力光
      if (over) {
        ctx.beginPath();
        ctx.moveTo(p.x0, p.y0);
        ctx.quadraticCurveTo(p.mx, p.my, p.x1, p.y1);
        ctx.strokeStyle = `rgba(232,168,112,${0.05 + 0.05 * Math.sin(now * 0.006)})`;
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
    });

    // 抵达反馈（引擎无关的基础闪一下，具体引擎另有强化）
    for (let i = arrivals.length - 1; i >= 0; i--) {
      arrivals[i].t += dt;
      if (arrivals[i].t > 0.45) {
        NX.emit('arrival', { ch: arrivals[i].i });
        arrivals.splice(i, 1);
      }
    }
  }

  /* ------------------------------------------------------------------ 1. 环状流场 */
  const ringEngine = {
    draw(dt, now, accent) {
      const g = geo();
      drawRing(now, accent, null);
      drawSphere(now, accent, g);
      drawStreams(dt, now, accent, 'line');
    }
  };

  /* ------------------------------------------------------------------ 2. 黑洞 */
  const bh = { waves: [], lastWave: 0, disk: [] };
  function initBH() {
    bh.disk.length = 0;
    for (let i = 0; i < 220; i++) {
      bh.disk.push({ a: Math.random() * TAU, r: 0.30 + Math.random() * 0.55, w: 0.5 + Math.random(), hot: Math.random() });
    }
  }
  const bhEngine = {
    draw(dt, now, accent) {
      const g = geo();
      drawRing(now, accent, null);
      const R = g.R * 0.30;
      const cx = g.cx, cy = g.cy;

      // 引力透镜光晕
      const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 2.6);
      halo.addColorStop(0, rgba(accent, 0.16 * NX.S.settings.glow));
      halo.addColorStop(0.45, rgba(accent, 0.05));
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx, cy, R * 2.6, 0, TAU); ctx.fill();

      // 倾斜吸积盘（后半）
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.34);
      ctx.scale(1, 0.30);
      for (const d of bh.disk) {
        d.a += dt * (0.35 + 0.9 / (d.r + 0.4)) * 0.55;
        const rr = d.r * R;
        const x = Math.cos(d.a) * rr, y = Math.sin(d.a) * rr;
        ctx.beginPath();
        ctx.arc(x, y, 0.7 + d.hot * 1.1, 0, TAU);
        ctx.fillStyle = rgba(accent, 0.05 + d.hot * 0.30);
        ctx.fill();
      }
      ctx.restore();

      // 暗核
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.62);
      core.addColorStop(0, '#000');
      core.addColorStop(0.72, '#000');
      core.addColorStop(1, rgba(accent, 0.18));
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.62, 0, TAU);
      ctx.fillStyle = core; ctx.fill();

      // 吸积盘前缘（遮挡关系）
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.34);
      ctx.scale(1, 0.30);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.86, 0.15, Math.PI - 0.15);
      ctx.strokeStyle = rgba(accent, 0.55 * NX.S.settings.glow);
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.68, 0.1, Math.PI - 0.1);
      ctx.strokeStyle = rgba('#ffffff', 0.12);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // 光子环
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.60, 0, TAU);
      ctx.strokeStyle = rgba(accent, 0.55);
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 每 1.5 秒一道整体引力波，最多两道
      if (now - bh.lastWave > 1500 && bh.waves.length < 2) {
        bh.lastWave = now;
        bh.waves.push({ t: 0 });
      }
      for (let i = bh.waves.length - 1; i >= 0; i--) {
        const w = bh.waves[i];
        w.t += dt / 2.7;
        if (w.t >= 1) { bh.waves.splice(i, 1); continue; }
        const x = cx + (W - cx) * w.t;
        const alpha = 0.30 * (1 - w.t) * (NX.S.settings.light ? 1 : 0.4);
        for (let k = 0; k < 5; k++) {
          const y = channelPath(k).y1;
          const wob = Math.sin(w.t * 9 + k) * 4;
          ctx.beginPath();
          ctx.ellipse(x, y + wob, 16 + w.t * 30, 26, 0, -Math.PI / 2, Math.PI / 2);
          ctx.strokeStyle = rgba(accent, alpha);
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }

      drawStreams(dt, now, accent, 'line');
    }
  };

  /* ------------------------------------------------------------------ 3. 聚变 */
  const fusion = { gran: [] };
  function initFusion() {
    fusion.gran.length = 0;
    for (let i = 0; i < 160; i++) {
      fusion.gran.push({
        a: Math.random() * TAU, r: Math.random(), s: 0.5 + Math.random() * 2.4,
        w: 0.4 + Math.random() * 1.4, ph: Math.random() * TAU
      });
    }
  }
  const fusionEngine = {
    draw(dt, now, accent) {
      const g = geo();
      drawRing(now, accent, null);
      const cx = g.cx, cy = g.cy;
      const R = g.R * 0.075;              // 主体直径约为巨环直径的 7%
      const glow = NX.S.settings.glow;

      // 日冕
      const corona = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 5.2);
      corona.addColorStop(0, `rgba(255,190,120,${0.30 * glow})`);
      corona.addColorStop(0.35, `rgba(255,140,70,${0.14 * glow})`);
      corona.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = corona;
      ctx.beginPath(); ctx.arc(cx, cy, R * 5.2, 0, TAU); ctx.fill();

      // 球体
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
      const body = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.25, R * 0.1, cx, cy, R);
      body.addColorStop(0, '#fffdf2');
      body.addColorStop(0.35, '#ffd27a');
      body.addColorStop(0.72, '#f2803c');
      body.addColorStop(1, '#a3341c');
      ctx.fillStyle = body; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      // 表面颗粒/活跃区
      for (const n of fusion.gran) {
        n.a += dt * n.w * 0.35;
        const rr = Math.sqrt(n.r) * R;
        const x = cx + Math.cos(n.a + now * 0.0002) * rr;
        const y = cy + Math.sin(n.a - now * 0.00015) * rr * 0.92;
        const heat = 0.35 + 0.65 * Math.abs(Math.sin(now * 0.001 * n.w + n.ph));
        ctx.beginPath();
        ctx.arc(x, y, n.s * (0.6 + heat * 0.8), 0, TAU);
        ctx.fillStyle = `rgba(255,${180 + 50 * heat | 0},${90 + 90 * heat | 0},${0.10 + heat * 0.22})`;
        ctx.fill();
      }

      // 日冕亮边
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.99, 0, TAU);
      ctx.strokeStyle = 'rgba(255,228,178,.55)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();

      // 局部喷发
      const ph = (now * 0.00013) % 1;
      if (ph < 0.22) {
        const a = -2.2 + ph * 3.4;
        const len = R * (1.5 + ph * 5);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95);
        ctx.quadraticCurveTo(
          cx + Math.cos(a - 0.15) * len * 0.7, cy + Math.sin(a - 0.15) * len * 0.7,
          cx + Math.cos(a - 0.25) * len, cy + Math.sin(a - 0.25) * len);
        ctx.strokeStyle = `rgba(255,196,130,${0.5 * (1 - ph / 0.22)})`;
        ctx.lineWidth = 2.4 * (1 - ph / 0.22) + 0.4;
        ctx.stroke();
      }

      drawStreams(dt, now, accent, 'refraction');
    }
  };

  /* ------------------------------------------------------------------ 4. 三体 */
  const three = { bodies: [], trails: [], init: false, hist: [] };
  function initThree() {
    three.bodies = [
      { x: -0.34, y: 0.06, vx: 0.05, vy: 0.16, m: 1.0 },
      { x: 0.30, y: -0.12, vx: -0.12, vy: -0.10, m: 0.85 },
      { x: 0.04, y: 0.30, vx: 0.08, vy: -0.13, m: 0.7 }
    ];
    three.trails = three.bodies.map(() => []);
    three.init = true;
  }
  const threeEngine = {
    draw(dt, now, accent) {
      const g = geo();
      drawRing(now, accent, null);
      if (!three.init) initThree();
      const glow = NX.S.settings.glow;
      const scale = g.R * 0.9;

      // 软化引力积分（固定时间步，稳定优先）
      const steps = 3, h = Math.min(dt, 0.033) / steps, soft = 0.04;
      for (let s = 0; s < steps; s++) {
        for (let i = 0; i < 3; i++) {
          let ax = 0, ay = 0;
          for (let j = 0; j < 3; j++) {
            if (i === j) continue;
            const dx = three.bodies[j].x - three.bodies[i].x;
            const dy = three.bodies[j].y - three.bodies[i].y;
            const d2 = dx * dx + dy * dy + soft;
            const f = three.bodies[j].m / (d2 * Math.sqrt(d2)) * 0.06;
            ax += dx * f; ay += dy * f;
          }
          three.bodies[i].vx += ax * h * 60;
          three.bodies[i].vy += ay * h * 60;
        }
        for (const b of three.bodies) {
          b.x += b.vx * h; b.y += b.vy * h;
          // 柔和边界，避免飞走
          const d = Math.hypot(b.x, b.y);
          if (d > 0.92) { b.vx *= 0.985; b.vy *= 0.985; }
        }
      }

      // 轨迹
      three.trails.forEach((tr, i) => {
        const b = three.bodies[i];
        if (!tr.length || Math.hypot(tr[tr.length - 1].x - b.x, tr[tr.length - 1].y - b.y) > 0.004)
          tr.push({ x: b.x, y: b.y });
        if (tr.length > 150) tr.shift();
      });

      ctx.save();
      ctx.translate(g.cx, g.cy);
      for (let i = 0; i < 3; i++) {
        const tr = three.trails[i];
        for (let k = 1; k < tr.length; k++) {
          const a = (k / tr.length) * 0.35 * glow;
          ctx.beginPath();
          ctx.moveTo(tr[k - 1].x * scale, tr[k - 1].y * scale);
          ctx.lineTo(tr[k].x * scale, tr[k].y * scale);
          ctx.strokeStyle = rgba(accent, a);
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
      }
      // 核心
      for (let i = 0; i < 3; i++) {
        const b = three.bodies[i];
        const x = b.x * scale, y = b.y * scale;
        const rad = 5 + b.m * 3;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, rad * 3);
        gr.addColorStop(0, rgba(accent, 0.9));
        gr.addColorStop(0.3, rgba(accent, 0.35));
        gr.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(x, y, rad * 3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, rad * 0.45, 0, TAU);
        ctx.fillStyle = '#fff'; ctx.fill();
      }
      ctx.restore();

      drawStreams(dt, now, accent, 'line');
    }
  };

  /* ------------------------------------------------------------------ 5. 推理网络 */
  const infer = { layers: [], nodes: [], tasks: [], cache: [] };
  function initInfer() {
    const counts = [5, 11, 15, 15, 11, 5];
    infer.layers = [];
    infer.nodes = [];
    let y0 = 0;
    const totalW = 1;
    counts.forEach((n, li) => {
      const x = li / (counts.length - 1);
      const arr = [];
      for (let i = 0; i < n; i++) {
        const y = n === 1 ? 0 : (i / (n - 1) - 0.5);
        const node = { x, y, li, i, act: 0 };
        arr.push(node);
        infer.nodes.push(node);
      }
      infer.layers.push(arr);
    });
  }
  const inferEngine = {
    draw(dt, now, accent) {
      const g = geo();
      drawRing(now, accent, null);
      if (!infer.layers.length) initInfer();
      const glow = NX.S.settings.glow;
      const W2 = Math.min(W * 0.52, g.R * 2.2);
      const cx = g.cx + g.R * 0.55, cy = g.cy;
      const X = (n) => cx + (n.x - 0.5) * W2;
      const Y = (n) => cy + n.y * H * 0.40;

      // 层间连接
      for (let li = 0; li < infer.layers.length - 1; li++) {
        const A = infer.layers[li], B = infer.layers[li + 1];
        for (let i = 0; i < A.length; i += 1) {
          for (let j = 0; j < B.length; j += 2) {
            ctx.beginPath();
            ctx.moveTo(X(A[i]), Y(A[i]));
            ctx.lineTo(X(B[j]), Y(B[j]));
            ctx.strokeStyle = rgba(accent, 0.018 * glow);
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // 任务包：逐层推进
      if (infer.tasks.length < 60 && Math.random() < 0.35) {
        const chI = (Math.random() * 5) | 0;
        infer.tasks.push({ ch: chI, li: 0, t: 0, speed: 1.4 + Math.random() * 1.6, branch: Math.random() < 0.4 });
      }
      for (let i = infer.tasks.length - 1; i >= 0; i--) {
        const tk = infer.tasks[i];
        tk.t += dt * tk.speed;
        if (tk.t >= 1) {
          tk.t -= 1;
          tk.li++;
          if (tk.li >= infer.layers.length - 1) {
            NX.emit('arrival', { ch: tk.ch });
            infer.tasks.splice(i, 1);
            continue;
          }
        }
        const A = infer.layers[tk.li], B = infer.layers[tk.li + 1];
        const a = A[(tk.ch * 3 + tk.li) % A.length];
        const b = B[(tk.ch * 5 + tk.li * 2) % B.length];
        const x = X(a) + (X(b) - X(a)) * tk.t;
        const y = Y(a) + (Y(b) - Y(a)) * tk.t;
        ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU);
        ctx.fillStyle = rgba(accent, 0.85 * glow);
        ctx.fill();
        // 亮痕
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, TAU);
        ctx.fillStyle = rgba(accent, 0.10 * glow);
        ctx.fill();
      }

      // 节点
      for (const n of infer.nodes) {
        const active = infer.tasks.some(t => t.li === n.li && Math.abs((t.ch * 3 + t.li) % 100) < 30);
        const r = active ? 2.4 : 1.5;
        ctx.beginPath(); ctx.arc(X(n), Y(n), r, 0, TAU);
        ctx.fillStyle = rgba(accent, active ? 0.9 : 0.22);
        ctx.fill();
      }

      // 过载：额外缓存格与并行候选
      if (NX.S.settings.over) {
        CH.forEach((ch, i) => {
          if (!NX.S.chan[i].over) return;
          const layer = infer.layers[3 + (i % 2)];
          infer.cache.push({ x: X(layer[0]) + 26, y: Y(layer[0]) + (i - 2) * 6, t: 0 });
        });
      }
      for (let i = infer.cache.length - 1; i >= 0; i--) {
        const c = infer.cache[i];
        c.t += dt;
        if (c.t > 1.4) { infer.cache.splice(i, 1); continue; }
        const s = 3 + Math.sin(c.t * 10) * 1.2;
        ctx.strokeStyle = 'rgba(232,168,112,.5)';
        ctx.strokeRect(c.x, c.y, s, s);
      }
      if (infer.cache.length > 60) infer.cache.splice(0, infer.cache.length - 60);

      // 左右通道仍向五个接收端输出
      drawStreams(dt, now, accent, 'line');
    }
  };

  const engines = { ring: ringEngine, bh: bhEngine, fusion: fusionEngine, three: threeEngine, infer: inferEngine };

  /* ------------------------------------------------------------------ 交互 */
  cv.addEventListener('mousemove', e => {
    if (!NX.S.settings.mouse) { sphere.mouse.active = false; return; }
    const r = cv.getBoundingClientRect();
    sphere.mouse.x = e.clientX - r.left;
    sphere.mouse.y = e.clientY - r.top;
    const g = geo();
    sphere.mouse.active = Math.hypot(sphere.mouse.x - g.cx, sphere.mouse.y - g.cy) < g.R;
  });
  cv.addEventListener('mouseleave', () => { sphere.mouse.active = false; });
  cv.addEventListener('click', e => {
    if (!NX.S.settings.mouse) return;
    const g = geo();
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (Math.hypot(x - g.cx, y - g.cy) > g.R) return;
    // 局部交互：只注入一次视觉能量，不改真实读数、不触发过载
    for (let i = 0; i < 6; i++) {
      const ed = sphere.edges[(Math.random() * sphere.edges.length) | 0];
      if (ed) sphere.bullets.push({ e: ed, t: 0, v: 1.6 });
    }
    NX.emit('inject', { x, y });
  });

  /* ------------------------------------------------------------------ 主循环 */
  let last = 0, frames = 0, fpsAt = 0, fps = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;

    const accent = NX.accentHex();
    ctx.clearRect(0, 0, W, H);

    const e = engines[NX.S.mode] || engines.ring;
    ctx.save();
    try { e.draw(dt, now, accent); } catch (err) { console.error('engine error', err); }
    ctx.restore();

    frames++;
    if (now - fpsAt > 700) {
      fps = Math.round(frames * 1000 / (now - fpsAt));
      frames = 0; fpsAt = now;
      NX.emit('fps', fps);
    }
  }

  window.addEventListener('resize', () => {
    resize(); rebuildParticles();
  });

  resize();
  buildSphere();
  initBH();
  initFusion();
  initInfer();
  rebuildParticles();
  NX.on('ui', () => { rebuildParticles(); });
  requestAnimationFrame(frame);

  window.STAGE = { resize, geo, streams };
})();
