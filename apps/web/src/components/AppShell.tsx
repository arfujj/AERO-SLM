import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

const navigation = [
  { to: "/", label: "Overview" },
  { to: "/diagnose/new", label: "New Diagnosis" },
  { to: "/history", label: "History" },
  { to: "/admin/debug", label: "Admin", subtle: true }
];

const routeTitles: Record<string, string> = {
  "/": "Overview",
  "/diagnose/new": "New Diagnosis",
  "/history": "History",
  "/admin/debug": "Admin Debug"
};

export function AppShell() {
  const location = useLocation();
  const title = routeTitles[location.pathname] ?? (location.pathname.startsWith("/results") ? "Diagnostic Report" : "AeroSLM");

  return (
    <div className="shell">
      <div className="app-frame">
        <aside className="sidebar">
          <div className="window-controls" aria-hidden="true">
            <span className="window-dot window-dot-red" />
            <span className="window-dot window-dot-yellow" />
            <span className="window-dot window-dot-green" />
          </div>

          <NavLink to="/" className="brand">
            <span className="brand-mark">AS</span>
            <span className="brand-copy">
              <span className="brand-name">AeroSLM</span>
              <span className="brand-subtitle">CFD Diagnostics</span>
            </span>
          </NavLink>

          <nav className="nav" aria-label="Primary navigation">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [isActive ? "active" : undefined, item.subtle ? "nav-subtle" : undefined]
                    .filter(Boolean)
                    .join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-tags">
            <span className="eyebrow">Signals</span>
            <div className="tag-row"><span className="tag-dot tag-dot-purple" /> Divergence <strong>4</strong></div>
            <div className="tag-row"><span className="tag-dot tag-dot-green" /> Validation <strong>7</strong></div>
            <div className="tag-row"><span className="tag-dot tag-dot-blue" /> Reports <strong>12</strong></div>
            <div className="tag-row"><span className="tag-dot tag-dot-gray" /> Parser gaps <strong>3</strong></div>
          </div>

          <div className="sidebar-footer">
            <span className="eyebrow">Workspace</span>
            <strong>Local MVP</strong>
            <span className="muted">Backend persistence enabled</span>
          </div>
        </aside>

        <main className="main-surface">
          <header className="topbar">
            <div className="topbar-title">
              <strong>{title}</strong>
            </div>
            <div className="topbar-actions">
              <label className="topbar-search" htmlFor="app-search">
                <span aria-hidden="true">⌕</span>
                <input id="app-search" type="search" placeholder="Search runs, solvers, or reports..." />
              </label>
              <Link className="button button-primary button-small" to="/diagnose/new">
                Add run
              </Link>
              <span className="pill pill-live">Live</span>
            </div>
          </header>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
