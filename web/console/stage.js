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

      const stride = style === 'refraction' ? 3 : 1;
      for (let qi = 0; qi < arr.length; qi++) {
        const q = arr[qi];
        q.t += speed * dt * (0.8 + q.size * 0.25);
        if (stride > 1 && qi % stride !== 0) { if (q.t >= 1) q.t -= 1; continue; }
        if (q.t >= 1) {
          q.t -= 1;
          if (Math.random() < 0.35) arrivals.push({ i, t: 0 });
        }
        const pt = pathPoint(p, q.t);
        const spread = (1 - q.t * 0.35) * 3.2 * q.jitter;
        const fade = Math.sin(Math.min(1, q.t / 0.10) * Math.PI / 2) * (1 - Math.max(0, (q.t - 0.75) / 0.25)) * 0.95;

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
  const fusion = { cells: [], small: [], rays: [], prom: [], flare: 0, nextFlare: 2000 };
  function initFusion() {
    fusion.cells = []; fusion.small = []; fusion.rays = []; fusion.prom = [];
    for (let i = 0; i < 110; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random());
      fusion.cells.push({ a, r, s: 1.6 + Math.random() * 4.2, w: 0.08 + Math.random() * 0.22, ph: Math.random() * TAU, hot: 0.35 + Math.random() * 0.65 });
    }
    for (let i = 0; i < 170; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random());
      fusion.small.push({ a, r, s: 0.5 + Math.random() * 1.5, w: 0.22 + Math.random() * 0.5, ph: Math.random() * TAU });
    }
    for (let i = 0; i < 34; i++) fusion.rays.push({ a: Math.random() * TAU, len: 0.35 + Math.random() * 0.95, w: 0.4 + Math.random() * 1.3, sp: 0.02 + Math.random() * 0.05 });
    for (let i = 0; i < 3; i++) fusion.prom.push({ a: -0.9 + i * 1.15, h: 0.5 + Math.random() * 0.6, ph: i * 2.1, w: 0.55 + Math.random() * 0.4 });
  }

  const fusionEngine = {
    draw(dt, now, accent) {
      const g = geo();
      drawRing(now, accent, null);
      const cx = g.cx, cy = g.cy;
      const R = g.R * 0.085;                  // 主体直径 ≈ 巨环直径的 7%
      const glow = NX.S.settings.glow;

      /* 日冕：放射性长辉 + 缓慢旋转的冕流 */
      const halo = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 6.0);
      halo.addColorStop(0, `rgba(255,186,112,${0.26 * glow})`);
      halo.addColorStop(0.22, `rgba(255,140,64,${0.12 * glow})`);
      halo.addColorStop(0.6, `rgba(210,90,40,${0.035 * glow})`);
      halo.addColorStop(1, 'rgba(180,60,20,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx, cy, R * 6.0, 0, TAU); ctx.fill();

      for (const ray of fusion.rays) {
        ray.a += dt * ray.sp;
        const a0 = ray.a, len = R * (1.15 + ray.len * 1.5) * (0.92 + 0.08 * Math.sin(now * 0.0009 + a0 * 7));
        const grd = ctx.createLinearGradient(
          cx + Math.cos(a0) * R, cy + Math.sin(a0) * R,
          cx + Math.cos(a0) * len, cy + Math.sin(a0) * len);
        grd.addColorStop(0, `rgba(255,196,132,${0.20 * glow})`);
        grd.addColorStop(1, 'rgba(255,150,80,0)');
        ctx.strokeStyle = grd;
        ctx.lineWidth = ray.w;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a0) * R * 1.01, cy + Math.sin(a0) * R * 1.01);
        ctx.lineTo(cx + Math.cos(a0) * len, cy + Math.sin(a0) * len);
        ctx.stroke();
      }

      /* 日珥：从边缘拱起的等离子弧 */
      for (const pr of fusion.prom) {
        const pulse = 0.55 + 0.45 * Math.sin(now * 0.0007 + pr.ph);
        const a = pr.a + Math.sin(now * 0.00035 + pr.ph) * 0.08;
        const p0x = cx + Math.cos(a - pr.w * 0.5) * R, p0y = cy + Math.sin(a - pr.w * 0.5) * R;
        const p1x = cx + Math.cos(a + pr.w * 0.5) * R, p1y = cy + Math.sin(a + pr.w * 0.5) * R;
        const peak = R * (1.25 + pr.h * 0.9) * (0.8 + 0.2 * pulse);
        const cxp = cx + Math.cos(a) * peak, cyp = cy + Math.sin(a) * peak;
        ctx.beginPath();
        ctx.moveTo(p0x, p0y);
        ctx.quadraticCurveTo(cxp, cyp, p1x, p1y);
        ctx.strokeStyle = `rgba(255,150,96,${0.30 * pulse * glow})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,214,170,${0.16 * pulse * glow})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      /* 球体 */
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();

      const body = ctx.createRadialGradient(cx - R * 0.22, cy - R * 0.26, R * 0.05, cx, cy, R * 1.02);
      body.addColorStop(0, '#fffdf4');
      body.addColorStop(0.28, '#ffe3a3');
      body.addColorStop(0.55, '#ffb055');
      body.addColorStop(0.80, '#ec6d28');
      body.addColorStop(1, '#8e2a12');
      ctx.fillStyle = body;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      // 米粒组织（大对流胞）
      for (const n of fusion.cells) {
        n.a += dt * n.w * 0.12;
        const rr = Math.sqrt(n.r) * R;
        const x = cx + Math.cos(n.a) * rr;
        const y = cy + Math.sin(n.a) * rr * 0.94;
        const limb = 1 - Math.pow(n.r, 3) * 0.55;          // 边缘压暗
        const heat = n.hot * (0.55 + 0.45 * Math.sin(now * 0.0012 * (0.5 + n.w) + n.ph));
        ctx.beginPath();
        ctx.arc(x, y, n.s * (0.7 + heat * 0.5), 0, TAU);
        ctx.fillStyle = `rgba(255,${(196 + 50 * heat) | 0},${(110 + 100 * heat) | 0},${(0.10 + heat * 0.20) * limb})`;
        ctx.fill();
      }
      // 细颗粒
      for (const n of fusion.small) {
        n.a += dt * n.w * 0.2;
        const rr = Math.sqrt(n.r) * R;
        const x = cx + Math.cos(n.a) * rr;
        const y = cy + Math.sin(n.a) * rr * 0.94;
        ctx.beginPath();
        ctx.arc(x, y, n.s, 0, TAU);
        ctx.fillStyle = `rgba(255,238,196,${0.10 * (1 - n.r * 0.7)})`;
        ctx.fill();
      }

      // 中心炽白核
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
      core.addColorStop(0, 'rgba(255,255,248,.55)');
      core.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = core;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      // 临边昏暗
      const limbG = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
      limbG.addColorStop(0, 'rgba(0,0,0,0)');
      limbG.addColorStop(1, 'rgba(60,10,0,.55)');
      ctx.fillStyle = limbG;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.restore();

      // 色球亮边
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.995, 0, TAU);
      ctx.strokeStyle = `rgba(255,226,176,${0.55 * glow})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.03, 0, TAU);
      ctx.strokeStyle = `rgba(255,150,90,${0.18 * glow})`;
      ctx.lineWidth = 3;
      ctx.stroke();

      /* 局部耀斑：每 6~9 秒一次 */
      if (now > fusion.nextFlare) {
        fusion.flare = 1;
        fusion.nextFlare = now + 6000 + Math.random() * 3000;
      }
      if (fusion.flare > 0.01) {
        fusion.flare *= Math.pow(0.12, dt);
        const a = -1.4 + Math.sin(now * 0.0004) * 0.8;
        const len = R * (1.4 + 2.6 * (1 - fusion.flare));
        const fx = cx + Math.cos(a) * R * 0.9, fy = cy + Math.sin(a) * R * 0.9;
        const grd = ctx.createLinearGradient(fx, fy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        grd.addColorStop(0, `rgba(255,246,220,${0.55 * fusion.flare * glow})`);
        grd.addColorStop(1, 'rgba(255,170,90,0)');
        ctx.strokeStyle = grd;
        ctx.lineWidth = 3 + 6 * fusion.flare;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(cx + Math.cos(a - 0.22) * len * 0.6, cy + Math.sin(a - 0.22) * len * 0.6,
          cx + Math.cos(a - 0.3) * len, cy + Math.sin(a - 0.3) * len);
        ctx.stroke();
      }

      drawStreams(dt, now, accent, 'refraction');
    }
  };

  /* ------------------------------------------------------------------ 4. 三体 */
  // 采用经典「8 字形」三体解（Chenciner–Montgomery）离线积分一次，
  // 之后循环播放——稳定、三条轨迹各不相同，也不会甩出画面。
  const three = { frames: [], ghost: [[], [], []], idx: 0, built: false, dust: [], burst: [], lastClose: 0, trail: 420 };

  function buildFigureEight() {
    const p = [
      { x: -0.97000436, y: 0.24308753 },
      { x: 0.97000436, y: -0.24308753 },
      { x: 0, y: 0 }
    ];
    const v = [
      { x: 0.4662036850, y: 0.4323657300 },
      { x: 0.4662036850, y: 0.4323657300 },
      { x: -0.93240737, y: -0.86473146 }
    ];

    const dt = 0.0004, soft = 1e-3;
    const steps = Math.round(6.3259 / dt);      // 一个完整周期
    three.frames = [];

    const accel = (i) => {
      let ax = 0, ay = 0;
      for (let j = 0; j < 3; j++) {
        if (i === j) continue;
        const dx = p[j].x - p[i].x, dy = p[j].y - p[i].y;
        const d2 = dx * dx + dy * dy + soft;
        const f = 1 / (d2 * Math.sqrt(d2));
        ax += dx * f; ay += dy * f;
      }
      return { x: ax, y: ay };
    };

    for (let k = 0; k < steps; k++) {
      // 速度 Verlet
      const a0 = [accel(0), accel(1), accel(2)];
      for (let i = 0; i < 3; i++) {
        p[i].x += v[i].x * dt + 0.5 * a0[i].x * dt * dt;
        p[i].y += v[i].y * dt + 0.5 * a0[i].y * dt * dt;
      }
      const a1 = [accel(0), accel(1), accel(2)];
      for (let i = 0; i < 3; i++) {
        v[i].x += 0.5 * (a0[i].x + a1[i].x) * dt;
        v[i].y += 0.5 * (a0[i].y + a1[i].y) * dt;
      }
      if (k % 4 === 0) {
        three.frames.push([
          { x: p[0].x, y: p[0].y },
          { x: p[1].x, y: p[1].y },
          { x: p[2].x, y: p[2].y }
        ]);
      }
    }
    // 整条 8 字轨道的淡影，保证轮廓始终可辨
    three.ghost = [[], [], []];
    for (let k = 0; k < three.frames.length; k += 22) {
      for (let i = 0; i < 3; i++) three.ghost[i].push(three.frames[k][i]);
    }

    three.dust = [];
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * TAU, r = 0.45 + Math.random() * 0.55;
      three.dust.push({ a, r, s: 0.5 + Math.random() * 1.2, w: 0.3 + Math.random() * 1.1, ph: Math.random() * TAU });
    }
    three.built = true;
  }

  const threeEngine = {
    draw(dt, now, accent) {
      const g = geo();
      drawRing(now, accent, null);
      if (!three.built) buildFigureEight();
      const glow = NX.S.settings.glow;
      const scale = g.R * 0.62;

      // 播放轨迹（约 12 秒一圈）
      const n = three.frames.length;
      three.idx = (three.idx + dt * n / 15) % n;
      const cur = three.frames[Math.floor(three.idx) % n];

      ctx.save();
      ctx.translate(g.cx, g.cy);

      // 尘埃
      for (const d of three.dust) {
        d.a += dt * d.w * 0.22;
        const x = Math.cos(d.a + Math.sin(now * 0.0002 + d.ph) * 0.4) * d.r * scale * 1.6;
        const y = Math.sin(d.a + Math.cos(now * 0.00017 + d.ph) * 0.35) * d.r * scale * 1.5;
        ctx.fillStyle = rgba(accent, 0.07 + 0.10 * Math.abs(Math.sin(now * 0.001 + d.ph)));
        ctx.beginPath(); ctx.arc(x, y, d.s * 0.8, 0, TAU); ctx.fill();
      }

      // 整条 8 字轮廓的极淡底影
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        three.ghost[i].forEach((f, k) => {
          const x = f.x * scale, y = f.y * scale;
          k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = rgba(accent, 0.045 * glow);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 轨迹：整条折线一次描边，再叠一段更亮的近端尾迹
      for (let i = 0; i < 3; i++) {
        const L = three.trail, base = Math.floor(three.idx), n2 = n;
        ctx.beginPath();
        for (let k = 0; k < L; k += 5) {
          const f = three.frames[((base - k) % n2 + n2) % n2][i];
          const x = f.x * scale, y = f.y * scale;
          k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(accent, 0.30 * glow);
        ctx.lineWidth = 1.1;
        ctx.stroke();

        ctx.beginPath();
        for (let k = 0; k < 90; k += 2) {
          const f = three.frames[((base - k) % n2 + n2) % n2][i];
          const x = f.x * scale, y = f.y * scale;
          k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(accent, 0.55 * glow);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // 三个核心
      for (let i = 0; i < 3; i++) {
        const x = cur[i].x * scale, y = cur[i].y * scale;
        const rad = 7 + i * 0.6;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, rad * 3.0);
        gr.addColorStop(0, rgba(accent, 0.95));
        gr.addColorStop(0.16, rgba(accent, 0.5));
        gr.addColorStop(0.55, rgba(accent, 0.10));
        gr.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(x, y, rad * 3.0, 0, TAU); ctx.fill();

        ctx.beginPath(); ctx.arc(x, y, rad * 0.62, 0, TAU);
        ctx.fillStyle = 'rgba(8,11,16,.9)';
        ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, rad * 0.62, 0, TAU);
        ctx.strokeStyle = rgba(accent, 0.9);
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 1.4, 0, TAU);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }

      // 近距离交会：能量交换环 + 一次弹射到接收端
      const d01 = Math.hypot(cur[0].x - cur[1].x, cur[0].y - cur[1].y);
      const d02 = Math.hypot(cur[0].x - cur[2].x, cur[0].y - cur[2].y);
      const d12 = Math.hypot(cur[1].x - cur[2].x, cur[1].y - cur[2].y);
      const dmin = Math.min(d01, d02, d12);
      if (dmin < 0.22 && now - three.lastClose > 900) {
        three.lastClose = now;
        const mid = { x: (cur[0].x + cur[1].x + cur[2].x) / 3 * scale, y: (cur[0].y + cur[1].y + cur[2].y) / 3 * scale };
        three.burst.push({ x: mid.x, y: mid.y, t: 0 });
        NX.emit('arrival', { ch: (Math.random() * 5) | 0 });
      }

      for (let i = three.burst.length - 1; i >= 0; i--) {
        const b = three.burst[i];
        b.t += dt;
        if (b.t > 0.9) { three.burst.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(b.x, b.y, 12 + b.t * 110, 0, TAU);
        ctx.strokeStyle = rgba(accent, 0.40 * (1 - b.t / 0.9));
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      ctx.restore();

      drawStreams(dt, now, accent, 'line');
    }
  };

  /* ------------------------------------------------------------------ 5. 推理网络 */
  const infer = { layers: [], adj: [], tasks: [], branch: [], cache: [], built: false };
  const INFER_LABELS = ['输入编码', '注意力', '并行分支', '路径筛选', '汇合', '输出'];
  function initInfer() {
    const counts = [5, 11, 15, 15, 11, 5];
    infer.layers = [];
    counts.forEach((n, li) => {
      const arr = [];
      for (let i = 0; i < n; i++) arr.push({ y: n === 1 ? 0 : (i / (n - 1) - 0.5), li, i });
      infer.layers.push(arr);
    });
    // 稀疏连接：每个节点连到下一层的 3 个邻近节点
    infer.adj = [];
    for (let li = 0; li < infer.layers.length - 1; li++) {
      const A = infer.layers[li], B = infer.layers[li + 1];
      const map = [];
      A.forEach((a, ai) => {
        const center = Math.round((ai / Math.max(1, A.length - 1)) * (B.length - 1));
        const list = [];
        for (let k = -1; k <= 1; k++) {
          const idx = Math.max(0, Math.min(B.length - 1, center + k));
          if (list.indexOf(idx) < 0) list.push(idx);
        }
        map.push(list);
      });
      infer.adj.push(map);
    }
    infer.built = true;
  }

  const inferEngine = {
    draw(dt, now, accent) {
      const g = geo();
      drawRing(now, accent, null);
      if (!infer.built) initInfer();
      const glow = NX.S.settings.glow;
      // 排在巨环右侧之外，避免和圆环抢同一片区域
      const cx = g.cx + g.R * 1.02, cy = g.cy;
      const W2 = Math.min(W * 0.50, Math.max(240, (W - cx - 18) * 2));

      const cxOf = (li) => cx + (li / (infer.layers.length - 1) - 0.5) * W2;
      const yOf = (node) => cy + node.y * H * 0.30 * (0.82 + 0.18 * Math.sin(Math.PI * (node.li / 5)));

      /* 层间连接（只画拓扑，不抢视线） */
      for (let li = 0; li < infer.layers.length - 1; li++) {
        const A = infer.layers[li];
        A.forEach((a, ai) => {
          infer.adj[li][ai].forEach(bi => {
            const b = infer.layers[li + 1][bi];
            ctx.beginPath();
            ctx.moveTo(cxOf(li), yOf(a));
            ctx.lineTo(cxOf(li + 1), yOf(b));
            ctx.strokeStyle = rgba(accent, 0.085 * glow);
            ctx.lineWidth = 0.6;
            ctx.stroke();
          });
        });
      }

      /* 每层一条很淡的竖向参考线，让六层结构可辨 */
      for (let li = 0; li < 6; li++) {
        const x = cxOf(li);
        const half = H * 0.155 * (0.82 + 0.18 * Math.sin(Math.PI * (li / 5)));
        ctx.beginPath();
        ctx.moveTo(x, cy - half);
        ctx.lineTo(x, cy + half);
        ctx.strokeStyle = rgba(accent, 0.035 * glow);
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      /* 层标签 */
      ctx.font = '8.5px ui-monospace, monospace';
      ctx.textAlign = 'center';
      for (let li = 0; li < 6; li++) {
        ctx.fillStyle = 'rgba(150,163,178,.70)';
        ctx.fillText(INFER_LABELS[li], cxOf(li), cy + H * 0.20);
      }
      ctx.textAlign = 'left';

      /* 任务：错峰并行，逐层推进 */
      const cap = 48;
      if (infer.tasks.length < cap && Math.random() < 0.55) {
        const start = (Math.random() * infer.layers[0].length) | 0;
        infer.tasks.push({ li: 0, idx: start, t: 0, speed: 2.6 + Math.random() * 2.4, ch: (Math.random() * 5) | 0, trail: [] });
      }
      if (infer.branch.length < 10 && Math.random() < 0.18) {
        const start = (Math.random() * infer.layers[0].length) | 0;
        infer.branch.push({ li: 0, idx: start, t: 0, speed: 2.2, life: 1 });
      }

      const stepTasks = (arr, isBranch) => {
        for (let i = arr.length - 1; i >= 0; i--) {
          const tk = arr[i];
          tk.t += dt * tk.speed;
          if (tk.t >= 1) {
            tk.t -= 1;
            tk.li++;
            if (tk.li >= infer.layers.length - 1) {
              if (!isBranch) NX.emit('arrival', { ch: tk.ch });
              arr.splice(i, 1);
              continue;
            }
            const opts = infer.adj[tk.li - 1][tk.idx] || [0];
            tk.idx = opts[(Math.random() * opts.length) | 0];
          }

          const li = Math.min(tk.li, 4);
          const a = infer.layers[li][tk.idx];
          const bIdx = (infer.adj[li][tk.idx] || [0])[0];
          const b = infer.layers[li + 1][bIdx];
          const x0 = cxOf(li), x1 = cxOf(li + 1);
          const y0 = yOf(a), y1 = yOf(b);
          const x = x0 + (x1 - x0) * tk.t;
          const y = y0 + (y1 - y0) * tk.t;

          const alpha = isBranch ? 0.22 : 0.85;
          const col = isBranch ? rgba(accent, alpha) : rgba(accent, alpha * glow);
          // 亮痕
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x, y);
          ctx.strokeStyle = rgba(accent, isBranch ? 0.07 : 0.26 * (1 - tk.t * 0.5));
          ctx.lineWidth = isBranch ? 0.6 : 1.1;
          ctx.stroke();

          ctx.beginPath(); ctx.arc(x, y, isBranch ? 1.2 : 1.9, 0, TAU);
          ctx.fillStyle = col;
          ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, isBranch ? 3 : 5.5, 0, TAU);
          ctx.fillStyle = rgba(accent, isBranch ? 0.03 : 0.10);
          ctx.fill();
        }
      };
      stepTasks(infer.tasks, false);
      stepTasks(infer.branch, true);

      /* 节点：只有正在通过的任务才亮 */
      for (let li = 0; li < infer.layers.length; li++) {
        for (const n of infer.layers[li]) {
          const busy = infer.tasks.some(t => t.li === li && t.idx === n.i) ||
            infer.branch.some(t => t.li === li && t.idx === n.i);
          const x = cxOf(li), y = yOf(n);
          ctx.beginPath();
          ctx.arc(x, y, busy ? 2.9 : 1.8, 0, TAU);
          ctx.fillStyle = rgba(accent, busy ? 1 : 0.42);
          ctx.fill();
          if (busy) {
            ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU);
            ctx.strokeStyle = rgba(accent, 0.16);
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      /* 过载：缓存格积聚排出 + 三路并行候选 */
      if (NX.S.settings.over) {
        CH.forEach((ch, i) => {
          if (!NX.S.chan[i].over) return;
          if (Math.random() < 0.25) {
            const li = 2 + (i % 3);
            const n = infer.layers[li][(Math.random() * infer.layers[li].length) | 0];
            infer.cache.push({ x: cxOf(li) + 6, y: yOf(n) - 6, t: 0 });
          }
        });
      }
      for (let i = infer.cache.length - 1; i >= 0; i--) {
        const c = infer.cache[i];
        c.t += dt;
        if (c.t > 1.2) { infer.cache.splice(i, 1); continue; }
        const s = 3 + Math.sin(c.t * 12) * 1.4;
        ctx.strokeStyle = `rgba(240,178,120,${0.55 * (1 - c.t / 1.2)})`;
        ctx.lineWidth = 0.9;
        ctx.strokeRect(c.x, c.y, s, s);
      }
      if (infer.cache.length > 70) infer.cache.splice(0, infer.cache.length - 70);

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
