import { Link } from "react-router-dom";

const pipelineRows = [
  { label: "Upload", value: ".txt / .log", state: "Ready" },
  { label: "Parse", value: "OpenFOAM + generic", state: "Active" },
  { label: "Analyze", value: "Residual trends", state: "Active" },
  { label: "Validate", value: "Physics rules", state: "Active" }
];

const qualitySignals = [
  { label: "Stored reports", value: "Persistent" },
  { label: "Parser coverage", value: "Structured" },
  { label: "Report export", value: "PDF" },
  { label: "Debug view", value: "Enabled" }
];

const reviewQueue = [
  {
    title: "Pressure correction divergence",
    solver: "OpenFOAM",
    severity: "Critical",
    status: "Ready for demo"
  },
  {
    title: "Outlet backflow oscillation",
    solver: "Generic CFD log",
    severity: "High",
    status: "Sample available"
  },
  {
    title: "Residual stagnation",
    solver: "Generic CFD log",
    severity: "Medium",
    status: "Sample available"
  }
];

export function LandingPage() {
  return (
    <div className="stack">
      <section className="overview-hero">
        <div className="overview-copy">
          <span className="eyebrow">AeroSLM</span>
          <h1>CFD diagnosis command center</h1>
          <p className="subtle">
            Structured solver-log intake, residual analysis, engineering references, validation flags, and report export in one workspace.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="button button-primary" to="/diagnose/new">
            Start Diagnosis
          </Link>
          <Link className="button button-secondary" to="/results/demo">
            Open Demo Report
          </Link>
        </div>
      </section>

      <section className="stat-strip">
        {qualitySignals.map((signal) => (
          <div className="stat-pill" key={signal.label}>
            <span className="muted">{signal.label}</span>
            <strong>{signal.value}</strong>
          </div>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Workflow</span>
              <h2 className="section-title">Diagnosis pipeline</h2>
            </div>
            <span className="pill">4 stages</span>
          </div>
          <div className="pipeline-list">
            {pipelineRows.map((row, index) => (
              <div className="pipeline-row" key={row.label}>
                <span className="pipeline-index">{index + 1}</span>
                <div>
                  <strong>{row.label}</strong>
                  <span className="muted">{row.value}</span>
                </div>
                <span className="status status-accent">{row.state}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel stack">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Samples</span>
              <h2 className="section-title">Review queue</h2>
            </div>
            <Link className="button button-secondary button-small" to="/diagnose/new">
              New run
            </Link>
          </div>
          <div className="card-list">
            {reviewQueue.map((item) => (
              <div className="queue-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <span className="muted">{item.solver}</span>
                </div>
                <div className="report-badge-row">
                  <span className="status status-warning">{item.severity}</span>
                  <span className="status status-neutral">{item.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel stack">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Next build path</span>
            <h2 className="section-title">Production readiness</h2>
          </div>
          <span className="pill">MVP backbone</span>
        </div>
        <div className="capability-list">
          <div className="capability-item">
            <h3>Durable reports</h3>
            <p className="subtle">Backend diagnosis reports and uploaded logs now persist locally.</p>
          </div>
          <div className="capability-item">
            <h3>Project storage</h3>
            <p className="subtle">Next layer is project grouping, users, and managed database storage.</p>
          </div>
          <div className="capability-item">
            <h3>Knowledge retrieval</h3>
            <p className="subtle">Seeded references are ready to evolve into searchable engineering knowledge.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
