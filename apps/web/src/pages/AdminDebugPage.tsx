import { useEffect, useMemo, useState } from "react";
import type { AdminDebugSnapshot, DiagnosisRun } from "@aeroslm/shared";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { formatTimestamp } from "../lib/display";
import { loadDiagnosisRuns, subscribeDiagnosisRuns } from "../lib/diagnosisRunStore";

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const inspectorTabs = [
  { id: "overview", label: "Overview" },
  { id: "raw-log", label: "Raw log" },
  { id: "parsed-json", label: "Parsed JSON" },
  { id: "warnings", label: "Warnings" },
  { id: "residuals", label: "Residual classification" },
  { id: "references", label: "Retrieved references" },
  { id: "validation", label: "Validation hits" },
  { id: "payload", label: "Final payload" }
] as const;

type InspectorTabId = (typeof inspectorTabs)[number]["id"];

export function AdminDebugPage() {
  const [snapshot, setSnapshot] = useState<AdminDebugSnapshot | null>(null);
  const [runs, setRuns] = useState<DiagnosisRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<InspectorTabId>("overview");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRuns(loadDiagnosisRuns());

    return subscribeDiagnosisRuns(() => {
      setRuns(loadDiagnosisRuns());
    });
  }, []);

  useEffect(() => {
    api
      .fetchAdminDebug()
      .then((response) => setSnapshot(response.snapshot))
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load debug snapshot.");
      });
  }, []);

  useEffect(() => {
    if (!selectedRunId && runs.length > 0) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId]
  );

  const selectedResult = selectedRun?.result ?? selectedRun?.partialResult ?? null;
  const selectedReport = selectedRun?.result?.report ?? selectedResult?.report ?? null;
  const supportingReferences = selectedResult?.supportingReferences ?? [];
  const rawLogText = selectedRun?.uploadedLog.content ?? selectedRun?.request.logFile.content ?? "";
  const parserFields = selectedResult?.parsedLogData ?? snapshot?.parserStructuredPreview ?? null;
  const extractedWarnings = parserFields
    ? [...parserFields.warnings, ...parserFields.errors, ...parserFields.solverMessages]
    : [];
  const residualOutput = selectedResult?.residualAnalysis ?? [];
  const retrievedReferences =
    selectedReport?.retrievedReferences ??
    supportingReferences.map((reference) => ({
      id: reference.id,
      title: reference.title,
      snippet: reference.summary,
      relevanceExplanation: reference.excerpt ?? "No relevance explanation captured."
    })) ??
    [];
  const validationFlags = selectedResult?.validationFlags ?? [];
  const parserResidualCount = parserFields?.residualSeries.length ?? 0;
  const parserWarningCount = extractedWarnings.length;
  const validationCount = validationFlags.length;
  const selectedSummary = selectedResult?.summary ?? selectedRun?.statusMessage ?? "No summary available.";

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="admin-inspector-grid">
            <div className="meta-card">
              <span className="muted">Case</span>
              <strong>{selectedRun?.simulationContext.caseDescription ?? "No run selected"}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Solver</span>
              <strong>{selectedRun?.simulationContext.solverName ?? "Unavailable"}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Run status</span>
              <div>{selectedRun ? <StatusBadge value={selectedRun.status} /> : "Unavailable"}</div>
            </div>
            <div className="meta-card">
              <span className="muted">Created</span>
              <strong>{selectedRun ? formatTimestamp(selectedRun.createdAt) : "Unavailable"}</strong>
            </div>
            <div className="admin-summary-block">
              <div className="eyebrow">Current summary</div>
              <p className="subtle">{selectedSummary}</p>
            </div>
            <div className="admin-summary-block">
              <div className="eyebrow">Question</div>
              <p className="subtle">{selectedRun?.question ?? "No question available."}</p>
            </div>
          </div>
        );
      case "raw-log":
        return rawLogText ? (
          <pre className="debug-code-block">{rawLogText}</pre>
        ) : (
          <EmptyState tone="report" message="No uploaded log text is available for this run." />
        );
      case "parsed-json":
        return parserFields ? (
          <pre className="debug-code-block">{prettyJson(parserFields)}</pre>
        ) : (
          <EmptyState tone="report" message="Parsed field output is unavailable." />
        );
      case "warnings":
        return extractedWarnings.length > 0 ? (
          <div className="admin-message-list">
            {extractedWarnings.map((message) => (
              <div key={message} className="admin-message-row">
                <p>{message}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState tone="report" message="No warnings or solver messages were extracted." />
        );
      case "residuals":
        return residualOutput.length > 0 ? (
          <pre className="debug-code-block">{prettyJson(residualOutput)}</pre>
        ) : (
          <EmptyState tone="report" message="No residual classification output is available for this run." />
        );
      case "references":
        return retrievedReferences.length > 0 ? (
          <div className="admin-reference-list">
            {retrievedReferences.map((reference) => (
              <div key={reference.id} className="admin-reference-row">
                <strong>{reference.title}</strong>
                <p className="subtle">{reference.snippet}</p>
                <p className="muted technical-text">{reference.relevanceExplanation}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState tone="report" message="No retrieved references are available for this run." />
        );
      case "validation":
        return validationFlags.length > 0 ? (
          <pre className="debug-code-block">{prettyJson(validationFlags)}</pre>
        ) : (
          <EmptyState tone="report" message="No validation rule hits were recorded for this run." />
        );
      case "payload":
        return selectedResult ? (
          <pre className="debug-code-block">{prettyJson(selectedResult)}</pre>
        ) : (
          <EmptyState tone="report" message="No diagnosis payload is available for this run." />
        );
      default:
        return null;
    }
  }, [
    activeTab,
    extractedWarnings,
    parserFields,
    parserWarningCount,
    rawLogText,
    residualOutput,
    retrievedReferences,
    selectedResult,
    selectedRun,
    selectedSummary,
    validationFlags
  ]);

  return (
    <div className="stack">
      <PageHeader
        title="Admin debug"
        description="Inspect parser output, rule hits, and the assembled diagnosis payload."
      />

      {error ? <div className="flash">{error}</div> : null}

      <div className="admin-layout">
        <aside className="admin-sidebar stack">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Run selector</div>
              <strong>Internal inspection</strong>
            </div>
            <span className="pill">{runs.length} runs</span>
          </div>
          {runs.length === 0 ? (
            <EmptyState
              tone="report"
              message="No saved runs are available yet. Run a diagnosis to inspect raw log, parser, retrieval, and validation behavior here."
            />
          ) : (
            <div className="stack">
              <div className="field">
                <label htmlFor="debug-run">Saved run</label>
                <select
                  id="debug-run"
                  value={selectedRunId}
                  onChange={(event) => setSelectedRunId(event.target.value)}
                >
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      {`${run.simulationContext.solverName} | ${run.simulationContext.caseDescription}`}
                    </option>
                  ))}
                </select>
              </div>

              {selectedRun ? (
                <div className="admin-run-card">
                  <div className="report-inline">
                    <strong>{selectedRun.simulationContext.caseDescription}</strong>
                    <StatusBadge value={selectedRun.status} />
                  </div>
                  <p className="muted">{formatTimestamp(selectedRun.createdAt)}</p>
                  <p className="subtle technical-text">{selectedRun.question}</p>
                </div>
              ) : null}
            </div>
          )}

          <div className="section-divider" />

          <div className="panel-header">
            <div>
              <div className="eyebrow">Quick counts</div>
              <strong>Run signals</strong>
            </div>
          </div>

          <div className="admin-quick-grid">
            <div className="admin-count-item">
              <span className="muted">Residual series</span>
              <strong>{parserResidualCount}</strong>
            </div>
            <div className="admin-count-item">
              <span className="muted">Warnings</span>
              <strong>{parserWarningCount}</strong>
            </div>
            <div className="admin-count-item">
              <span className="muted">Validation hits</span>
              <strong>{validationCount}</strong>
            </div>
            <div className="admin-count-item">
              <span className="muted">Status</span>
              <div>{selectedRun ? <StatusBadge value={selectedRun.status} /> : "Unavailable"}</div>
            </div>
          </div>

          <div className="panel-header">
            <div>
              <div className="eyebrow">System snapshot</div>
              <strong>Seeded debug context</strong>
            </div>
          </div>
          {!snapshot ? (
            <EmptyState tone="report" message="Loading debug snapshot..." />
          ) : (
            <div className="admin-quick-grid">
              <div className="admin-count-item">
                <span className="muted">Knowledge base</span>
                <strong>{snapshot.knowledgeBaseSize} references</strong>
              </div>
              <div className="admin-count-item">
                <span className="muted">Validation rules</span>
                <strong>{snapshot.validationRules.length} seeded rules</strong>
              </div>
            </div>
          )}
        </aside>

        <section className="stack">
          <div className="panel admin-inspector-panel">
            <div className="admin-tab-bar" role="tablist" aria-label="Admin debug views">
              {inspectorTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`admin-tab ${activeTab === tab.id ? "admin-tab-active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="admin-tab-panel">
              {tabContent}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
