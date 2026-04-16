import { useState } from 'react';
import { useAuth } from '../lib/authContext';
import { getToken } from '../lib/authClient';

type JwtPayload = {
  email?: string;
  sub?: string;
  [key: string]: unknown;
};

function decodeJwtPayload(token: string | null): JwtPayload | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '==='.slice((base64.length + 3) % 4);
    const payload = atob(padded);
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const payload = decodeJwtPayload(getToken());
  const email = (typeof payload?.email === 'string' && payload.email) || '—';
  const userId = user?.user_id ?? '—';

  const handleCopy = async () => {
    if (!user?.user_id) return;
    try {
      await navigator.clipboard.writeText(user.user_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div className="profile-page">
      <div className="dashboard-header">
        <div>
          <h1>Profile</h1>
          <p className="subtitle">
            Your account and the EchoNotes companion extension.
          </p>
        </div>
      </div>

      <div className="profile-card">
        <h2>Account</h2>
        <div className="profile-field">
          <span className="profile-field-label">Email</span>
          <span className="profile-field-value">{email}</span>
        </div>
        <div className="profile-field">
          <span className="profile-field-label">User ID</span>
          <div className="profile-uuid-row">
            <code className="profile-uuid">{userId}</code>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={handleCopy}
              disabled={!user?.user_id}
              aria-label="Copy user ID"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        {error && <div className="form-error">{error}</div>}
      </div>

      <div className="profile-card profile-extension-cta">
        <h2>EchoNotes Recorder</h2>
        <p className="profile-extension-desc">
          Record audio from any Chrome tab and upload straight to your
          EchoNotes library — no more switching windows between your meeting
          and the uploader.
        </p>
        {/* TODO extension URL: replace with the real Chrome Web Store listing once the extension is published. */}
        <a
          href="https://chromewebstore.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <line x1="21.17" y1="8" x2="12" y2="8" />
            <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
            <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
          </svg>
          View in Chrome Web Store
        </a>
        <p className="profile-extension-note">
          Coming soon — the extension is not yet published.
        </p>
      </div>
    </div>
  );
}
