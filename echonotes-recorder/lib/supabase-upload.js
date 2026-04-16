// EchoNotes Recorder — backend upload helper.
//
// Routes recordings through the EchoNotes FastAPI backend's POST /audio/upload
// endpoint instead of writing directly to Supabase Storage + the audio_files
// table. The backend:
//   - authenticates the user via a Supabase JWT (Bearer token);
//   - uses its service_role key to INSERT the audio_files row (bypassing RLS);
//   - normalises the MIME type (video/webm -> audio/webm) so <audio> plays it;
//   - uses a UUID-prefixed storage path and records it in the audio_files row,
//     so the web app's realtime subscription picks it up seamlessly.
//
// Why the switch: after tightening row-level security on audio_files (SELECT
// only, no anon INSERT), direct REST inserts started failing with Postgres
// 42501. Going through the backend is the canonical path and mirrors exactly
// what the web app's drag-and-drop uploader does.
//
// Auth model: the extension stores the user's EchoNotes email + password in
// `chrome.storage.sync` (configured on the options page). On every upload we
// fetch a fresh access token via POST /auth/login and immediately exchange it
// for the upload. The token itself is never persisted in extension storage.

const LOGIN_PATH = '/auth/login';
const UPLOAD_PATH = '/audio/upload';

/**
 * Upload a recorded blob to EchoNotes via the FastAPI backend.
 *
 * @param {object} opts
 * @param {Blob}   opts.blob                 — the recorded audio
 * @param {string} opts.filename             — display name, e.g. echonotes-recording-2026-04-15-063000.webm
 * @param {number} [opts.durationSeconds]    — optional, recorded duration in seconds (not yet persisted by the backend)
 * @param {string} opts.apiBaseUrl           — e.g. http://127.0.0.1:8000 or https://api.echonotes.app
 * @param {string} opts.email                — EchoNotes account email
 * @param {string} opts.password             — EchoNotes account password
 * @param {(loaded:number,total:number)=>void} [opts.onProgress]
 * @returns {Promise<{id:string, record:object, filename:string}>}
 */
export async function uploadToEchoNotes({
  blob,
  filename,
  apiBaseUrl,
  email,
  password,
  onProgress = () => {},
}) {
  if (!blob) throw new Error('No blob to upload.');
  if (!apiBaseUrl) throw new Error('Missing EchoNotes API URL. Set it in the extension options.');
  if (!email || !password) {
    throw new Error('Missing EchoNotes credentials. Set your email and password in the extension options.');
  }

  const baseUrl = apiBaseUrl.replace(/\/+$/, '');

  // 1. Fetch a fresh access token. Short-lived (one hour) Supabase JWT.
  const token = await login(baseUrl, email, password);

  // 2. POST the blob as multipart/form-data, exactly like the drag-and-drop
  //    uploader does in the frontend.
  const uploadUrl = `${baseUrl}${UPLOAD_PATH}`;
  const record = await uploadWithProgress(uploadUrl, blob, filename, token, onProgress);

  return {
    id: record?.id || null,
    record,
    filename: record?.filename || filename,
  };
}

async function login(baseUrl, email, password) {
  let res;
  try {
    res = await fetch(`${baseUrl}${LOGIN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    throw new Error(`Cannot reach EchoNotes API at ${baseUrl}. ${err.message}`);
  }
  if (res.status === 401) {
    throw new Error('Login failed: email or password is wrong.');
  }
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await safeText(res)}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) {
    throw new Error('Login succeeded but no access_token returned.');
  }
  return data.access_token;
}

function uploadWithProgress(url, blob, filename, token, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // Wrap the blob in a File so the backend sees a real filename. The
    // backend's MIME allowlist checks both content_type and the filename
    // extension, and normalises video/webm -> audio/webm automatically.
    const file = new File([blob], filename, { type: blob.type || 'audio/webm' });
    form.append('file', file, filename);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // Do NOT set Content-Type manually — the browser fills in the multipart
    // boundary when we pass a FormData body.

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        try { onProgress(e.loaded, e.total); } catch {}
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          reject(new Error(`Upload succeeded but response was not JSON: ${err.message}`));
        }
      } else {
        reject(new Error(
          `Upload failed: ${xhr.status} ${safeXhrText(xhr)}`,
        ));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out.'));

    xhr.send(form);
  });
}

function safeXhrText(xhr) {
  try {
    if (!xhr.responseText) return xhr.statusText || '(no body)';
    // FastAPI errors look like {"detail":"..."}; pull out detail for nicer UX.
    try {
      const parsed = JSON.parse(xhr.responseText);
      if (parsed && parsed.detail) return String(parsed.detail);
    } catch {}
    return xhr.responseText.slice(0, 300);
  } catch {
    return '(no body)';
  }
}

async function safeText(res) {
  try { return await res.text(); } catch { return '(no body)'; }
}

/**
 * Quick credential test — used by the options page to verify API URL + login.
 *
 * Hits GET `${apiBaseUrl}/health` first so wrong URLs fail fast with a clear
 * error, then tries `POST /auth/login` so wrong passwords also fail fast.
 */
export async function testConnection({ apiBaseUrl, email, password }) {
  if (!apiBaseUrl) return { ok: false, error: 'Missing EchoNotes API URL.' };
  if (!email)      return { ok: false, error: 'Missing email.' };
  if (!password)   return { ok: false, error: 'Missing password.' };

  const baseUrl = apiBaseUrl.replace(/\/+$/, '');

  // Step 1: backend reachable?
  try {
    const res = await fetch(`${baseUrl}/health`, { method: 'GET' });
    if (!res.ok) {
      return { ok: false, error: `Health check failed: ${res.status} ${res.statusText}` };
    }
  } catch (err) {
    return { ok: false, error: `Cannot reach ${baseUrl} — ${err.message}` };
  }

  // Step 2: credentials valid?
  try {
    await login(baseUrl, email, password);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
