// EchoNotes Recorder — content script (overlay UI).
// Builds a floating badge + expandable side panel inside a Shadow DOM so the
// page's CSS cannot leak in. All communication with the service worker uses
// `{ target: 'sw', type: ... }` messages.

(() => {
  if (window.__echonotesRecorderLoaded) {
    if (typeof window.__echonotesRecorderRefresh === 'function') {
      window.__echonotesRecorderRefresh();
    }
    return;
  }
  window.__echonotesRecorderLoaded = true;

  const HOST_ID = 'echonotes-recorder-host';
  const POS_KEY = 'echonotes_badge_pos';
  const MIC_RMS_THRESHOLD = 0.02;
  const VIEWPORT_MARGIN = 8;

  let swState = null;
  let timerInterval = null;
  let badgePos = null;
  let dragging = false;
  let dragStarted = false;
  let dragOffset = { x: 0, y: 0 };
  let downX = 0, downY = 0;
  let panelOpen = false;
  let wfCtx = null;
  let wfSamples = new Array(64).fill(128);
  let wfAnimFrame = null;

  // --- Build host + Shadow DOM ------------------------------------------
  const existing = document.getElementById(HOST_ID);
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-echonotes', 'recorder');
  // Host is positioned at 0,0 with no size — children use position:fixed
  Object.assign(host.style, {
    all: 'initial',
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    pointerEvents: 'none',
    zIndex: '2147483647',
  });
  (document.documentElement || document.body).appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  // Inline critical styles so the badge never flashes unstyled before the
  // full stylesheet loads.
  const boot = document.createElement('style');
  boot.textContent = `
    :host { all: initial; display: block; pointer-events: none; }
    .badge, .panel { pointer-events: auto; }
    .badge {
      position: fixed; top: 20px; right: 20px;
      padding: 9px 14px; display: flex; align-items: center; gap: 8px;
      background: rgba(220,38,38,0.18); color: #fecaca;
      border: 1px solid rgba(239,68,68,.4); border-radius: 999px;
      font: 600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      user-select: none; cursor: grab;
      box-shadow: 0 0 22px rgba(220,38,38,.4);
    }
    .badge .badge-dot {
      width: 9px; height: 9px; border-radius: 50%; background: #ef4444;
    }
    .panel {
      position: fixed; top: 0; right: 0; bottom: 0; width: 340px;
      background: rgba(12,12,14,.9); color: #f3f4f6;
      transform: translateX(100%); transition: transform 300ms ease;
      overflow-y: auto; padding: 20px;
    }
    .panel.open { transform: translateX(0); }
    [hidden] { display: none !important; }
  `;
  shadow.appendChild(boot);

  // Build DOM.
  const frag = document.createElement('div');
  frag.innerHTML = `
    <div class="badge" id="badge" role="button" tabindex="0" aria-label="EchoNotes recording — click to open panel">
      <span class="badge-dot"></span>
      <span class="badge-time" id="badge-time">00:00</span>
    </div>
    <aside class="panel" id="panel" aria-label="EchoNotes Recorder">
      <header class="panel-header">
        <div class="panel-title">
          <span class="panel-title-dot"></span>
          <span>EchoNotes Recorder</span>
        </div>
        <button class="close" id="close" type="button" aria-label="Close panel">&times;</button>
      </header>

      <div class="status" id="status">
        <span class="pulse"></span>
        <span id="status-text">Recording</span>
        <span class="tab-name" id="tab-name"></span>
      </div>

      <div class="timer-big" id="timer-big">00:00:00</div>

      <div class="waveform-wrap" id="waveform-wrap">
        <canvas class="waveform" id="waveform" width="580" height="160"></canvas>
        <div class="mic" id="mic">
          <span class="mic-dot"></span>
          <span class="mic-text" id="mic-text">No input</span>
        </div>
      </div>

      <div class="controls" id="controls">
        <button class="btn btn-pause" id="pause" type="button">Pause</button>
        <button class="btn btn-stop" id="stop" type="button">Stop</button>
        <button class="btn btn-discard" id="discard" type="button">Discard</button>
      </div>

      <div class="save" id="save" hidden>
        <p class="save-title">Recording saved</p>
        <p class="save-info" id="save-info">—</p>
        <button class="btn btn-download" id="download" type="button">Download .webm</button>
        <button class="btn btn-upload" id="upload" type="button">Upload to EchoNotes</button>
        <div class="upload-progress" id="upload-progress" hidden>
          <div class="upload-bar" id="upload-bar"></div>
          <p class="upload-text" id="upload-text">Uploading&hellip;</p>
        </div>
        <p class="save-error" id="save-error" hidden></p>
        <p class="save-success" id="save-success" hidden>&#10003; Uploaded</p>
        <button class="btn btn-dismiss" id="dismiss" type="button">Dismiss</button>
      </div>
    </aside>
  `;
  while (frag.firstChild) shadow.appendChild(frag.firstChild);

  const $id = (id) => shadow.getElementById(id);

  // Fetch full stylesheet.
  (async () => {
    try {
      const url = chrome.runtime.getURL('content/content-script.css');
      const res = await fetch(url);
      const css = await res.text();
      const style = document.createElement('style');
      style.textContent = css;
      shadow.appendChild(style);
    } catch (err) {
      console.warn('[EchoNotes CS] Could not load full stylesheet:', err);
    }
  })();

  // --- Helpers ----------------------------------------------------------
  function pad(n) { return n.toString().padStart(2, '0'); }

  function formatTime(ms, longForm = false) {
    ms = Math.max(0, ms);
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (longForm) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function computeElapsedMs(s = swState) {
    if (!s || !s.startTime) return 0;
    let paused = s.pausedMs || 0;
    if (s.paused && s.pauseStart) paused += Date.now() - s.pauseStart;
    return Date.now() - s.startTime - paused;
  }

  function send(type, extra) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ target: 'sw', type, ...extra }, (resp) => {
          void chrome.runtime.lastError;
          resolve(resp || null);
        });
      } catch (err) {
        resolve({ ok: false, error: err.message });
      }
    });
  }

  // --- Render -----------------------------------------------------------
  function render(state) {
    if (state) swState = state;
    const s = swState;
    if (!s) return;

    const badge = $id('badge');
    badge.classList.toggle('paused', !!s.paused);

    const status = $id('status');
    status.classList.remove('paused', 'saved');
    if (s.saved) {
      status.classList.add('saved');
      $id('status-text').textContent = 'Saved';
    } else if (s.paused) {
      status.classList.add('paused');
      $id('status-text').textContent = 'Paused';
    } else if (s.recording) {
      $id('status-text').textContent = 'Recording';
    } else {
      $id('status-text').textContent = 'Idle';
    }
    $id('tab-name').textContent = s.tabTitle ? `· ${String(s.tabTitle).slice(0, 32)}` : '';

    const elapsed = computeElapsedMs(s);
    $id('badge-time').textContent = formatTime(elapsed);
    $id('timer-big').textContent = formatTime(elapsed, true);

    const showSave = !!s.saved;
    $id('controls').hidden = showSave;
    $id('waveform-wrap').hidden = showSave;
    $id('save').hidden = !showSave;

    if (showSave) {
      const dur = s.savedDurationMs != null ? formatTime(s.savedDurationMs, true) : '—';
      const mb = s.savedSizeBytes != null ? (s.savedSizeBytes / (1024 * 1024)).toFixed(2) : '?';
      $id('save-info').textContent = `${dur} · ${mb} MB`;
    }

    const pauseBtn = $id('pause');
    if (s.paused) {
      pauseBtn.textContent = 'Resume';
      pauseBtn.classList.add('is-resume');
    } else {
      pauseBtn.textContent = 'Pause';
      pauseBtn.classList.remove('is-resume');
    }

    if (!s.recording && !s.saved) {
      badge.classList.add('hidden');
      closePanel();
    } else {
      badge.classList.remove('hidden');
    }

    if (s.error && showSave) {
      $id('save-error').hidden = false;
      $id('save-error').textContent = s.error;
    }
  }

  window.__echonotesRecorderRefresh = async () => {
    const resp = await send('GET_STATE');
    if (resp && resp.state) render(resp.state);
  };

  // --- Timer loop -------------------------------------------------------
  function startTimerLoop() {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
      if (!swState || !swState.recording) return;
      const elapsed = computeElapsedMs();
      $id('badge-time').textContent = formatTime(elapsed);
      $id('timer-big').textContent = formatTime(elapsed, true);
    }, 250);
  }
  function stopTimerLoop() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  // --- Badge drag + click ----------------------------------------------
  (async () => {
    try {
      const data = await chrome.storage.local.get(POS_KEY);
      if (data && data[POS_KEY]) {
        badgePos = data[POS_KEY];
        applyBadgePosition();
      }
    } catch {}
  })();

  function applyBadgePosition() {
    if (!badgePos) return;
    const badge = $id('badge');
    badge.style.top = badgePos.y + 'px';
    badge.style.left = badgePos.x + 'px';
    badge.style.right = 'auto';
  }

  function clampBadgePosition() {
    if (!badgePos) return;
    const badge = $id('badge');
    const rect = badge.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - VIEWPORT_MARGIN;
    const maxY = window.innerHeight - rect.height - VIEWPORT_MARGIN;
    badgePos.x = Math.max(VIEWPORT_MARGIN, Math.min(maxX, badgePos.x));
    badgePos.y = Math.max(VIEWPORT_MARGIN, Math.min(maxY, badgePos.y));
    applyBadgePosition();
  }

  {
    const badge = $id('badge');

    badge.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      downX = e.clientX;
      downY = e.clientY;
      const rect = badge.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      dragStarted = false;
      dragging = true;
      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (!dragStarted && Math.hypot(dx, dy) > 4) {
        dragStarted = true;
        badge.classList.add('dragging');
        document.body && (document.body.style.userSelect = 'none');
      }
      if (dragStarted) {
        badgePos = {
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        };
        clampBadgePosition();
      }
    });

    window.addEventListener('mouseup', async () => {
      if (!dragging) return;
      const wasDrag = dragStarted;
      dragging = false;
      dragStarted = false;
      badge.classList.remove('dragging');
      if (document.body) document.body.style.userSelect = '';
      if (wasDrag) {
        try { await chrome.storage.local.set({ [POS_KEY]: badgePos }); } catch {}
      } else {
        openPanel();
      }
    });

    badge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPanel();
      }
    });

    window.addEventListener('resize', () => { if (badgePos) clampBadgePosition(); });
  }

  // --- Panel open/close -------------------------------------------------
  function openPanel() {
    panelOpen = true;
    $id('panel').classList.add('open');
    window.__echonotesRecorderRefresh();
  }
  function closePanel() {
    panelOpen = false;
    $id('panel').classList.remove('open');
  }

  $id('close').addEventListener('click', closePanel);

  // --- Control button handlers -----------------------------------------
  async function runBtn(btn, type, extra) {
    btn.disabled = true;
    const resp = await send(type, extra);
    btn.disabled = false;
    return resp;
  }

  $id('pause').addEventListener('click', async () => {
    const type = swState && swState.paused ? 'RESUME' : 'PAUSE';
    const resp = await runBtn($id('pause'), type);
    if (resp && resp.state) render(resp.state);
  });

  $id('stop').addEventListener('click', async () => {
    const resp = await runBtn($id('stop'), 'STOP');
    if (resp && resp.state) render(resp.state);
  });

  $id('discard').addEventListener('click', async () => {
    if (!confirm('Discard this recording? This cannot be undone.')) return;
    await runBtn($id('discard'), 'DISCARD');
  });

  $id('download').addEventListener('click', async () => {
    $id('save-error').hidden = true;
    $id('save-success').hidden = true;
    const resp = await runBtn($id('download'), 'DOWNLOAD');
    if (resp && !resp.ok) {
      $id('save-error').hidden = false;
      $id('save-error').textContent = resp.error || 'Download failed.';
    } else {
      $id('save-success').hidden = false;
      $id('save-success').textContent = '✓ Downloaded';
    }
  });

  $id('upload').addEventListener('click', async () => {
    $id('save-error').hidden = true;
    $id('save-success').hidden = true;
    $id('upload-progress').hidden = false;
    $id('upload-bar').style.setProperty('--progress', '0%');
    $id('upload-text').textContent = 'Uploading…';
    const resp = await runBtn($id('upload'), 'UPLOAD');
    if (!resp || !resp.ok) {
      $id('upload-progress').hidden = true;
      $id('save-error').hidden = false;
      $id('save-error').textContent = (resp && resp.error) || 'Upload failed.';
    }
    // Success is driven by UPLOAD_DONE relay from the service worker.
  });

  $id('dismiss').addEventListener('click', async () => {
    await send('DISMISS');
    // SW will follow up with OVERLAY_REMOVE → teardown()
  });

  // --- Waveform canvas --------------------------------------------------
  const canvas = $id('waveform');
  wfCtx = canvas.getContext('2d');

  function sizeCanvasToCSS() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 280;
    const h = rect.height || 80;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    wfCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas._cssW = w;
    canvas._cssH = h;
  }
  sizeCanvasToCSS();

  const resizeObserver = new ResizeObserver(() => {
    if (canvas.getBoundingClientRect().width) sizeCanvasToCSS();
  });
  resizeObserver.observe(canvas);

  function drawWaveform() {
    if (!wfCtx) return;
    const w = canvas._cssW || 280;
    const h = canvas._cssH || 80;
    wfCtx.clearRect(0, 0, w, h);

    // Subtle center baseline.
    wfCtx.strokeStyle = 'rgba(239, 68, 68, 0.12)';
    wfCtx.lineWidth = 1;
    wfCtx.beginPath();
    wfCtx.moveTo(0, h / 2);
    wfCtx.lineTo(w, h / 2);
    wfCtx.stroke();

    // Gradient waveform stroke.
    const grad = wfCtx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(239, 68, 68, 0.95)');
    grad.addColorStop(1, 'rgba(249, 115, 22, 0.95)');
    wfCtx.strokeStyle = grad;
    wfCtx.lineWidth = 2;
    wfCtx.lineJoin = 'round';
    wfCtx.lineCap = 'round';
    wfCtx.beginPath();

    const N = wfSamples.length;
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * w;
      const v = (wfSamples[i] - 128) / 128;
      const y = h / 2 + v * (h / 2 - 6);
      if (i === 0) wfCtx.moveTo(x, y);
      else wfCtx.lineTo(x, y);
    }
    wfCtx.stroke();
  }

  function wfTick() {
    drawWaveform();
    wfAnimFrame = requestAnimationFrame(wfTick);
  }
  wfTick();

  // --- Mic detection ----------------------------------------------------
  function updateMic(rms) {
    const mic = $id('mic');
    const active = rms > MIC_RMS_THRESHOLD;
    mic.classList.toggle('active', active);
    $id('mic-text').textContent = active ? 'Audio detected' : 'No input';
  }

  // --- Teardown ---------------------------------------------------------
  function teardown() {
    stopTimerLoop();
    if (wfAnimFrame) cancelAnimationFrame(wfAnimFrame);
    try { resizeObserver.disconnect(); } catch {}
    host.remove();
    window.__echonotesRecorderLoaded = false;
    window.__echonotesRecorderRefresh = null;
  }

  // --- Incoming messages from service worker ---------------------------
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.target !== 'cs') return;
    switch (msg.type) {
      case 'STATE_UPDATE':
        if (msg.state) render(msg.state);
        startTimerLoop();
        break;
      case 'WAVEFORM_UPDATE':
        if (Array.isArray(msg.samples)) wfSamples = msg.samples;
        if (typeof msg.rms === 'number') updateMic(msg.rms);
        break;
      case 'SAVED_READY':
        if (swState) {
          swState.saved = true;
          swState.recording = false;
          swState.paused = false;
          swState.savedDurationMs = msg.durationMs;
          swState.savedSizeBytes = msg.sizeBytes;
          render(swState);
        }
        openPanel();
        break;
      case 'UPLOAD_PROGRESS':
        if (msg.total > 0) {
          const pct = Math.floor((msg.loaded / msg.total) * 100);
          $id('upload-bar').style.setProperty('--progress', pct + '%');
          $id('upload-text').textContent = `Uploading… ${pct}%`;
        }
        break;
      case 'UPLOAD_DONE':
        $id('upload-progress').hidden = true;
        if (msg.ok) {
          $id('save-success').hidden = false;
          $id('save-success').textContent = '✓ Uploaded to EchoNotes';
        } else {
          $id('save-error').hidden = false;
          $id('save-error').textContent = msg.error || 'Upload failed.';
        }
        break;
      case 'OVERLAY_REMOVE':
        teardown();
        break;
    }
  });

  // --- Kick off ---------------------------------------------------------
  startTimerLoop();
  window.__echonotesRecorderRefresh();
})();
