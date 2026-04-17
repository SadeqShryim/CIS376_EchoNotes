// EchoNotes Recorder — service worker
// Orchestrates tab capture, owns recording state, relays messages.

const OFFSCREEN_URL = 'offscreen/offscreen.html';

const INITIAL_STATE = Object.freeze({
  recording: false,
  paused: false,
  saved: false,
  tabId: null,
  tabTitle: '',
  startTime: null,
  pauseStart: null,
  pausedMs: 0,
  error: null,
  uploadProgress: null,
  withMic: false,
});

let state = { ...INITIAL_STATE };

// --- State persistence (session storage survives SW restart) ------------
async function loadState() {
  try {
    const { recorderState } = await chrome.storage.session.get('recorderState');
    if (recorderState) state = { ...INITIAL_STATE, ...recorderState };
  } catch {}
  // After reload, the offscreen doc may be gone but state may still say
  // "recording". Reconcile so the UI doesn't show a phantom session.
  await reconcileState();
}
async function saveState() {
  try {
    await chrome.storage.session.set({ recorderState: state });
  } catch {}
}
function resetState() {
  state = { ...INITIAL_STATE };
  saveState();
}

// --- Offscreen doc management -------------------------------------------
async function hasOffscreen() {
  if (!chrome.runtime.getContexts) return false;
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Record tab audio via MediaRecorder for EchoNotes.',
  });
}

async function closeOffscreen() {
  if (await hasOffscreen()) {
    try { await chrome.offscreen.closeDocument(); } catch {}
  }
}

// --- Content script injection -------------------------------------------
// CSS lives inside the content script's Shadow DOM (fetched from the extension
// origin), so we only inject the JS here — no insertCSS needed.
async function injectOverlay(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content-script.js'],
    });
    return true;
  } catch (err) {
    console.error('[EchoNotes SW] Overlay injection failed:', err);
    return false;
  }
}

async function removeOverlay(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { target: 'cs', type: 'OVERLAY_REMOVE' });
  } catch {}
}

// --- Badge --------------------------------------------------------------
function setBadge({ recording, paused }) {
  if (recording && !paused) {
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
  } else if (recording && paused) {
    chrome.action.setBadgeText({ text: '||' });
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// --- Broadcast state ----------------------------------------------------
async function broadcastState() {
  // To popup / options / offscreen (whoever is listening)
  try { await chrome.runtime.sendMessage({ target: 'ui', type: 'STATE_UPDATE', state }); } catch {}
  // To content script
  if (state.tabId != null) {
    try { await chrome.tabs.sendMessage(state.tabId, { target: 'cs', type: 'STATE_UPDATE', state }); } catch {}
  }
}

// --- Commands -----------------------------------------------------------
async function startRecording({ withMic = false } = {}) {
  if (state.recording) return { ok: true, state };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { ok: false, error: 'No active tab to record.' };
  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
    return { ok: false, error: 'Cannot record browser internal pages. Switch to a regular tab.' };
  }

  let streamId;
  try {
    streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
        const err = chrome.runtime.lastError;
        if (err || !id) reject(new Error(err?.message || 'No stream id returned'));
        else resolve(id);
      });
    });
  } catch (err) {
    return { ok: false, error: `Tab capture failed: ${err.message}` };
  }

  await ensureOffscreen();

  let offscreenResp;
  try {
    offscreenResp = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'START',
      streamId,
      withMic,
    });
  } catch (err) {
    await closeOffscreen();
    return { ok: false, error: `Offscreen did not respond: ${err.message}` };
  }
  if (!offscreenResp || !offscreenResp.ok) {
    await closeOffscreen();
    return { ok: false, error: offscreenResp?.error || 'Offscreen start failed.' };
  }

  state = {
    ...INITIAL_STATE,
    recording: true,
    tabId: tab.id,
    tabTitle: tab.title || '(untitled)',
    startTime: Date.now(),
    withMic,
  };
  await saveState();
  setBadge({ recording: true, paused: false });

  await injectOverlay(tab.id);
  // Give the content script a beat to attach listeners
  setTimeout(() => { broadcastState(); }, 150);
  broadcastState();

  return { ok: true, state };
}

async function stopRecording() {
  if (!state.recording) return { ok: true, state };

  if (state.paused && state.pauseStart) {
    state.pausedMs += Date.now() - state.pauseStart;
    state.pauseStart = null;
  }

  try {
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP' });
  } catch {}

  state.recording = false;
  state.paused = false;
  state.saved = true;
  await saveState();
  setBadge({ recording: false, paused: false });
  broadcastState();
  return { ok: true, state };
}

async function pauseRecording() {
  if (!state.recording || state.paused) return { ok: true, state };
  try { await chrome.runtime.sendMessage({ target: 'offscreen', type: 'PAUSE' }); } catch {}
  state.paused = true;
  state.pauseStart = Date.now();
  await saveState();
  setBadge({ recording: true, paused: true });
  broadcastState();
  return { ok: true, state };
}

async function resumeRecording() {
  if (!state.recording || !state.paused) return { ok: true, state };
  try { await chrome.runtime.sendMessage({ target: 'offscreen', type: 'RESUME' }); } catch {}
  if (state.pauseStart) {
    state.pausedMs += Date.now() - state.pauseStart;
    state.pauseStart = null;
  }
  state.paused = false;
  await saveState();
  setBadge({ recording: true, paused: false });
  broadcastState();
  return { ok: true, state };
}

async function discardAndCleanup() {
  const tabId = state.tabId;
  try { await chrome.runtime.sendMessage({ target: 'offscreen', type: 'DISCARD' }); } catch {}
  await closeOffscreen();
  if (tabId != null) await removeOverlay(tabId);
  resetState();
  setBadge({ recording: false, paused: false });
  broadcastState();
  return { ok: true };
}

async function finishAndCleanup() {
  const tabId = state.tabId;
  await closeOffscreen();
  if (tabId != null) await removeOverlay(tabId);
  resetState();
  setBadge({ recording: false, paused: false });
  broadcastState();
  return { ok: true };
}

async function handleDownload() {
  if (!state.saved) return { ok: false, error: 'No recording to download.' };
  const filename = timestampedFilename();
  let resp;
  try {
    resp = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'DOWNLOAD', filename });
  } catch (err) {
    return { ok: false, error: err.message };
  }
  return resp || { ok: false, error: 'No response from offscreen.' };
}

async function handleUpload() {
  if (!state.saved) return { ok: false, error: 'No recording to upload.' };
  const { apiBaseUrl, email, password } = await chrome.storage.sync.get([
    'apiBaseUrl',
    'email',
    'password',
  ]);
  if (!apiBaseUrl || !email || !password) {
    return { ok: false, error: 'EchoNotes account not configured. Open the options page.' };
  }
  const filename = timestampedFilename();
  try {
    return await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'UPLOAD',
      filename,
      apiBaseUrl,
      email,
      password,
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function timestampedFilename() {
  const d = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `echonotes-recording-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.webm`;
}

// --- Message routing ----------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'sw') return false;

  (async () => {
    try {
      switch (msg.type) {
        case 'GET_STATE':
          sendResponse({ ok: true, state });
          return;

        case 'START':
          sendResponse(await startRecording({ withMic: !!msg.withMic }));
          return;
        case 'STOP':
          sendResponse(await stopRecording());
          return;
        case 'PAUSE':
          sendResponse(await pauseRecording());
          return;
        case 'RESUME':
          sendResponse(await resumeRecording());
          return;
        case 'DISCARD':
          sendResponse(await discardAndCleanup());
          return;
        case 'DOWNLOAD':
          sendResponse(await handleDownload());
          return;
        case 'UPLOAD':
          sendResponse(await handleUpload());
          return;
        case 'DISMISS':
          // User closed the save panel without saving — same as finish+cleanup
          sendResponse(await finishAndCleanup());
          return;

        // --- Offscreen -> SW relays -----
        case 'OFFSCREEN_WAVEFORM':
          if (state.tabId != null) {
            chrome.tabs.sendMessage(state.tabId, {
              target: 'cs',
              type: 'WAVEFORM_UPDATE',
              samples: msg.samples,
              rms: msg.rms,
            }).catch(() => {});
          }
          sendResponse({ ok: true });
          return;

        case 'OFFSCREEN_STOPPED':
          state.savedDurationMs = msg.durationMs;
          state.savedSizeBytes = msg.sizeBytes;
          await saveState();
          if (state.tabId != null) {
            chrome.tabs.sendMessage(state.tabId, {
              target: 'cs',
              type: 'SAVED_READY',
              durationMs: msg.durationMs,
              sizeBytes: msg.sizeBytes,
            }).catch(() => {});
          }
          try { await chrome.runtime.sendMessage({ target: 'ui', type: 'SAVED_READY', state }); } catch {}
          sendResponse({ ok: true });
          return;

        case 'OFFSCREEN_UPLOAD_PROGRESS':
          state.uploadProgress = { loaded: msg.loaded, total: msg.total };
          await saveState();
          if (state.tabId != null) {
            chrome.tabs.sendMessage(state.tabId, {
              target: 'cs',
              type: 'UPLOAD_PROGRESS',
              loaded: msg.loaded,
              total: msg.total,
            }).catch(() => {});
          }
          sendResponse({ ok: true });
          return;

        case 'OFFSCREEN_UPLOAD_DONE':
          state.uploadProgress = null;
          await saveState();
          if (state.tabId != null) {
            chrome.tabs.sendMessage(state.tabId, {
              target: 'cs',
              type: 'UPLOAD_DONE',
              ok: msg.ok,
              error: msg.error,
              recordId: msg.recordId,
            }).catch(() => {});
          }
          sendResponse({ ok: true });
          return;

        case 'OFFSCREEN_ERROR':
          state.error = msg.error;
          await saveState();
          broadcastState();
          sendResponse({ ok: true });
          return;

        default:
          sendResponse({ ok: false, error: `Unknown sw message type: ${msg.type}` });
      }
    } catch (err) {
      console.error('[EchoNotes SW] handler error', err);
      try { sendResponse({ ok: false, error: err.message }); } catch {}
    }
  })();
  return true; // async
});

// --- Tab lifecycle handlers ---------------------------------------------
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (state.recording && state.tabId === tabId) {
    console.log('[EchoNotes SW] Recorded tab closed — force-stopping.');
    await stopRecording();
    // Tab is gone; offscreen still has blob. Auto-download as safety net.
    await handleDownload();
    await finishAndCleanup();
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (state.tabId !== tabId) return;
  if (!state.recording && !state.saved) return;

  if (changeInfo.url) {
    // Hard navigation — tab capture stream is likely lost. Stop gracefully,
    // then re-inject the overlay on the new page so the user sees the save UI.
    console.log('[EchoNotes SW] Recorded tab navigated — force-stopping.');
    await stopRecording();
    setTimeout(() => { injectOverlay(tabId).then(broadcastState); }, 800);
    return;
  }

  // Pure refresh (status → complete with no URL change): the content script
  // overlay was blown away but tab capture is still flowing. Re-inject.
  if (changeInfo.status === 'complete' && state.recording) {
    console.log('[EchoNotes SW] Recorded tab reloaded — re-injecting overlay.');
    await injectOverlay(tabId);
    broadcastState();
  }
});

// Sanity: if the SW wakes up thinking it's recording but the offscreen doc
// is gone, reset state. This happens after a long idle + SW eviction.
async function reconcileState() {
  if (!state.recording) return;
  if (!(await hasOffscreen())) {
    console.warn('[EchoNotes SW] Recording state orphaned (offscreen gone). Resetting.');
    resetState();
    setBadge({ recording: false, paused: false });
    broadcastState();
  }
}

// --- Init ---------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  resetState();
  setBadge({ recording: false, paused: false });
});
chrome.runtime.onStartup.addListener(() => { loadState(); });
loadState();
