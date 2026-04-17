// EchoNotes Recorder — offscreen document
// The ONLY place MediaRecorder can run in MV3. Handles the MediaStream,
// AudioContext analysis, the recorded Blob, download, and Supabase upload.

let mediaRecorder = null;
let mediaStream = null;        // tab capture stream
let micStream = null;          // optional microphone stream
let audioContext = null;
let analyser = null;
let sourceNode = null;         // tab -> destination + mixed destination
let micSourceNode = null;      // mic -> mixed destination only (no playback to avoid echo)
let mixedDestination = null;   // MediaStreamAudioDestinationNode the recorder + analyser consume
let chunks = [];
let recordingStartMs = 0;
let pausedMs = 0;
let pauseStartMs = 0;
let waveformTimer = null;

let recordedBlob = null;
let recordedDurationMs = 0;

// --- Message entry ------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return false;
  handle(msg).then(sendResponse).catch((err) => {
    console.error('[EchoNotes OS]', msg.type, err);
    sendResponse({ ok: false, error: err.message || String(err) });
  });
  return true; // async
});

async function handle(msg) {
  switch (msg.type) {
    case 'START':    return startCapture(msg.streamId, !!msg.withMic);
    case 'PAUSE':    return pause();
    case 'RESUME':   return resume();
    case 'STOP':     return stop();
    case 'DISCARD':  return discard();
    case 'DOWNLOAD': return download(msg.filename);
    case 'UPLOAD':
      return upload(msg.filename, {
        apiBaseUrl: msg.apiBaseUrl,
        email: msg.email,
        password: msg.password,
      });
    default:         return { ok: false, error: `Unknown offscreen type: ${msg.type}` };
  }
}

// --- Start --------------------------------------------------------------
async function startCapture(streamId, withMic) {
  if (mediaRecorder) return { ok: false, error: 'Already recording.' };
  if (!streamId) return { ok: false, error: 'Missing streamId.' };

  // 1. Acquire tab audio (always required).
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });
  } catch (err) {
    return { ok: false, error: `getUserMedia failed: ${err.message}` };
  }

  // 2. Optionally acquire microphone audio. Failure here is non-fatal — fall
  //    back to tab-only and report the reason so the popup can show a notice.
  let micWarning = null;
  if (withMic) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch (err) {
      micStream = null;
      micWarning = `Microphone unavailable (${err.name || 'error'}). Recording tab audio only.`;
    }
  }

  // 3. Build the audio graph.
  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  // Tab audio -> speakers, so the user still hears the meeting.
  sourceNode.connect(audioContext.destination);

  // Recorder consumes the mixed destination. We always go through it so the
  // recording path is uniform whether mic is on or off.
  mixedDestination = audioContext.createMediaStreamDestination();
  sourceNode.connect(mixedDestination);

  if (micStream) {
    micSourceNode = audioContext.createMediaStreamSource(micStream);
    // Mic -> mixed destination ONLY. Do NOT connect to audioContext.destination
    // or the user will hear themselves echoed and feedback-loop the meeting.
    micSourceNode.connect(mixedDestination);
  }

  // Analyser taps the mixed stream so the waveform reflects what's actually
  // being recorded (tab + mic together when mic is on).
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.55;
  const analyserSource = audioContext.createMediaStreamSource(mixedDestination.stream);
  analyserSource.connect(analyser);

  // 4. Read quality preference.
  let bitrate = 128000;
  try {
    const { audioQuality } = await chrome.storage.sync.get('audioQuality');
    if (audioQuality === 'high') bitrate = 256000;
  } catch {}

  // 5. Build MediaRecorder on the mixed stream.
  try {
    mediaRecorder = new MediaRecorder(mixedDestination.stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: bitrate,
    });
  } catch (err) {
    cleanupAudio();
    return { ok: false, error: `MediaRecorder init failed: ${err.message}` };
  }

  chunks = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  mediaRecorder.onerror = (e) => {
    chrome.runtime.sendMessage({
      target: 'sw',
      type: 'OFFSCREEN_ERROR',
      error: String(e.error?.message || e.error || e),
    }).catch(() => {});
  };

  mediaRecorder.start(1000); // 1s chunks
  recordingStartMs = Date.now();
  pausedMs = 0;
  pauseStartMs = 0;
  startWaveform();
  return { ok: true, micActive: !!micStream, micWarning };
}

// --- Waveform streaming -------------------------------------------------
function startWaveform() {
  stopWaveform();
  const bufferLength = analyser.fftSize;
  const dataArray = new Uint8Array(bufferLength);
  const OUT_SAMPLES = 64;
  const step = Math.max(1, Math.floor(bufferLength / OUT_SAMPLES));

  waveformTimer = setInterval(() => {
    if (!analyser) return;
    analyser.getByteTimeDomainData(dataArray);
    const samples = new Array(OUT_SAMPLES);
    let rmsSum = 0;
    for (let i = 0; i < OUT_SAMPLES; i++) {
      const v = dataArray[i * step] ?? 128;
      samples[i] = v;
      const n = (v - 128) / 128;
      rmsSum += n * n;
    }
    const rms = Math.sqrt(rmsSum / OUT_SAMPLES);
    chrome.runtime.sendMessage({
      target: 'sw',
      type: 'OFFSCREEN_WAVEFORM',
      samples,
      rms,
    }).catch(() => {});
  }, 33); // ~30fps
}

function stopWaveform() {
  if (waveformTimer) {
    clearInterval(waveformTimer);
    waveformTimer = null;
  }
}

// --- Pause / Resume -----------------------------------------------------
async function pause() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') {
    return { ok: false, error: 'Not recording.' };
  }
  mediaRecorder.pause();
  pauseStartMs = Date.now();
  stopWaveform();
  return { ok: true };
}

async function resume() {
  if (!mediaRecorder || mediaRecorder.state !== 'paused') {
    return { ok: false, error: 'Not paused.' };
  }
  mediaRecorder.resume();
  if (pauseStartMs) {
    pausedMs += Date.now() - pauseStartMs;
    pauseStartMs = 0;
  }
  startWaveform();
  return { ok: true };
}

// --- Stop ---------------------------------------------------------------
async function stop() {
  if (!mediaRecorder) return { ok: false, error: 'Nothing to stop.' };

  if (mediaRecorder.state === 'paused' && pauseStartMs) {
    pausedMs += Date.now() - pauseStartMs;
    pauseStartMs = 0;
  }

  stopWaveform();

  const durationMs = Math.max(0, Date.now() - recordingStartMs - pausedMs);

  await new Promise((resolve) => {
    mediaRecorder.onstop = () => resolve();
    try { mediaRecorder.stop(); } catch { resolve(); }
  });

  cleanupAudio();

  recordedBlob = new Blob(chunks, { type: 'audio/webm' });
  recordedDurationMs = durationMs;
  chunks = [];
  mediaRecorder = null;

  chrome.runtime.sendMessage({
    target: 'sw',
    type: 'OFFSCREEN_STOPPED',
    durationMs: recordedDurationMs,
    sizeBytes: recordedBlob.size,
  }).catch(() => {});

  return { ok: true, durationMs: recordedDurationMs, sizeBytes: recordedBlob.size };
}

function cleanupAudio() {
  if (mediaStream) {
    try { mediaStream.getTracks().forEach((t) => t.stop()); } catch {}
  }
  if (micStream) {
    try { micStream.getTracks().forEach((t) => t.stop()); } catch {}
  }
  if (sourceNode)       { try { sourceNode.disconnect(); }       catch {} }
  if (micSourceNode)    { try { micSourceNode.disconnect(); }    catch {} }
  if (mixedDestination) { try { mixedDestination.disconnect(); } catch {} }
  if (analyser)         { try { analyser.disconnect(); }         catch {} }
  if (audioContext && audioContext.state !== 'closed') {
    try { audioContext.close(); } catch {}
  }
  mediaStream = null;
  micStream = null;
  sourceNode = null;
  micSourceNode = null;
  mixedDestination = null;
  analyser = null;
  audioContext = null;
}

// --- Discard ------------------------------------------------------------
async function discard() {
  stopWaveform();
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch {}
  }
  cleanupAudio();
  chunks = [];
  recordedBlob = null;
  recordedDurationMs = 0;
  mediaRecorder = null;
  return { ok: true };
}

// --- Download -----------------------------------------------------------
// `chrome.downloads` is not exposed to offscreen documents in MV3 — only
// chrome.runtime / chrome.storage / chrome.i18n are. Offscreen IS a regular
// HTML page though, so we trigger the download with the standard
// `<a download>` pattern on a blob URL. Chrome's download shelf picks it up.
async function download(filename) {
  if (!recordedBlob) return { ok: false, error: 'No recording available.' };
  let url = null;
  try {
    url = URL.createObjectURL(recordedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    if (url) URL.revokeObjectURL(url);
    return { ok: false, error: err.message };
  }
  // Give Chrome a minute to finish reading the blob before revoking.
  setTimeout(() => { if (url) URL.revokeObjectURL(url); }, 60_000);
  return { ok: true, filename };
}

// --- Upload -------------------------------------------------------------
async function upload(filename, { apiBaseUrl, email, password }) {
  if (!recordedBlob) return { ok: false, error: 'No recording available.' };
  if (!apiBaseUrl || !email || !password) {
    return { ok: false, error: 'EchoNotes account not configured. Open the options page.' };
  }

  let uploadToEchoNotes;
  try {
    ({ uploadToEchoNotes } = await import('../lib/supabase-upload.js'));
  } catch (err) {
    return { ok: false, error: `Could not load upload helper: ${err.message}` };
  }

  try {
    const result = await uploadToEchoNotes({
      blob: recordedBlob,
      filename,
      durationSeconds: recordedDurationMs / 1000,
      apiBaseUrl,
      email,
      password,
      onProgress: (loaded, total) => {
        chrome.runtime.sendMessage({
          target: 'sw',
          type: 'OFFSCREEN_UPLOAD_PROGRESS',
          loaded,
          total,
        }).catch(() => {});
      },
    });
    chrome.runtime.sendMessage({
      target: 'sw',
      type: 'OFFSCREEN_UPLOAD_DONE',
      ok: true,
      recordId: result?.id || null,
    }).catch(() => {});
    return { ok: true, record: result?.record };
  } catch (err) {
    chrome.runtime.sendMessage({
      target: 'sw',
      type: 'OFFSCREEN_UPLOAD_DONE',
      ok: false,
      error: err.message,
    }).catch(() => {});
    return { ok: false, error: err.message };
  }
}
