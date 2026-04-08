import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/", label: "Home" },
  { to: "/diagnose/new", label: "New Diagnosis" },
  { to: "/history", label: "History" },
  { to: "/admin/debug", label: "Admin/Debug", subtle: true }
];

export function AppShell() {
  return (
    <div className="shell">
      <div className="app-frame">
        <header className="topbar">
          <NavLink to="/" className="brand">
            <span className="brand-mark" />
            <div className="brand-copy">
              <span className="brand-name">AeroSLM</span>
              <span className="brand-subtitle">Physics-aware CFD diagnostics</span>
            </div>
          </NavLink>
          <nav className="nav">
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
        </header>
        <Outlet />
      </div>
    </div>
  );
}
