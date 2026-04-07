import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/authContext';

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-inner">
          <a href="/dashboard" className="logo-link" onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }}>
            <span className="logo-icon">&#9835;</span>
            <span className="logo-text">EchoNotes</span>
          </a>
          {user && (
            <button className="btn-ghost" onClick={handleLogout}>
              Sign out
            </button>
          )}
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
