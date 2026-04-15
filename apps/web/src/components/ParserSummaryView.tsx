import type { ParsedLogData } from "@aeroslm/shared";
import { StatusBadge } from "./StatusBadge";

interface ParserSummaryViewProps {
  parsedLogData: ParsedLogData;
}

export function ParserSummaryView({ parsedLogData }: ParserSummaryViewProps) {
  return (
    <div className="stack">
      <div className="meta-grid">
        <div className="meta-card">
          <span className="muted">Format</span>
          <strong>{parsedLogData.sourceFormat}</strong>
        </div>
        <div className="meta-card">
          <span className="muted">Status</span>
          <div><StatusBadge value={parsedLogData.status} /></div>
        </div>
        <div className="meta-card">
          <span className="muted">Last iteration</span>
          <strong>{parsedLogData.lastIteration ?? "missing"}</strong>
        </div>
        <div className="meta-card">
          <span className="muted">CFL</span>
          <strong>{parsedLogData.cflSeries?.lastValue ?? "missing"}</strong>
        </div>
      </div>

      <div className="card-list">
        <div className="card-link">
          <strong>Residual series</strong>
          <ul className="list">
            {parsedLogData.residualSeries.map((series) => (
              <li key={series.id}>
                {series.metric}: {series.lastValue ?? "missing"} ({series.trend})
              </li>
            ))}
          </ul>
        </div>

        <div className="card-link">
          <strong>Warnings and patterns</strong>
          <ul className="list">
            {parsedLogData.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
            {parsedLogData.convergencePatterns.map((pattern) => (
              <li key={pattern}>{pattern}</li>
            ))}
          </ul>
        </div>

        <div className="card-link">
          <strong>Missing fields</strong>
          <p className="subtle">
            {parsedLogData.missingFields.length > 0
              ? parsedLogData.missingFields.join(", ")
              : "No explicit parser gaps for the generic v1 pattern."}
          </p>
        </div>
      </div>
    </div>
  );
}
