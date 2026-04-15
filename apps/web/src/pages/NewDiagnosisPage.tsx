import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { DiagnosePayload } from "@aeroslm/shared";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import {
  analyzeLogContent,
  buildFilePreview,
  createInitialPayload,
  flowRegimeOptions,
  hasFormErrors,
  solverOptions,
  turbulenceModelOptions,
  validateDiagnosisForm
} from "../lib/diagnosisForm";
import {
  createDiagnosisRun,
  saveDiagnosisRun
} from "../lib/diagnosisRunStore";
import { runDiagnosisWorkflow } from "../lib/diagnosisWorkflow";
import { buildPayloadFromSample, getSampleSolverCase, sampleCaseCount } from "../lib/sampleData";

async function readFileContent(file: File): Promise<string> {
  return file.text();
}

function parseOptionalNumber(value: string): number | undefined {
  return value.trim() === "" ? undefined : Number(value);
}

const acceptedExtensions = [".txt", ".log"];
const maxUploadBytes = 2 * 1024 * 1024;

export function NewDiagnosisPage() {
  const [payload, setPayload] = useState<DiagnosePayload>(createInitialPayload);
  const [activeErrors, setActiveErrors] = useState<Record<string, boolean>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [loadedSampleTitle, setLoadedSampleTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const formErrors = validateDiagnosisForm(payload);
  const parsingPreview = analyzeLogContent(payload.logFile.content);
  const filePreview = buildFilePreview(payload.logFile.content);
  const canSubmit = !hasFormErrors(formErrors) && !isSubmitting;
  const missingRequiredFields = Object.entries(formErrors)
    .filter(([, message]) => Boolean(message))
    .map(([field]) => {
      switch (field) {
        case "solverName":
          return "solver";
        case "caseDescription":
          return "case";
        case "question":
          return "question";
        case "logFile":
          return "file";
        default:
          return field;
      }
    });

  useEffect(() => {
    const prefills = (location.state as { draftPayload?: DiagnosePayload } | null)?.draftPayload;
    if (!prefills) return;

    setPayload(prefills);
    setActiveErrors({});
    setError(null);
    window.history.replaceState({}, document.title);
  }, [location.state]);

  function updateField<K extends keyof DiagnosePayload["context"]>(
    key: K,
    value: DiagnosePayload["context"][K]
  ) {
    setPayload((current) => ({
      ...current,
      context: {
        ...current.context,
        [key]: value
      }
    }));
  }

  function markFieldActive(fieldName: string) {
    setActiveErrors((current) => ({
      ...current,
      [fieldName]: true
    }));
  }

  async function applyUploadedFile(file: File) {
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

    if (!acceptedExtensions.includes(extension)) {
      setError("Only .txt and .log files are supported.");
      markFieldActive("logFile");
      return;
    }

    if (file.size === 0) {
      setError("The selected file is empty. Upload a text-based solver log.");
      markFieldActive("logFile");
      return;
    }

    if (file.size > maxUploadBytes) {
      setError("The log is too large for the MVP uploader. Keep uploads under 2 MB.");
      markFieldActive("logFile");
      return;
    }

    try {
      const content = await readFileContent(file);
      if (!content.trim()) {
        setError("The selected file does not contain readable log text.");
        markFieldActive("logFile");
        return;
      }

      setError(null);
      setPayload((current) => ({
        ...current,
        logFile: {
          fileName: file.name,
          content,
          uploadedAt: new Date().toISOString()
        }
      }));
    } catch {
      setError("The file could not be read. Try another .txt or .log export.");
      markFieldActive("logFile");
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await applyUploadedFile(file);
  }

  async function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await applyUploadedFile(file);
  }

  function loadSampleLog() {
    const sample = getSampleSolverCase(sampleIndex);
    setError(null);
    setPayload(buildPayloadFromSample(sample));
    setLoadedSampleTitle(sample.title);
    setSampleIndex((current) => (current + 1) % sampleCaseCount);
    setActiveErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveErrors({
      solverName: true,
      caseDescription: true,
      question: true,
      logFile: true
    });

    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const run = saveDiagnosisRun(createDiagnosisRun(payload));
    navigate(`/results/${run.id}`);

    try {
      await runDiagnosisWorkflow(run.id, payload);
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Failed to generate report.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const parsingToneClass = useMemo(() => {
    if (parsingPreview.status === "error") return "status-danger";
    if (parsingPreview.status === "warning") return "status-warning";
    if (parsingPreview.status === "ready") return "status-success";
    return "status-neutral";
  }, [parsingPreview.status]);

  const executionStatus = isSubmitting ? "processing" : canSubmit ? "completed" : "draft";
  const fileStatus = payload.logFile.content ? "completed" : "draft";
  const parserStatus =
    parsingPreview.status === "awaiting_upload"
      ? "draft"
      : parsingPreview.status === "error"
        ? "failed"
        : parsingPreview.status === "warning"
          ? "unstable"
          : "completed";
  const readinessMessage = isSubmitting
    ? "Diagnosis workflow is running."
    : canSubmit
      ? "All required inputs are present."
      : `Missing: ${missingRequiredFields.join(", ")}.`;

  return (
    <div className="stack">
      <PageHeader
        title="New diagnosis"
        description="Enter case inputs, attach a solver log, and run the diagnostic workflow."
      />

      <form className="diagnosis-layout" onSubmit={handleSubmit}>
        <section className="stack diagnosis-form-column">
          {error ? <div className="flash">{error}</div> : null}

          <div className="compact-info-strip">
            <span>Fields marked <strong>*</strong> are required.</span>
            <span>Accepts `.txt` and `.log` up to 2 MB.</span>
          </div>

          <div className="diagnosis-section">
            <div className="diagnosis-section-header">
              <div className="eyebrow">1. Simulation</div>
              <strong>Case context</strong>
            </div>

            <div className="field">
              <label htmlFor="solverName">
                Solver name <span className="field-required">*</span>
              </label>
              <select
                id="solverName"
                value={payload.context.solverName}
                onBlur={() => markFieldActive("solverName")}
                onChange={(event) => updateField("solverName", event.target.value)}
              >
                {solverOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {activeErrors.solverName && formErrors.solverName ? (
                <span className="field-error">{formErrors.solverName}</span>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="caseDescription">
                Short case description <span className="field-required">*</span>
              </label>
              <textarea
                id="caseDescription"
                autoFocus
                value={payload.context.caseDescription}
                onBlur={() => markFieldActive("caseDescription")}
                onChange={(event) => updateField("caseDescription", event.target.value)}
                placeholder="Transonic wing-body case with outlet backflow during CFL ramp"
              />
              {activeErrors.caseDescription && formErrors.caseDescription ? (
                <span className="field-error">{formErrors.caseDescription}</span>
              ) : null}
            </div>
          </div>

          <div className="diagnosis-section">
            <div className="diagnosis-section-header">
              <div className="eyebrow">2. Flow Setup</div>
              <strong>Regime and modeling</strong>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="machNumber">Mach number</label>
                <input
                  id="machNumber"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={payload.context.machNumber ?? ""}
                  onChange={(event) => updateField("machNumber", parseOptionalNumber(event.target.value))}
                  placeholder="0.82"
                />
              </div>

              <div className="field">
                <label htmlFor="flowRegime">Flow regime</label>
                <select
                  id="flowRegime"
                  value={payload.context.flowRegime}
                  onChange={(event) => updateField("flowRegime", event.target.value)}
                >
                  {flowRegimeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="turbulenceModel">Turbulence model</label>
                <select
                  id="turbulenceModel"
                  value={payload.context.turbulenceModel}
                  onChange={(event) => updateField("turbulenceModel", event.target.value)}
                >
                  {turbulenceModelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="notes">Mesh / boundary condition notes</label>
              <textarea
                id="notes"
                value={payload.context.notes ?? ""}
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Outlet placement, mesh quality, wall treatment, initialization"
              />
            </div>
          </div>

          <div className="diagnosis-section">
            <div className="diagnosis-section-header">
              <div className="eyebrow">3. Troubleshooting Question</div>
              <strong>What needs to be explained</strong>
            </div>

            <div className="field">
              <label htmlFor="question">
                Troubleshooting question <span className="field-required">*</span>
              </label>
              <textarea
                id="question"
                value={payload.question}
                onBlur={() => markFieldActive("question")}
                onChange={(event) =>
                  setPayload((current) => ({
                    ...current,
                    question: event.target.value
                  }))
                }
                placeholder="Why does pressure correction diverge after the CFL ramp increases?"
              />
              {activeErrors.question && formErrors.question ? (
                <span className="field-error">{formErrors.question}</span>
              ) : null}
            </div>
          </div>
        </section>

        <aside className="diagnosis-sidebar">
          <section className="panel stack diagnosis-rail">
            <div className="panel-header">
              <div>
                <h2 className="section-title">Execution</h2>
                <p className="subtle">Upload, verify, and run.</p>
              </div>
              <StatusBadge value={executionStatus} />
            </div>

            <div className="execution-status-strip">
              <div className="execution-status-item">
                <span className="muted">Run</span>
                <StatusBadge value={executionStatus} />
              </div>
              <div className="execution-status-item">
                <span className="muted">File</span>
                <StatusBadge value={fileStatus} />
              </div>
              <div className="execution-status-item">
                <span className="muted">Parser</span>
                <StatusBadge value={parserStatus} />
              </div>
            </div>

            <p className="subtle execution-readiness">{readinessMessage}</p>

            <label
              className={`upload-dropzone ${isDragging ? "upload-dropzone-active" : ""}`}
              htmlFor="logFile"
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDrop={handleDrop}
            >
              <input
                id="logFile"
                type="file"
                accept=".log,.txt"
                onBlur={() => markFieldActive("logFile")}
                onChange={handleFileChange}
                disabled={isSubmitting}
              />
              <strong>Drag and drop a solver log</strong>
              <p className="subtle">Click to browse or drop a file here.</p>
              <span className="field-helper">`.txt` or `.log`</span>
            </label>

            {activeErrors.logFile && formErrors.logFile ? (
              <span className="field-error">{formErrors.logFile}</span>
            ) : null}

            <div className="button-row">
              <button className="button button-secondary" disabled={isSubmitting} onClick={loadSampleLog} type="button">
                {isSubmitting ? "Diagnosis running..." : "Load Sample Log"}
              </button>
              <button className="button button-primary" disabled={!canSubmit} type="submit">
                {isSubmitting ? "Running Diagnosis..." : "Run Diagnosis"}
              </button>
            </div>

            <div className="section-heading">
              <strong>Selected file</strong>
              <span className="muted">
                {loadedSampleTitle ? `Sample: ${loadedSampleTitle}` : "Your upload or a seeded sample."}
              </span>
            </div>
            {payload.logFile.content ? (
              <div className="stack">
                <div className="file-card">
                  <strong>{payload.logFile.fileName}</strong>
                  <span className="muted">
                    Uploaded {new Date(payload.logFile.uploadedAt).toLocaleString()}
                  </span>
                </div>
                <pre className="file-preview">{filePreview}</pre>
              </div>
            ) : (
              <div className="empty-state">No file loaded yet. Upload a solver log or use one of the seeded sample cases.</div>
            )}

            <div className="section-heading">
              <strong>Parser quick summary</strong>
              <span className="muted">Immediate parser coverage before run.</span>
            </div>
            <div className="stack">
              <div className="status-row">
                <strong className={parsingToneClass}>{parsingPreview.statusLabel}</strong>
                <span className="muted">Generic parser preview</span>
              </div>
              <div className="metric-strip">
                <div className="metric-item">
                  <span className="muted">Lines</span>
                  <strong>{parsingPreview.lineCount}</strong>
                </div>
                <div className="metric-item">
                  <span className="muted">Residuals</span>
                  <strong>{parsingPreview.residualCount}</strong>
                </div>
                <div className="metric-item">
                  <span className="muted">Warnings</span>
                  <strong>{parsingPreview.warningCount}</strong>
                </div>
                <div className="metric-item">
                  <span className="muted">Errors</span>
                  <strong>{parsingPreview.errorCount}</strong>
                </div>
              </div>
              {payload.logFile.content && parsingPreview.residualCount === 0 ? (
                <div className="report-empty-state">
                  The file loaded, but the generic parser found limited residual signals.
                  AeroSLM can still return a partial diagnosis from warnings, errors, and retrieved references.
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </form>
    </div>
  );
}
