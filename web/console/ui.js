/* ============================================================================
   NEXUS 监控台 —— 界面层：接收端 / 顶栏 / 引擎切换 / 参数 / 全屏
   ============================================================================ */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const S = NX.S;

  /* ------------------------------------------------------------ 接收端 */
  const rcvEls = [];
  function buildReceivers() {
    const box = $('#receivers');
    box.innerHTML = '';
    NX.CH.forEach((ch, i) => {
      const el = document.createElement('div');
      el.className = 'rcv';
      el.dataset.ch = ch.key;
      el.innerHTML = `
        <span class="idx">${ch.idx}</span>
        <div class="nm">${ch.name}</div>
        <div class="vv"><b>--</b><i>${ch.unit}</i></div>
        <div class="sub">流速 --</div>
        <div class="bar"></div>`;
      el.addEventListener('click', () => {
        if (S.focus === i) S.focus = -1;
        else S.focus = i;
        renderFocus();
      });
      box.appendChild(el);
      rcvEls.push(el);
    });
  }

  function fmtRate(kib) {
    if (kib == null) return '--';
    return kib >= 1024 ? (kib / 1024).toFixed(2) + ' MiB/s' : kib.toFixed(kib >= 100 ? 0 : 1) + ' KiB/s';
  }
  function fmtGB(bytes) {
    if (bytes == null) return '--';
    return (bytes / 1073741824).toFixed(1);
  }

  function renderReceivers() {
    const s = S.sample;
    NX.CH.forEach((ch, i) => {
      const el = rcvEls[i];
      const c = S.chan[i];
      const b = el.querySelector('.vv b');
      const unitEl = el.querySelector('.vv i');
      const sub = el.querySelector('.sub');
      const bar = el.querySelector('.bar');

      if (c.v == null) {
        b.textContent = '--';
        unitEl.textContent = ch.unit;
        sub.textContent = '指标不可用';
        bar.style.width = '0%';
      } else if (ch.net) {
        b.textContent = c.v >= 1024 ? (c.v / 1024).toFixed(2) : c.v.toFixed(c.v >= 100 ? 0 : 1);
        unitEl.textContent = c.v >= 1024 ? 'MiB/s' : 'KiB/s';
        sub.textContent = '流速 ' + (c.speed / 0.14).toFixed(2) + '×　阈值 ' + S.th[ch.key];
        bar.style.width = Math.min(100, Math.log(1 + c.v) / Math.log(1 + 4096) * 100) + '%';
      } else {
        b.textContent = c.v.toFixed(1);
        unitEl.textContent = '%';
        sub.textContent = '流速 ' + (c.speed / 0.14).toFixed(2) + '×　阈值 ' + S.th[ch.key];
        bar.style.width = Math.min(100, c.v) + '%';
      }

      el.classList.toggle('over', !!c.over && S.settings.over);
      el.classList.toggle('focused', S.focus === i);
      el.classList.toggle('dimmed', S.focus >= 0 && S.focus !== i);
    });

    // 看板数值
    if (s) {
      const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
      set('#bCpuVal', s.cpu ? s.cpu.pct.toFixed(1) : '--');
      set('#bMemVal', s.mem ? s.mem.pct.toFixed(1) : '--');
      set('#bGpuVal', s.gpu && s.gpu.available ? s.gpu.pct.toFixed(1) : '--');
      set('#bDownVal', s.net ? (s.net.down >= 1024 ? (s.net.down / 1024).toFixed(2) : s.net.down.toFixed(0)) : '--');
      set('#bUpVal', s.net ? (s.net.up >= 1024 ? (s.net.up / 1024).toFixed(2) : s.net.up.toFixed(0)) : '--');
      set('#bSysVal', s.sys ? s.sys.procCount : '--');
      $('#bDownUnit').textContent = s.net && s.net.down >= 1024 ? 'MiB/s' : 'KiB/s';
      $('#bUpUnit').textContent = s.net && s.net.up >= 1024 ? 'MiB/s' : 'KiB/s';

      set('#bCpuSub', '逻辑核心 ' + (s.cpu && s.cpu.cores ? s.cpu.cores.length : '--'));
      set('#bCpuSub2', s.cpu && s.cpu.procs && s.cpu.procs[0] ? (s.cpu.procs[0].name + ' ' + s.cpu.procs[0].cpu.toFixed(0) + '%') : '--');
      set('#bMemSub', s.mem ? (fmtGB(s.mem.used) + ' / ' + fmtGB(s.mem.total) + ' GB') : '--');
      set('#bMemSub2', s.mem && s.mem.procs && s.mem.procs[0] ? (s.mem.procs[0].name + ' ' + (s.mem.procs[0].ws / 1048576).toFixed(0) + ' MB') : '--');
      set('#bGpuSub', s.gpu && s.gpu.available && s.gpu.engines.length ? ('最繁忙 ' + s.gpu.engines[0].name + ' ' + s.gpu.engines[0].util.toFixed(0) + '%') : 'GPU 指标不可用');
      set('#bGpuSub2', s.gpu && s.gpu.available ? (s.gpu.engines.length + ' 个引擎') : '--');
      set('#bDownSub', s.net ? ('下行包 ' + s.net.downPkts.toFixed(0) + '/s') : '--');
      set('#bDownSub2', s.net ? s.net.iface : '--');
      set('#bUpSub', s.net ? ('上行包 ' + s.net.upPkts.toFixed(0) + '/s') : '--');
      set('#bUpSub2', s.net ? s.net.iface : '--');
      set('#bSysSub', s.sys ? ('线程 ' + s.sys.threadCount.toLocaleString()) : '--');
      set('#bSysSub2', s.sys ? ('上下文 ' + s.sys.ctx.toLocaleString() + '/s') : '--');

      $('#sbHost').textContent = (s.sys && s.sys.host ? s.sys.host : '本机') + ' · ' + (s.sys ? s.sys.cores : '--') + ' 核';
      $('#seqText').textContent = 'SEQ ' + (s.seq || '--');
      const t = new Date();
      $('#updText').textContent = '更新 ' + String(t.getHours()).padStart(2, '0') + ':' +
        String(t.getMinutes()).padStart(2, '0') + ':' + String(t.getSeconds()).padStart(2, '0');
    }

    $('#sbParts').textContent = '粒子 ' + S.settings.parts.toLocaleString();
    const online = S.online && !S.stale;
    $('#connDot').classList.toggle('bad', !online);
    $('#sbDot').classList.toggle('bad', !online);
    $('#connText').textContent = online ? '本机已连接' : (S.stale ? '数据过期' : '采样离线');
    $('#sbState').textContent = online ? '采样正常' : (S.stale ? '数据过期' : '采样离线');
    $('#offline').classList.toggle('show', !online);
    $('#sbNote').textContent = S.mock ? '测试数据（隔离）' : '127.0.0.1 本地';
  }

  function renderFocus() {
    rcvEls.forEach((el, i) => {
      el.classList.toggle('focused', S.focus === i);
      el.classList.toggle('dimmed', S.focus >= 0 && S.focus !== i);
    });
  }

  /* ------------------------------------------------------------ 抵达反馈 */
  function flash(i, kind) {
    const el = rcvEls[i];
    if (!el) return;
    el.classList.remove('hit', 'crack', 'shear');
    void el.offsetWidth;
    el.classList.add('hit');
    if (S.chan[i].over && S.settings.over) {
      el.classList.add(kind || 'crack');
      if (S.settings.autoFocus) { S.focus = i; renderFocus(); }
    }
    setTimeout(() => el.classList.remove('hit', 'crack', 'shear'), 600);
  }

  /* ------------------------------------------------------------ 引擎切换 */
  function buildEngineSwitch() {
    const box = $('#engineSwitch');
    box.innerHTML = '';
    NX.ENGINES.forEach(e => {
      const b = document.createElement('button');
      b.className = 'eng-btn';
      b.dataset.eng = e.key;
      b.textContent = e.name;
      b.addEventListener('click', () => NX.setMode(e.key));
      box.appendChild(b);
    });
  }

  function renderEngine() {
    const e = NX.engine;
    document.body.className = 'mode-' + e.key;
    $$('.eng-btn').forEach(b => b.classList.toggle('on', b.dataset.eng === e.key));
    $('#coreKicker').textContent = e.kicker;
    $('#coreTitle').innerHTML = e.title;
    $('#coreMeta').textContent = e.key === 'infer' ? '节点 62 · 六层并行' :
      e.key === 'ring' ? '神经元 92 · 连接 ' + 320 :
        e.key === 'bh' ? '吸积盘 · 引力透镜' :
          e.key === 'fusion' ? '日面颗粒 · 折射流' : '三体引力模拟';
    $('#coreMeta2').textContent = e.meta2;
  }

  /* ------------------------------------------------------------ 配色 */
  function renderTheme() {
    const hex = NX.accentHex();
    document.documentElement.style.setProperty('--accent', hex);
    const h = hex.replace('#', '');
    document.documentElement.style.setProperty('--accent-soft',
      `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},.16)`);
    $$('.theme').forEach(b => b.classList.toggle('on', b.dataset.theme === S.theme));
  }

  /* ------------------------------------------------------------ 参数 */
  function bindParams() {
    const s = S.settings;

    const rScale = $('#rScale'), rParts = $('#rParts'), rGlow = $('#rGlow'), rBeat = $('#rBeat');
    rScale.value = s.scale; rParts.value = s.parts; rGlow.value = s.glow; rBeat.value = s.beat;
    $('#oScale').textContent = Number(s.scale).toFixed(2);
    $('#oParts').textContent = s.parts;
    $('#oGlow').textContent = Number(s.glow).toFixed(2);
    $('#oBeat').textContent = Number(s.beat).toFixed(2);

    rScale.addEventListener('input', () => { NX.setSetting('scale', +rScale.value); $('#oScale').textContent = (+rScale.value).toFixed(2); });
    rParts.addEventListener('input', () => { NX.setSetting('parts', +rParts.value); $('#oParts').textContent = rParts.value; });
    rGlow.addEventListener('input', () => { NX.setSetting('glow', +rGlow.value); $('#oGlow').textContent = (+rGlow.value).toFixed(2); });
    rBeat.addEventListener('input', () => { NX.setSetting('beat', +rBeat.value); $('#oBeat').textContent = (+rBeat.value).toFixed(2); });

    const map = { cLight: 'light', cOver: 'over', cMouse: 'mouse', cFocus: 'autoFocus' };
    Object.keys(map).forEach(id => {
      const el = $('#' + id);
      el.checked = !!s[map[id]];
      el.addEventListener('change', () => NX.setSetting(map[id], el.checked));
    });

    const thMap = { cpu: '#thCpu', mem: '#thMem', gpu: '#thGpu', down: '#thDown', up: '#thUp' };
    Object.keys(thMap).forEach(k => {
      const el = $(thMap[k]);
      el.value = S.th[k];
      el.addEventListener('change', () => {
        const v = Math.max(1, +el.value || 1);
        el.value = v;
        NX.setThreshold(k, v);
      });
    });

    $$('.prev').forEach(b => b.addEventListener('click', () => {
      NX.preview(b.dataset.preview);
      b.classList.add('on');
      setTimeout(() => b.classList.remove('on'), 2000);
      toast('预览：' + b.dataset.preview.toUpperCase() + ' 过载视觉（不影响真实读数）');
    }));

    $('#btnReset').addEventListener('click', () => {
      NX.resetAll();
      bindParams();
      toast('已恢复默认设置');
    });

    $('#btnParams').addEventListener('click', () => openDrawer(true));
    $('#btnCloseParams').addEventListener('click', () => openDrawer(false));
    $('#mask').addEventListener('click', () => openDrawer(false));
  }

  function openDrawer(on) {
    $('#drawer').hidden = !on;
    $('#mask').hidden = !on;
  }

  /* ------------------------------------------------------------ 顶栏 */
  function bindTop() {
    $$('.theme').forEach(b => b.addEventListener('click', () => NX.setTheme(b.dataset.theme)));

    $('#btnTurbo').addEventListener('click', () => {
      S.turbo = !S.turbo;
      $('#btnTurbo').classList.toggle('on', S.turbo);
    });

    $('#btnFull').addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
      } catch (e) { toast('当前窗口不允许全屏'); }
    });
    document.addEventListener('fullscreenchange', () => {
      $('#fullLabel').textContent = document.fullscreenElement ? '退出全屏' : '全屏';
      setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') openDrawer(false);
    });
  }

  /* ------------------------------------------------------------ 详情 */
  function bindDetails() {
    $$('.more').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.detail;
        const board = $(`.board[data-board="${key}"]`);
        const det = board.querySelector('.det');
        if (!det.hidden) { det.hidden = true; btn.textContent = '详情'; return; }
        det.hidden = false;
        btn.textContent = '收起';
        const s = S.sample;
        if (!s) { det.textContent = '暂无采样数据'; return; }
        const lines = [];
        if (key === 'cpu') {
          lines.push('处理器 ' + s.cpu.pct.toFixed(1) + '%　逻辑核心 ' + s.cpu.cores.length);
          lines.push('读数口径：整体 CPU 忙碌时间比例');
          s.cpu.procs.forEach(p => lines.push(`  ${p.name} (${p.pid})  ${p.cpu.toFixed(1)}%  线程 ${p.threads}`));
        } else if (key === 'mem') {
          lines.push('内存 ' + s.mem.pct.toFixed(1) + '%　' + fmtGB(s.mem.used) + ' / ' + fmtGB(s.mem.total) + ' GB');
          lines.push('可用 ' + fmtGB(s.mem.avail) + ' GB');
          s.mem.procs.forEach(p => lines.push(`  ${p.name} (${p.pid})  工作集 ${(p.ws / 1048576).toFixed(0)} MB`));
        } else if (key === 'gpu') {
          if (!s.gpu.available) lines.push('GPU 指标不可用（系统未提供 GPU Engine 计数器）');
          else {
            lines.push('主读数 = 最繁忙引擎利用率（不是各引擎相加）');
            s.gpu.engines.forEach(e => lines.push(`  ${e.name}  ${e.util.toFixed(1)}%`));
          }
        } else if (key === 'down' || key === 'up') {
          lines.push((key === 'down' ? '下载' : '上传') + ' ' + fmtRate(key === 'down' ? s.net.down : s.net.up));
          lines.push('包数 ' + (key === 'down' ? s.net.downPkts : s.net.upPkts).toFixed(0) + ' /s');
          lines.push('网卡 ' + s.net.iface);
          lines.push('单位统一为 KiB/s、MiB/s（不是比特）');
        } else {
          lines.push('进程 ' + s.sys.procCount + '　线程 ' + s.sys.threadCount);
          lines.push('上下文切换 ' + s.sys.ctx.toLocaleString() + ' /s');
          lines.push('采样序号 ' + s.seq + '　主机 ' + s.sys.host);
        }
        det.textContent = lines.join('\n');
      });
    });
  }

  /* ------------------------------------------------------------ 其他 */
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function tickUptime() {
    const s = Math.floor((Date.now() - S.startedAt) / 1000);
    const p = n => String(n).padStart(2, '0');
    $('#sbUptime').textContent = `运行 ${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
  }

  /* ------------------------------------------------------------ 启动 */
  buildReceivers();
  buildEngineSwitch();
  bindParams();
  bindTop();
  bindDetails();
  renderEngine();
  renderTheme();
  renderReceivers();

  NX.on('sample', () => { renderReceivers(); });
  NX.on('ui', () => { renderEngine(); renderTheme(); renderReceivers(); });
  NX.on('arrival', d => {
    const kind = NX.S.mode === 'bh' ? 'crack' : NX.S.mode === 'three' ? 'shear' : 'crack';
    flash(d.ch, kind);
  });
  NX.on('fps', f => { $('#sbFps').textContent = 'FPS ' + f; });
  NX.on('inject', () => toast('已注入一次局部视觉能量'));

  setInterval(tickUptime, 1000);
  setInterval(() => { if (!S.online) renderReceivers(); }, 1200);
  NX.start();
})();
