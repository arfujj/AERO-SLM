import { Link } from "react-router-dom";

const workflowSteps = [
  {
    step: "01",
    title: "Upload solver log",
    description: "Attach the solver output."
  },
  {
    step: "02",
    title: "Add case context",
    description: "Describe the setup and failure mode."
  },
  {
    step: "03",
    title: "Review the report",
    description: "Inspect evidence and next actions."
  }
];

const featureCards = [
  {
    title: "Log parsing",
    description: "Warnings, iterations, and residual signals."
  },
  {
    title: "Residual analysis",
    description: "Divergence, oscillation, stagnation, slow convergence."
  },
  {
    title: "Retrieved references",
    description: "Seeded engineering guidance matched to the run."
  },
  {
    title: "Physics validation",
    description: "Context checks before recommendations are surfaced."
  }
];

export function LandingPage() {
  return (
    <div className="stack">
      <section className="hero hero-compact">
        <div className="stack hero-main">
          <h1>AeroSLM</h1>
          <h2 className="hero-tagline">Physics-aware CFD diagnostic copilot</h2>
          <p className="subtle">
            Upload solver logs, add case context, and get structured troubleshooting guidance.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/diagnose/new">
              Start Diagnosis
            </Link>
            <Link className="button button-secondary" to="/results/demo">
              View Demo Report
            </Link>
          </div>
        </div>
      </section>

      <section className="section-block section-divider landing-compact-section">
        <div className="landing-section-header">
          <h2 className="section-title">Workflow</h2>
        </div>
        <div className="workflow-row workflow-row-minimal">
          {workflowSteps.map((item) => (
            <div key={item.step} className="workflow-card">
              <span className="workflow-step">{item.step}</span>
              <div className="stack">
                <h3>{item.title}</h3>
                <p className="subtle">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section-block section-divider landing-compact-section">
        <div className="landing-section-header">
          <h2 className="section-title">Capabilities</h2>
        </div>
        <div className="capability-list">
          {featureCards.map((feature) => (
            <div key={feature.title} className="capability-item">
              <h3>{feature.title}</h3>
              <p className="subtle">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <div>
          <strong>AeroSLM</strong>
          <p className="subtle">Technical workspace for CFD troubleshooting and report review.</p>
        </div>
        <div className="footer-links">
          <Link to="/diagnose/new">Start Diagnosis</Link>
          <Link to="/results/demo">View Demo Report</Link>
          <Link to="/history">History</Link>
          <Link to="/admin/debug">Admin Debug</Link>
        </div>
      </footer>
    </div>
  );
}
