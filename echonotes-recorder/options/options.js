// EchoNotes Recorder — options page.
//
// Configure the EchoNotes backend URL + account credentials. Uploads go
// through POST /audio/upload on the backend (which holds the service_role
// key server-side), so the extension only needs to authenticate as a normal
// user — no Supabase anon/service keys live in extension storage.

import { testConnection } from '../lib/supabase-upload.js';

const $ = (id) => document.getElementById(id);

const els = {
  apiBase: $('api-base-url'),
  email: $('account-email'),
  password: $('account-password'),
  togglePassword: $('toggle-password'),
  quality: $('audio-quality'),
  includeMic: $('default-include-mic'),
  testBtn: $('test-btn'),
  testResult: $('test-result'),
  saveBtn: $('save-btn'),
  saveStatus: $('save-status'),
};

const DEFAULTS = Object.freeze({
  apiBaseUrl: 'http://127.0.0.1:8000',
  email: '',
  password: '',
  defaultSaveAction: 'ask',
  audioQuality: 'standard',
  defaultIncludeMic: false,
});

async function load() {
  let stored = {};
  try {
    if (globalThis.chrome && chrome.storage && chrome.storage.sync) {
      stored = await chrome.storage.sync.get(Object.keys(DEFAULTS));
    }
  } catch (err) {
    console.warn('[EchoNotes options] Could not load settings:', err);
  }
  const merged = { ...DEFAULTS, ...stored };
  els.apiBase.value = merged.apiBaseUrl;
  els.email.value = merged.email;
  els.password.value = merged.password;
  els.quality.value = merged.audioQuality;
  els.includeMic.checked = !!merged.defaultIncludeMic;
  const radio = document.querySelector(`input[name="save-action"][value="${merged.defaultSaveAction}"]`);
  if (radio) radio.checked = true;
  else document.querySelector('input[name="save-action"][value="ask"]').checked = true;
}

function readForm() {
  const radio = document.querySelector('input[name="save-action"]:checked');
  return {
    apiBaseUrl: els.apiBase.value.trim(),
    email: els.email.value.trim(),
    password: els.password.value,
    defaultSaveAction: radio ? radio.value : 'ask',
    audioQuality: els.quality.value || 'standard',
    defaultIncludeMic: els.includeMic.checked,
  };
}

async function save() {
  const values = readForm();
  els.saveBtn.disabled = true;
  const origText = els.saveBtn.textContent;
  els.saveBtn.textContent = 'Saving…';
  try {
    await chrome.storage.sync.set(values);
    showSaveStatus('Saved.', 'ok');
  } catch (err) {
    showSaveStatus(`Save failed: ${err.message}`, 'err');
  } finally {
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = origText;
  }
}

function showSaveStatus(text, kind) {
  els.saveStatus.hidden = false;
  els.saveStatus.textContent = text;
  els.saveStatus.classList.remove('ok', 'err');
  els.saveStatus.classList.add(kind);
  setTimeout(() => { els.saveStatus.hidden = true; }, 3500);
}

async function runTest() {
  const values = readForm();
  els.testBtn.disabled = true;
  els.testResult.hidden = false;
  els.testResult.classList.remove('ok', 'err');
  els.testResult.textContent = 'Testing…';
  const resp = await testConnection({
    apiBaseUrl: values.apiBaseUrl,
    email: values.email,
    password: values.password,
  });
  els.testBtn.disabled = false;
  if (resp.ok) {
    els.testResult.classList.add('ok');
    els.testResult.textContent = '✓ Connected, login OK';
  } else {
    els.testResult.classList.add('err');
    els.testResult.textContent = `✗ ${resp.error || 'Connection failed'}`;
  }
}

els.togglePassword.addEventListener('click', () => {
  const showing = els.password.type === 'text';
  els.password.type = showing ? 'password' : 'text';
  els.togglePassword.textContent = showing ? 'Show' : 'Hide';
});

els.testBtn.addEventListener('click', runTest);
els.saveBtn.addEventListener('click', save);

// Save on Ctrl/Cmd+S while focus is in the form.
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save();
  }
});

load();
