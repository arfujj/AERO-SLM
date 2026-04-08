import { Link } from "react-router-dom";

const workflowSteps = [
  {
    step: "01",
    title: "Upload solver log",
    description: "Submit the raw solver output to capture warnings, residual behavior, and run-failure signatures."
  },
  {
    step: "02",
    title: "Add case context and troubleshooting question",
    description: "Provide solver setup, flow regime, mesh scale, turbulence model, and the engineering question you need answered."
  },
  {
    step: "03",
    title: "Receive validated diagnostic report",
    description: "Review a structured report with probable causes, supporting evidence, stabilization actions, and follow-up checks."
  }
];

const featureCards = [
  {
    title: "Log parsing",
    description: "Extract solver events, warnings, errors, and timestep metadata into a diagnosis-ready structure."
  },
  {
    title: "Residual analysis",
    description: "Highlight convergence breakdowns, continuity drift, and unstable residual patterns relevant to CFD troubleshooting."
  },
  {
    title: "Knowledge-grounded recommendations",
    description: "Map observed solver signals to stored troubleshooting guidance so recommendations remain traceable."
  },
  {
    title: "Physics validation",
    description: "Create clean seams for domain checks on flow regime, mesh quality, boundary conditions, and solver consistency."
  }
];

export function LandingPage() {
  return (
    <div className="stack">
      <section className="hero hero-landing">
        <div className="stack">
          <div className="eyebrow">Physics-aware CFD diagnostic copilot</div>
          <h1>AeroSLM</h1>
          <h2 className="hero-tagline">Upload solver logs, add case context, and get validated troubleshooting guidance.</h2>
          <p className="subtle">
            A quiet technical workspace for aerospace engineers and simulation analysts moving from
            unstable solver output to a structured report.
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
        <div className="hero-side">
          <div className="hero-summary-list">
            <div>
              <strong>Input fidelity</strong>
              <p className="subtle">Keep log text and case context together from intake through review.</p>
            </div>
            <div>
              <strong>Structured outputs</strong>
              <p className="subtle">Reports separate evidence, likely causes, corrective actions, and validation.</p>
            </div>
            <div>
              <strong>Engineering-ready workflow</strong>
              <p className="subtle">Designed so parser, retrieval, and validation layers can deepen over time.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section-block section-divider">
        <div>
          <h2 className="section-title">Workflow</h2>
        </div>
        <div className="workflow-list">
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

      <section className="section-block section-divider">
        <div>
          <h2 className="section-title">Core capabilities</h2>
        </div>
        <div className="feature-grid">
          {featureCards.map((feature) => (
            <div key={feature.title} className="panel feature-card">
              <h3>{feature.title}</h3>
              <p className="subtle">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="scope-note">
        <div className="eyebrow">MVP scope</div>
        <p className="subtle">
          AeroSLM currently focuses on structured log intake, heuristic diagnosis, starter
          retrieval, and report generation. It is designed to support deeper parser coverage,
          stronger validation rules, and model-assisted recommendations in the next iteration.
        </p>
      </section>

      <footer className="landing-footer">
        <div>
          <strong>AeroSLM</strong>
          <p className="subtle">A technical workspace for CFD troubleshooting and diagnostic review.</p>
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
