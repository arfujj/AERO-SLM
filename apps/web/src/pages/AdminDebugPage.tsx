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

export function AdminDebugPage() {
  const [snapshot, setSnapshot] = useState<AdminDebugSnapshot | null>(null);
  const [runs, setRuns] = useState<DiagnosisRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
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

  return (
    <div className="stack">
      <PageHeader
        title="Admin debug"
        description="Inspect parser output, rule hits, and the final assembled diagnosis."
      />

      {error ? <div className="flash">{error}</div> : null}

      <div className="admin-layout">
        <aside className="panel stack">
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
                <div className="card-link stack">
                  <div className="report-inline">
                    <strong>{selectedRun.simulationContext.caseDescription}</strong>
                    <StatusBadge value={selectedRun.status} />
                  </div>
                  <p className="muted">{formatTimestamp(selectedRun.createdAt)}</p>
                  <p className="subtle">{selectedRun.question}</p>
                </div>
              ) : null}
            </div>
          )}

          <div className="section-divider" />

          <div className="panel-header">
            <div>
              <div className="eyebrow">System snapshot</div>
              <strong>Seeded debug context</strong>
            </div>
          </div>
          {!snapshot ? (
            <EmptyState tone="report" message="Loading debug snapshot..." />
          ) : (
            <div className="meta-grid">
              <div className="meta-card">
                <span className="muted">Knowledge base</span>
                <strong>{snapshot.knowledgeBaseSize} references</strong>
              </div>
              <div className="meta-card">
                <span className="muted">Validation rules</span>
                <strong>{snapshot.validationRules.length} seeded rules</strong>
              </div>
            </div>
          )}
        </aside>

        <section className="stack">
          <details className="report-section" open>
            <summary className="report-section-summary">
              <div>
                <strong>Raw uploaded log text</strong>
                <p className="muted">Original log content.</p>
              </div>
              <span className="muted">Toggle</span>
            </summary>
            <div className="report-section-body">
              {rawLogText ? <pre className="debug-code-block">{rawLogText}</pre> : <EmptyState tone="report" message="No uploaded log text is available for this run." />}
            </div>
          </details>

          <details className="report-section">
            <summary className="report-section-summary">
              <div>
                <strong>Parsed fields JSON</strong>
                <p className="muted">Structured parser output.</p>
              </div>
              <span className="muted">Toggle</span>
            </summary>
            <div className="report-section-body">
              {parserFields ? <pre className="debug-code-block">{prettyJson(parserFields)}</pre> : <EmptyState tone="report" message="Parsed field output is unavailable." />}
            </div>
          </details>

          <details className="report-section">
            <summary className="report-section-summary">
              <div>
                <strong>Extracted warnings and messages</strong>
                <p className="muted">Direct parser messages.</p>
              </div>
              <span className="muted">Toggle</span>
            </summary>
            <div className="report-section-body">
              {extractedWarnings.length > 0 ? (
                <div className="card-list">
                  {extractedWarnings.map((message) => (
                    <div key={message} className="card-link">
                      <p className="subtle">{message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState tone="report" message="No warnings or solver messages were extracted." />
              )}
            </div>
          </details>

          <details className="report-section">
            <summary className="report-section-summary">
              <div>
                <strong>Residual classification output</strong>
                <p className="muted">Residual heuristics and confidence.</p>
              </div>
              <span className="muted">Toggle</span>
            </summary>
            <div className="report-section-body">
              {residualOutput.length > 0 ? (
                <pre className="debug-code-block">{prettyJson(residualOutput)}</pre>
              ) : (
                <EmptyState tone="report" message="No residual classification output is available for this run." />
              )}
            </div>
          </details>

          <details className="report-section">
            <summary className="report-section-summary">
              <div>
                <strong>Retrieved references</strong>
                <p className="muted">Retrieved references and match reasons.</p>
              </div>
              <span className="muted">Toggle</span>
            </summary>
            <div className="report-section-body">
              {retrievedReferences.length > 0 ? (
                <div className="card-list">
                  {retrievedReferences.map((reference) => (
                    <div key={reference.id} className="card-link stack">
                      <strong>{reference.title}</strong>
                      <p className="subtle">{reference.snippet}</p>
                      <p className="muted">{reference.relevanceExplanation}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState tone="report" message="No retrieved references are available for this run." />
              )}
            </div>
          </details>

          <details className="report-section">
            <summary className="report-section-summary">
              <div>
                <strong>Validation rule hits</strong>
                <p className="muted">Validation hits recorded during assembly.</p>
              </div>
              <span className="muted">Toggle</span>
            </summary>
            <div className="report-section-body">
              {validationFlags.length > 0 ? (
                <pre className="debug-code-block">{prettyJson(validationFlags)}</pre>
              ) : (
                <EmptyState tone="report" message="No validation rule hits were recorded for this run." />
              )}
            </div>
          </details>

          <details className="report-section">
            <summary className="report-section-summary">
              <div>
                <strong>Final diagnosis payload</strong>
                <p className="muted">Payload rendered by the results page.</p>
              </div>
              <span className="muted">Toggle</span>
            </summary>
            <div className="report-section-body">
              {selectedResult ? (
                <pre className="debug-code-block">{prettyJson(selectedResult)}</pre>
              ) : (
                <EmptyState tone="report" message="No diagnosis payload is available for this run." />
              )}
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
