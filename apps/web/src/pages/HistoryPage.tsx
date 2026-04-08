import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { DiagnosisRun } from "@aeroslm/shared";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { formatTimestamp, summarizeValidationFlags } from "../lib/display";
import {
  deleteDiagnosisRun,
  loadDiagnosisRuns,
  subscribeDiagnosisRuns
} from "../lib/diagnosisRunStore";

export function HistoryPage() {
  const [runs, setRuns] = useState<DiagnosisRun[]>([]);
  const [search, setSearch] = useState("");
  const [solverFilter, setSolverFilter] = useState("all");
  const [issueFilter, setIssueFilter] = useState("all");
  const navigate = useNavigate();

  useEffect(() => {
    setRuns(loadDiagnosisRuns());

    return subscribeDiagnosisRuns(() => {
      setRuns(loadDiagnosisRuns());
    });
  }, []);

  const solverOptions = useMemo(() => {
    return ["all", ...new Set(runs.map((run) => run.simulationContext.solverName).filter(Boolean))];
  }, [runs]);

  const issueOptions = useMemo(() => {
    return [
      "all",
      ...new Set(
        runs
          .map((run) => run.result?.primaryIssue?.issueType ?? run.partialResult?.primaryIssue?.issueType)
          .filter((value): value is NonNullable<typeof value> => value !== undefined)
      )
    ];
  }, [runs]);

  const filteredRuns = useMemo(() => {
    const query = search.trim().toLowerCase();

    return runs.filter((run) => {
      const issueType = run.result?.primaryIssue?.issueType ?? run.partialResult?.primaryIssue?.issueType ?? "unknown";
      const matchesSearch =
        query.length === 0 ||
        run.simulationContext.caseDescription.toLowerCase().includes(query) ||
        run.question.toLowerCase().includes(query);
      const matchesSolver = solverFilter === "all" || run.simulationContext.solverName === solverFilter;
      const matchesIssue = issueFilter === "all" || issueType === issueFilter;

      return matchesSearch && matchesSolver && matchesIssue;
    });
  }, [issueFilter, runs, search, solverFilter]);

  function refreshRuns() {
    setRuns(loadDiagnosisRuns());
  }

  function handleDelete(runId: string) {
    deleteDiagnosisRun(runId);
    refreshRuns();
  }

  function handleDuplicate(run: DiagnosisRun) {
    navigate("/diagnose/new", {
      state: {
        draftPayload: {
          ...run.request,
          logFile: {
            ...run.request.logFile,
            uploadedAt: new Date().toISOString()
          }
        }
      }
    });
  }

  return (
    <div className="stack">
      <PageHeader
        title="Diagnosis history"
        description="Review prior runs, reopen reports, and reuse previous case setups."
      />

      <section className="panel stack">
        <div className="history-toolbar-header">
          <div>
            <strong>Saved runs</strong>
            <p className="subtle">Search and filter your local run history.</p>
          </div>
          <span className="pill">{filteredRuns.length} visible</span>
        </div>
        <div className="history-toolbar">
          <div className="field">
            <label htmlFor="history-search">Search</label>
            <input
              id="history-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by case description or troubleshooting question"
            />
          </div>

          <div className="field">
            <label htmlFor="history-solver-filter">Solver</label>
            <select
              id="history-solver-filter"
              value={solverFilter}
              onChange={(event) => setSolverFilter(event.target.value)}
            >
              {solverOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All solvers" : option}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="history-issue-filter">Issue type</label>
            <select
              id="history-issue-filter"
              value={issueFilter}
              onChange={(event) => setIssueFilter(event.target.value)}
            >
              {issueOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All issue types" : option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {runs.length === 0 ? (
        <EmptyState message="No diagnosis runs have been saved yet. Run a new analysis and it will appear here." />
      ) : filteredRuns.length === 0 ? (
        <EmptyState message="No saved runs match the current search and filter settings." />
      ) : (
        <div className="card-list">
          {filteredRuns.map((run) => {
            const issueTitle =
              run.result?.primaryIssue?.title ??
              run.partialResult?.primaryIssue?.title ??
              "Issue classification unavailable";
            const issueType =
              run.result?.primaryIssue?.issueType ??
              run.partialResult?.primaryIssue?.issueType ??
              "unknown";
            const flags = run.result?.validationFlags ?? run.partialResult?.validationFlags ?? [];
            const validation = summarizeValidationFlags(flags);

            return (
              <div className="card-link history-card" key={run.id}>
                <div className="history-card-header">
                  <div className="stack">
                    <strong>{run.simulationContext.caseDescription}</strong>
                    <span className="muted">{formatTimestamp(run.createdAt)}</span>
                  </div>
                  <StatusBadge value={run.status} />
                </div>

                <div className="history-chip-row">
                  <div className="history-chip">
                    <span className="muted">Solver</span>
                    <strong>{run.simulationContext.solverName}</strong>
                  </div>
                  <div className="history-chip">
                    <span className="muted">Issue</span>
                    <strong>{issueTitle}</strong>
                  </div>
                  <div className="history-chip">
                    <span className="muted">Type</span>
                    <strong>{issueType}</strong>
                  </div>
                  <div className="history-chip">
                    <span className="muted">Validation</span>
                    <strong>{`${validation.critical}/${validation.caution}/${validation.info}`}</strong>
                  </div>
                </div>

                <p className="history-summary-text">
                  {run.result?.summary ?? run.partialResult?.summary ?? run.statusMessage}
                </p>

                <div className="history-card-actions">
                  <Link className="button button-secondary" to={`/results/${run.id}`}>
                    Open report
                  </Link>
                  <button
                    className="button button-secondary"
                    onClick={() => handleDuplicate(run)}
                    type="button"
                  >
                    Reuse
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => handleDelete(run.id)}
                    type="button"
                  >
                    Delete run
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
