// EchoNotes Recorder — popup script.

const $ = (id) => document.getElementById(id);

const views = {
  idle: $('idle-view'),
  recording: $('recording-view'),
  saved: $('saved-view'),
};

function show(viewName) {
  for (const [k, el] of Object.entries(views)) {
    el.hidden = k !== viewName;
  }
}

let currentState = null;
let timerInterval = null;

function formatTimer(ms) {
  ms = Math.max(0, ms);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function updateTimer() {
  if (!currentState || !currentState.startTime) {
    $('timer').textContent = '00:00';
    return;
  }
  let pausedMs = currentState.pausedMs || 0;
  if (currentState.paused && currentState.pauseStart) {
    pausedMs += Date.now() - currentState.pauseStart;
  }
  const elapsed = Date.now() - currentState.startTime - pausedMs;
  $('timer').textContent = formatTimer(elapsed);
}

function renderState(state) {
  currentState = state || { recording: false, paused: false, saved: false };

  if (currentState.error) {
    const view = currentState.saved ? 'saved-error' : 'idle-error';
    $(view).hidden = false;
    $(view).textContent = currentState.error;
  } else {
    $('idle-error').hidden = true;
    $('saved-error').hidden = true;
  }

  if (currentState.recording) {
    show('recording');
    const title = (currentState.tabTitle || 'current tab').slice(0, 48);
    $('tab-name').textContent = title;
    $('tab-name').title = currentState.tabTitle || '';
    $('rec-text').textContent = currentState.paused ? 'Paused' : 'Recording';
    $('pulse-dot').classList.toggle('paused', !!currentState.paused);
    if (!timerInterval) {
      timerInterval = setInterval(updateTimer, 250);
    }
    updateTimer();
  } else if (currentState.saved) {
    show('saved');
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  } else {
    show('idle');
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }
}

async function send(type, extra) {
  try {
    return await chrome.runtime.sendMessage({ target: 'sw', type, ...extra });
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

$('start-btn').addEventListener('click', async () => {
  $('idle-error').hidden = true;
  const btn = $('start-btn');
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'Starting…';
  const withMic = $('include-mic').checked;
  const resp = await send('START', { withMic });
  btn.disabled = false;
  btn.textContent = orig;
  if (!resp || !resp.ok) {
    $('idle-error').hidden = false;
    $('idle-error').textContent = (resp && resp.error) || 'Failed to start.';
    return;
  }
  if (resp.state) renderState(resp.state);
  if (resp.micWarning) {
    // Recording started, but mic was requested and unavailable. Show the
    // warning in the recording view briefly so the user knows.
    const warn = document.createElement('p');
    warn.className = 'hint small';
    warn.style.color = '#F59E0B';
    warn.textContent = resp.micWarning;
    $('recording-view').appendChild(warn);
    setTimeout(() => warn.remove(), 6000);
  }
});

$('stop-btn').addEventListener('click', async () => {
  const btn = $('stop-btn');
  btn.disabled = true;
  const resp = await send('STOP');
  btn.disabled = false;
  if (resp && resp.state) renderState(resp.state);
});

$('dismiss-btn').addEventListener('click', async () => {
  const resp = await send('DISMISS');
  if (resp && resp.ok) {
    renderState({ recording: false, paused: false, saved: false });
  }
});

$('options-link').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

if (globalThis.chrome && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.target !== 'ui') return;
    if ((msg.type === 'STATE_UPDATE' || msg.type === 'SAVED_READY') && msg.state) {
      renderState(msg.state);
    }
  });
}

// Initial state fetch
send('GET_STATE').then((resp) => {
  if (resp && resp.state) renderState(resp.state);
  else renderState({ recording: false, paused: false, saved: false });
});

// Initialize mic checkbox from user's saved default. Per-recording overrides
// are intentionally not persisted — the default wins on each popup open.
(async () => {
  try {
    if (!globalThis.chrome || !chrome.storage || !chrome.storage.sync) return;
    const { defaultIncludeMic } = await chrome.storage.sync.get('defaultIncludeMic');
    if (defaultIncludeMic) $('include-mic').checked = true;
  } catch {}
})();
