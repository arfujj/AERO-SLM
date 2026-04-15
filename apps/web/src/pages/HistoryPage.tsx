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
  const [statusFilter, setStatusFilter] = useState("all");
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

  const statusOptions = useMemo(() => {
    return ["all", ...new Set(runs.map((run) => run.status).filter(Boolean))];
  }, [runs]);

  const filteredRuns = useMemo(() => {
    const query = search.trim().toLowerCase();

    return runs.filter((run) => {
      const issueType = run.result?.primaryIssue?.issueType ?? run.partialResult?.primaryIssue?.issueType ?? "unknown";
      const runStatus = run.status ?? "unknown";
      const matchesSearch =
        query.length === 0 ||
        run.simulationContext.caseDescription.toLowerCase().includes(query) ||
        run.question.toLowerCase().includes(query);
      const matchesSolver = solverFilter === "all" || run.simulationContext.solverName === solverFilter;
      const matchesIssue = issueFilter === "all" || issueType === issueFilter;
      const matchesStatus = statusFilter === "all" || runStatus === statusFilter;

      return matchesSearch && matchesSolver && matchesIssue && matchesStatus;
    });
  }, [issueFilter, runs, search, solverFilter, statusFilter]);

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
        description="Review prior runs, reopen reports, and reuse previous case inputs."
      />

      <section className="history-controls stack">
        <div className="history-toolbar-header">
          <div>
            <strong>Saved runs</strong>
            <p className="subtle">Compact local run log for review and reuse.</p>
          </div>
          <span className="pill">{filteredRuns.length} visible</span>
        </div>
        <div className="history-filter-bar">
          <div className="field">
            <label htmlFor="history-search">Search</label>
            <input
              id="history-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Case or question"
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

          <div className="field">
            <label htmlFor="history-status-filter">Status</label>
            <select
              id="history-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All statuses" : option}
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
        <section className="history-table-shell">
          <div className="history-table">
            <div className="history-row history-row-header">
              <div>Case</div>
              <div>Solver</div>
              <div>Date</div>
              <div>Issue</div>
              <div>Status</div>
              <div>Validation</div>
              <div>Actions</div>
            </div>

          {filteredRuns.map((run) => {
            const issueTitle =
              run.result?.primaryIssue?.title ??
              run.partialResult?.primaryIssue?.title ??
              "Issue classification unavailable";
            const issueType =
              run.result?.primaryIssue?.issueType ??
              run.partialResult?.primaryIssue?.issueType ??
              "unknown";
            const issueSeverity =
              run.result?.primaryIssue?.severity ??
              run.partialResult?.primaryIssue?.severity ??
              null;
            const flags = run.result?.validationFlags ?? run.partialResult?.validationFlags ?? [];
            const validation = summarizeValidationFlags(flags);

            return (
              <div className="history-row" key={run.id}>
                <div className="history-cell history-case-cell">
                  <strong>{run.simulationContext.caseDescription}</strong>
                  <span className="muted history-subline">{run.question}</span>
                </div>

                <div className="history-cell">
                  <span>{run.simulationContext.solverName}</span>
                </div>

                <div className="history-cell">
                  <span>{formatTimestamp(run.createdAt)}</span>
                </div>

                <div className="history-cell">
                  <span>{issueTitle}</span>
                  <div className="history-issue-meta">
                    <span className="muted history-subline">{issueType}</span>
                    {issueSeverity ? <StatusBadge value={issueSeverity} /> : null}
                  </div>
                </div>

                <div className="history-cell">
                  <StatusBadge value={run.status} />
                </div>

                <div className="history-cell">
                  <span className="history-validation-inline">C {validation.critical}  Ca {validation.caution}  I {validation.info}</span>
                </div>

                <div className="history-cell">
                  <div className="history-actions">
                    <Link className="button button-secondary button-small" to={`/results/${run.id}`}>
                      Open
                    </Link>
                    <button
                      className="button button-secondary button-small"
                      onClick={() => handleDuplicate(run)}
                      type="button"
                    >
                      Reuse
                    </button>
                    <button
                      className="button button-secondary button-small"
                      onClick={() => handleDelete(run.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </section>
      )}
    </div>
  );
}
