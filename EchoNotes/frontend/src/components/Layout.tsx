import { NavLink, Outlet, useNavigate } from 'react-router-dom';
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
          <a
            href="/recordings"
            className="logo-link"
            onClick={(e) => {
              e.preventDefault();
              navigate('/recordings');
            }}
          >
            <span className="logo-icon">&#9835;</span>
            <span className="logo-text">EchoNotes</span>
          </a>
          {user && (
            <button className="btn-ghost" onClick={handleLogout}>
              Sign out
            </button>
          )}
        </div>
        {user && (
          <nav className="tab-nav" aria-label="Primary">
            <div className="tab-nav-inner">
              <NavLink to="/upload" className="tab-nav-link">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Upload
              </NavLink>
              <NavLink to="/recordings" className="tab-nav-link">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
                Recordings
              </NavLink>
              <NavLink to="/notes" className="tab-nav-link">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                </svg>
                Notes
              </NavLink>
              <NavLink to="/profile" className="tab-nav-link">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Profile
              </NavLink>
            </div>
          </nav>
        )}
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
