import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/authContext';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signUp(email, password);
      navigate('/recordings');
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const lower = raw.toLowerCase();
      if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
        setError('Cannot reach the API server at ' + (import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000') + '. Is the backend running?');
      } else if (raw.includes('409') || lower.includes('already')) {
        setError('An account with this email already exists.');
      } else {
        // Try to pull a clean message out of a FastAPI {"detail":"..."} body.
        let detail = raw;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.detail) detail = String(parsed.detail);
        } catch { /* not JSON */ }
        setError(detail || 'Signup failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo">&#9835;</span>
          <h1>Create account</h1>
          <p>Start capturing your meeting insights</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="form-error">{error}</div>}
          <label className="form-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </label>
          <label className="form-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
