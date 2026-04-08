import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { DiagnosisResult, DiagnosisRun, DiagnosticReport } from "@aeroslm/shared";
import { EmptyState } from "../components/EmptyState";
import { ParserSummaryView } from "../components/ParserSummaryView";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { confidenceLevel, formatTimestamp, summarizeValidationFlags, toTitleCase } from "../lib/display";
import { diagnosisProgressStages } from "../lib/diagnosisWorkflow";
import {
  getDiagnosisRunById,
  mapReportToDiagnosisResult,
  saveDiagnosisRun
} from "../lib/diagnosisRunStore";
import { exportDiagnosisReportPdf } from "../lib/pdfExport";

function severityFromTrend(trend: string): "low" | "medium" | "high" {
  if (trend === "worsening") return "high";
  if (trend === "flat") return "medium";
  return "low";
}


interface ReportSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function ReportSection({ title, subtitle, defaultOpen = true, children }: ReportSectionProps) {
  return (
    <details className="report-section" open={defaultOpen}>
      <summary className="report-section-summary">
        <div>
          <strong>{title}</strong>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
        <span className="muted">Toggle</span>
      </summary>
      <div className="report-section-body">{children}</div>
    </details>
  );
}

function ResidualTrendChart({ result }: { result: Partial<DiagnosisResult> }) {
  const series = result.parsedLogData?.residualSeries ?? [];
  const numericSeries = series
    .map((item) => ({
      metric: item.metric,
      points: item.samples
        .filter((sample) => sample.value !== null)
        .map((sample, index) => ({
          x: sample.step ?? index + 1,
          y: sample.value as number
        }))
    }))
    .filter((item) => item.points.length >= 2)
    .slice(0, 3);

  if (numericSeries.length === 0) {
    return (
      <EmptyState
        tone="report"
        message="Residual visualization is unavailable because the log does not contain enough numeric residual samples."
      />
    );
  }

  const width = 640;
  const height = 220;
  const padding = 24;
  const allX = numericSeries.flatMap((item) => item.points.map((point) => point.x));
  const allY = numericSeries.flatMap((item) => item.points.map((point) => point.y));
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;
  const colors = ["#3d6877", "#8b6a25", "#7c8794"];

  function scaleX(value: number) {
    return padding + ((value - minX) / xRange) * (width - padding * 2);
  }

  function scaleY(value: number) {
    return height - padding - ((value - minY) / yRange) * (height - padding * 2);
  }

  return (
    <div className="report-chart-block">
      <svg
        className="report-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Residual trend visualization"
      >
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="report-chart-axis" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="report-chart-axis" />
        {numericSeries.map((item, index) => {
          const path = item.points
            .map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${scaleX(point.x)} ${scaleY(point.y)}`)
            .join(" ");

          return (
            <g key={item.metric}>
              <path d={path} fill="none" stroke={colors[index % colors.length]} strokeWidth="2" />
              {item.points.map((point) => (
                <circle
                  key={`${item.metric}-${point.x}-${point.y}`}
                  cx={scaleX(point.x)}
                  cy={scaleY(point.y)}
                  r="2.5"
                  fill={colors[index % colors.length]}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="report-chart-legend">
        {numericSeries.map((item, index) => (
          <div key={item.metric} className="report-legend-item">
            <span className="report-legend-swatch" style={{ backgroundColor: colors[index % colors.length] }} />
            <span>{item.metric}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResultsPage() {
  const { reportId = "" } = useParams();
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [run, setRun] = useState<DiagnosisRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const displayResult = result ?? ((run?.partialResult as Partial<DiagnosisResult> | undefined) ?? null);
  const effectiveReport = report ?? displayResult?.report ?? null;
  const parsedSummary = displayResult?.parsedSummary;
  const parsedLogData = displayResult?.parsedLogData;
  const residualAnalysis = displayResult?.residualAnalysis ?? [];
  const likelyCauses = displayResult?.likelyCauses ?? [];
  const recommendations = displayResult?.recommendations ?? [];
  const supportingReferences = displayResult?.supportingReferences ?? [];
  const validationFlags = displayResult?.validationFlags ?? [];
  const resultConfidence = displayResult?.confidence ?? 0;

  useEffect(() => {
    const localRun = getDiagnosisRunById(reportId);
    if (localRun) {
      setRun(localRun);

      if (localRun.result?.report) {
        setReport(localRun.result.report);
      }
      if (localRun.result) {
        setResult(localRun.result);
      } else if (localRun.partialResult) {
        setResult(localRun.partialResult as DiagnosisResult);
      }

      const intervalId = window.setInterval(() => {
        const nextRun = getDiagnosisRunById(reportId);
        if (!nextRun) return;

        setRun(nextRun);

        if (nextRun.result?.report) {
          setReport(nextRun.result.report);
          setResult(nextRun.result);
          setError(null);
          window.clearInterval(intervalId);
        }

        if (nextRun.partialResult && !nextRun.result) {
          setResult(nextRun.partialResult as DiagnosisResult);
        }

        if (nextRun.status === "failed") {
          setError(nextRun.errorMessage ?? "Diagnosis failed.");
          window.clearInterval(intervalId);
        }
      }, 500);

      return () => window.clearInterval(intervalId);
    }

    api
      .fetchReport(reportId)
      .then((response) => {
        if (!response.report) {
          setError("Report not found.");
          return;
        }

        setReport(response.report);
        setResult(response.result ?? mapReportToDiagnosisResult(response.report));
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load report.");
      });
  }, [reportId]);

  const validationCounts = useMemo(
    () => summarizeValidationFlags(validationFlags),
    [validationFlags]
  );

  const rawMessages = useMemo(() => {
    if (!parsedLogData) return [];

    return [
      ...parsedLogData.warnings.map((message) => ({ type: "warning", message })),
      ...parsedLogData.errors.map((message) => ({ type: "error", message })),
      ...parsedLogData.solverMessages.map((message) => ({ type: "message", message }))
    ];
  }, [parsedLogData]);

  function handleSaveRun() {
    if (!displayResult || !effectiveReport) return;

    const existingRun = run ?? getDiagnosisRunById(reportId);
    const savedRun: DiagnosisRun = existingRun
      ? {
          ...existingRun,
          status: existingRun.status === "failed" ? "completed" : existingRun.status,
          statusMessage: "Diagnosis saved to local history.",
          reportId: effectiveReport.id,
          result: displayResult as DiagnosisResult,
          partialResult: undefined,
          completedAt: existingRun.completedAt ?? effectiveReport.createdAt
        }
      : {
          id: `saved_${effectiveReport.id}`,
          createdAt: effectiveReport.createdAt,
          updatedAt: new Date().toISOString(),
          startedAt: effectiveReport.createdAt,
          completedAt: effectiveReport.createdAt,
          status: "completed",
          statusMessage: "Diagnosis saved to local history.",
          question: effectiveReport.question,
          uploadedLog: {
            id: `saved_log_${effectiveReport.id}`,
            fileName: "server-report.log",
            fileType: "log",
            sizeBytes: 0,
            uploadedAt: effectiveReport.createdAt,
            content: ""
          },
          simulationContext: effectiveReport.context,
          request: {
            question: effectiveReport.question,
            context: effectiveReport.context,
            logFile: {
              fileName: "server-report.log",
              content: "",
              uploadedAt: effectiveReport.createdAt
            }
          },
          reportId: effectiveReport.id,
          result: displayResult as DiagnosisResult
        };

    const nextRun = saveDiagnosisRun(savedRun);
    setRun(nextRun);
    setSaveMessage("Run saved to local history.");
    window.setTimeout(() => setSaveMessage(null), 2400);
  }

  async function handleDownloadPdf() {
    if (!displayResult) {
      setError("Diagnosis data is not ready for PDF export.");
      return;
    }

    try {
      await exportDiagnosisReportPdf({
        result: displayResult,
        run
      });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export PDF report.");
    }
  }

  if (run && run.status === "processing" && !report && !error) {
    const activeStageIndex = diagnosisProgressStages.findIndex((stage) => stage.key === run.currentStage);

    return (
      <div className="stack">
        <PageHeader title="Processing diagnosis" description={run.question} />
        <div className="panel stack">
          <strong>{run.statusMessage}</strong>
          <p className="subtle">
            AeroSLM is parsing the uploaded log, checking solver signals, and assembling a
            structured report.
          </p>
          <div className="meta-grid">
            <div className="meta-card">
              <span className="muted">Run status</span>
              <strong>Processing</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Solver</span>
              <strong>{run.simulationContext.solverName}</strong>
            </div>
          </div>
          <div className="card-list">
            {diagnosisProgressStages.map((stage, index) => {
              const isActive = run.currentStage === stage.key;
              const isCompleted = (run.completedStages ?? []).includes(stage.key) && !isActive;
              const statusText = isActive ? "In progress" : isCompleted ? "Completed" : "Pending";

              return (
                <div key={stage.key} className="card-link">
                  <div className="split-row">
                    <strong>{stage.label}</strong>
                    <span className="muted">
                      {index < activeStageIndex ? "Completed" : statusText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {parsedLogData ? (
            <div className="stack">
              <div className="eyebrow">Available partial output</div>
              <ParserSummaryView parsedLogData={parsedLogData} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (error && !report && !result) {
    return (
      <div className="stack">
        <PageHeader title="Diagnostic report" description="Structured output from the diagnosis pipeline." />
        <div className="flash">{error}</div>
        <div className="button-row">
          <Link className="button button-primary" to="/diagnose/new">
            Start new diagnosis
          </Link>
          <Link className="button button-secondary" to="/history">
            View history
          </Link>
        </div>
      </div>
    );
  }

  if (!displayResult) {
    return (
      <div className="stack">
        <PageHeader title="Diagnostic report" description="Structured output from the diagnosis pipeline." />
        <div className="panel">Loading report...</div>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader
        title="Diagnostic report"
        description={effectiveReport?.question ?? run?.question ?? "Structured output from the diagnosis pipeline."}
        actions={<StatusBadge value={run?.status ?? parsedSummary?.status ?? "unknown"} />}
      />

      {error ? <div className="flash">{error}</div> : null}
      {saveMessage ? <div className="flash flash-success">{saveMessage}</div> : null}

      <div className="report-grid">
        <ReportSection
          title="Header"
          subtitle="Run metadata and simulation context."
        >
          <div className="meta-grid">
            <div className="meta-card">
              <span className="muted">Timestamp</span>
              <strong>{formatTimestamp(effectiveReport?.createdAt ?? run?.createdAt)}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Solver</span>
              <strong>{run?.simulationContext.solverName ?? effectiveReport?.context.solverName ?? "Unavailable"}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Case description</span>
              <strong>{run?.simulationContext.caseDescription ?? effectiveReport?.context.caseDescription ?? "Unavailable"}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Run status</span>
              <strong>
                <StatusBadge value={run?.status ?? parsedSummary?.status ?? "unknown"} />
              </strong>
            </div>
          </div>
        </ReportSection>

        <ReportSection
          title="Summary Card"
          subtitle="Primary issue, overall confidence, and the final next step."
        >
          <div className="report-summary-card">
            <div className="stack">
              <div className="eyebrow">Detected issue</div>
              <div className="report-inline">
                <strong>{displayResult.primaryIssue?.title ?? "No primary issue identified"}</strong>
                {displayResult.primaryIssue ? (
                  <div className="report-badge-row">
                    <StatusBadge value={displayResult.primaryIssue.severity} />
                    <StatusBadge value={confidenceLevel(resultConfidence)} />
                  </div>
                ) : null}
              </div>
              <p className="subtle">
                {displayResult.primaryIssue?.summary ??
                  "AeroSLM assembled a partial summary, but the uploaded log did not support a stronger issue classification."}
              </p>
            </div>
            <div className="meta-grid">
              <div className="meta-card">
                <span className="muted">Confidence</span>
                <strong>{Math.round(resultConfidence * 100)}%</strong>
              </div>
              <div className="meta-card">
                <span className="muted">Final suggested next step</span>
                <strong>{displayResult.nextBestAction?.title ?? "Review parsed evidence"}</strong>
              </div>
            </div>
            <div className="panel report-note">
              <div className="eyebrow">Next step detail</div>
              <p>
                {displayResult.nextBestAction?.action ??
                  "No final action was promoted. Review the parsed evidence and raw warnings before changing solver settings."}
              </p>
            </div>
          </div>
        </ReportSection>

        <ReportSection
          title="Parsed Log Summary"
          subtitle="Parser coverage and extracted solver-log evidence."
        >
          <div className="meta-grid">
            <div className="meta-card">
              <span className="muted">File name</span>
              <strong>{run?.uploadedLog.fileName ?? "Unavailable"}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Iterations found</span>
              <strong>{parsedLogData?.iterationNumbers.length ?? 0}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Residual fields found</span>
              <strong>
                {parsedSummary?.residualMetrics.length
                  ? parsedSummary.residualMetrics.join(", ")
                  : "None detected"}
              </strong>
            </div>
            <div className="meta-card">
              <span className="muted">CFL detected</span>
              <strong>{parsedLogData?.cflSeries ? "Yes" : "No"}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Warnings count</span>
              <strong>{parsedSummary?.warningCount ?? 0}</strong>
            </div>
          </div>
          {parsedSummary?.missingFields.length ? (
            <div className="report-empty-state">
              Parser coverage is partial for this log. Missing fields: {parsedSummary.missingFields.join(", ")}.
            </div>
          ) : null}
          {parsedLogData ? (
            <ParserSummaryView parsedLogData={parsedLogData} />
          ) : (
            <EmptyState
              tone="report"
              message="Parsed log details are unavailable. Partial diagnosis output may still be shown if some parser signals were preserved earlier in the workflow."
            />
          )}
        </ReportSection>

        <ReportSection
          title="Residual Trend Analysis"
          subtitle="Convergence classifications produced from parsed residual data."
        >
          <ResidualTrendChart result={displayResult} />
          <div className="card-list">
            {residualAnalysis.length > 0 ? (
              residualAnalysis.map((assessment) => (
                <div key={assessment.classification} className="card-link stack">
                  <div className="report-inline">
                    <strong>{toTitleCase(assessment.classification)}</strong>
                    <div className="report-badge-row">
                      <StatusBadge value={severityFromTrend(assessment.classification === "divergence" ? "worsening" : assessment.classification === "residual-stagnation" ? "flat" : "improving")} />
                      <StatusBadge value={confidenceLevel(assessment.confidence)} />
                    </div>
                  </div>
                  <p className="subtle">{assessment.rationale}</p>
                  <p className="muted">{assessment.trendSummary}</p>
                  <div className="report-evidence-block">
                    <div className="eyebrow">Intermediate reasoning</div>
                    <ul className="list">
                      {assessment.debug.scoreBreakdown.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                tone="report"
                message="No residual trend assessment is available. The log likely contains too few numeric residual samples for a stable classification."
              />
            )}
          </div>
        </ReportSection>

        <ReportSection
          title="Likely Causes"
          subtitle="Evidence-backed causes ranked ahead of corrective actions."
        >
          <div className="card-list">
            {likelyCauses.length > 0 ? likelyCauses.map((cause) => (
              <div key={cause.id} className="card-link stack">
                <div className="report-inline">
                  <strong>
                    {cause.rank}. {cause.title}
                  </strong>
                  <div className="report-badge-row">
                    <StatusBadge value={confidenceLevel(cause.confidence)} />
                  </div>
                </div>
                <p className="subtle">{cause.rationale}</p>
                <div className="report-evidence-block">
                  <div className="eyebrow">Evidence</div>
                  <ul className="list">
                    {cause.evidence.map((evidence) => (
                      <li key={evidence}>{evidence}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )) : (
              <EmptyState
                tone="report"
                message="No ranked likely causes were assembled. Review the parsed summary and raw messages for the strongest available evidence."
              />
            )}
          </div>
        </ReportSection>

        <ReportSection
          title="Recommended Corrective Actions"
          subtitle="Recommendations separated from the evidence that supports them."
        >
          <div className="card-list">
            {recommendations.length > 0 ? recommendations.map((recommendation) => (
              <div key={recommendation.id} className="card-link stack">
                <div className="report-inline">
                  <strong>
                    {recommendation.rank}. {recommendation.title}
                  </strong>
                  <div className="report-badge-row">
                    <StatusBadge value={recommendation.priority} />
                    <StatusBadge value={confidenceLevel(recommendation.confidence)} />
                  </div>
                </div>
                <p>{recommendation.action}</p>
                <p className="subtle">{recommendation.rationale}</p>
                <div className="report-split">
                  <div className="report-evidence-block">
                    <div className="eyebrow">Grounding</div>
                    <ul className="list">
                      {recommendation.groundedBy.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="report-evidence-block">
                    <div className="eyebrow">Linked references</div>
                    <ul className="list">
                      {recommendation.references.map((reference) => (
                        <li key={reference.id}>{reference.title}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )) : (
              <EmptyState
                tone="report"
                message="No corrective actions were emitted. AeroSLM withheld specific recommendations because the available evidence was incomplete or validation removed unsuitable options."
              />
            )}
          </div>
        </ReportSection>

        <ReportSection
          title="Supporting References"
          subtitle="Ranked supporting material retrieved from the seeded engineering library."
        >
          <div className="card-list">
            {supportingReferences.length > 0 ? supportingReferences.map((reference) => (
              <div key={reference.id} className="card-link stack">
                <div className="report-inline">
                  <strong>{reference.title}</strong>
                  <StatusBadge value={reference.sourceType} />
                </div>
                <p className="subtle">{reference.summary}</p>
                {reference.excerpt ? <p className="muted">{reference.excerpt}</p> : null}
              </div>
            )) : <EmptyState tone="report" message="No supporting references were retrieved for this run." />}
          </div>
        </ReportSection>

        <ReportSection
          title="Physics Validation Flags"
          subtitle="Rules hits recorded before the final recommendations were displayed."
        >
          <div className="meta-grid">
            <div className="meta-card">
              <span className="muted">Critical</span>
              <strong>{validationCounts.critical}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Caution</span>
              <strong>{validationCounts.caution}</strong>
            </div>
            <div className="meta-card">
              <span className="muted">Info</span>
              <strong>{validationCounts.info}</strong>
            </div>
          </div>
          <div className="card-list">
            {validationFlags.length > 0 ? (
              validationFlags.map((flag) => (
                <div key={flag.id} className="card-link stack">
                  <div className="report-inline">
                    <strong>{flag.rule}</strong>
                    <StatusBadge value={flag.severity} />
                  </div>
                  <p className="subtle">{flag.message}</p>
                  <p className="muted">Triggered by: {flag.triggeredBy}</p>
                  {flag.recommendationId ? (
                    <p className="muted">
                      Recommendation link: {flag.recommendationId}
                      {flag.suppressed ? " (suppressed)" : ""}
                    </p>
                  ) : null}
                </div>
              ))
            ) : <EmptyState tone="report" message="No physics validation flags were recorded for this run." />}
          </div>
        </ReportSection>

        <ReportSection
          title="Raw Warnings and Messages"
          subtitle="Direct parser outputs separated from AeroSLM recommendations."
          defaultOpen={false}
        >
          <div className="card-list">
            {rawMessages.length > 0 ? (
              rawMessages.map((entry) => (
                <div key={`${entry.type}-${entry.message}`} className="card-link stack">
                  <div className="report-inline">
                    <strong>{entry.type}</strong>
                    <StatusBadge value={entry.type === "error" ? "critical" : entry.type === "warning" ? "high" : "low"} />
                  </div>
                  <p className="subtle">{entry.message}</p>
                </div>
              ))
            ) : <EmptyState tone="report" message="No raw warnings or solver messages were captured." />}
          </div>
        </ReportSection>

        <ReportSection
          title="Footer Actions"
          subtitle="Persist, restart, or export the current technical report."
        >
          <div className="button-row">
            <Link className="button button-primary" to="/diagnose/new">
              Start new diagnosis
            </Link>
            <button className="button button-secondary" type="button" onClick={handleSaveRun}>
              Save run
            </button>
            <button
              className="button button-secondary"
              disabled={!displayResult}
              type="button"
              onClick={handleDownloadPdf}
            >
              Download PDF
            </button>
          </div>
        </ReportSection>
      </div>
    </div>
  );
}
