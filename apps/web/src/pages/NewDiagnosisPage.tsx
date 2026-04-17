import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { DiagnosePayload } from "@aeroslm/shared";
import { PageHeader } from "../components/PageHeader";
import { RuledLineInput } from "../components/RuledLineInput";
import { StatusBadge } from "../components/StatusBadge";
import {
  analyzeLogContent,
  buildFilePreview,
  createInitialPayload,
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
const simulationTypeOptions = [
  "Steady state",
  "Transient",
  "Pseudo-transient",
  "Unknown"
] as const;

interface StructuredNotesFields {
  meshSetup: string[];
  mesherSetup: string[];
  refinement: string[];
  physicsModelDetails: string[];
  boundaryConditions: string[];
  cflNumber: string;
  simulationType: string;
}

interface StructuredQuestionFields {
  query: string;
}

function parseStructuredNotes(notes?: string): StructuredNotesFields {
  function splitDetail(value: string): string[] {
    return value
      .split(/\s*(?:;|\||\n)\s*/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!notes?.trim()) {
    return {
      meshSetup: [],
      mesherSetup: [],
      refinement: [],
      physicsModelDetails: [],
      boundaryConditions: [],
      cflNumber: "",
      simulationType: "Steady state"
    };
  }

  const lines = notes.split("\n").map((line) => line.trim()).filter(Boolean);
  const parsed: StructuredNotesFields = {
    meshSetup: [],
    mesherSetup: [],
    refinement: [],
    physicsModelDetails: [],
    boundaryConditions: [],
    cflNumber: "",
    simulationType: "Steady state"
  };

  for (const line of lines) {
    if (line.startsWith("Mesh setup:")) {
      parsed.meshSetup = splitDetail(line.replace("Mesh setup:", "").trim());
    } else if (line.startsWith("Mesher setup:")) {
      parsed.mesherSetup = splitDetail(line.replace("Mesher setup:", "").trim());
    } else if (line.startsWith("Refinement:")) {
      parsed.refinement = splitDetail(line.replace("Refinement:", "").trim());
    } else if (line.startsWith("Physics model:")) {
      parsed.physicsModelDetails = splitDetail(line.replace("Physics model:", "").trim());
    } else if (line.startsWith("Boundary conditions:")) {
      parsed.boundaryConditions = splitDetail(line.replace("Boundary conditions:", "").trim());
    } else if (line.startsWith("CFL number:")) {
      parsed.cflNumber = line.replace("CFL number:", "").trim();
    } else if (line.startsWith("Simulation type:")) {
      parsed.simulationType = line.replace("Simulation type:", "").trim();
    }
  }

  if (
    parsed.meshSetup.length === 0 &&
    parsed.mesherSetup.length === 0 &&
    parsed.refinement.length === 0 &&
    parsed.physicsModelDetails.length === 0 &&
    parsed.boundaryConditions.length === 0 &&
    !parsed.cflNumber &&
    !parsed.simulationType
  ) {
    parsed.meshSetup = splitDetail(notes);
  }

  return parsed;
}

function composeStructuredNotes(fields: StructuredNotesFields): string {
  return [
    fields.meshSetup.filter(Boolean).length > 0
      ? `Mesh setup: ${fields.meshSetup.filter(Boolean).join("; ")}`
      : "",
    fields.mesherSetup.filter(Boolean).length > 0
      ? `Mesher setup: ${fields.mesherSetup.filter(Boolean).join("; ")}`
      : "",
    fields.refinement.filter(Boolean).length > 0
      ? `Refinement: ${fields.refinement.filter(Boolean).join("; ")}`
      : "",
    fields.physicsModelDetails.filter(Boolean).length > 0
      ? `Physics model: ${fields.physicsModelDetails.filter(Boolean).join("; ")}`
      : "",
    fields.boundaryConditions.filter(Boolean).length > 0
      ? `Boundary conditions: ${fields.boundaryConditions.filter(Boolean).join("; ")}`
      : "",
    fields.cflNumber.trim() ? `CFL number: ${fields.cflNumber.trim()}` : "",
    fields.simulationType.trim() ? `Simulation type: ${fields.simulationType.trim()}`
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function parseStructuredQuestion(question: string): StructuredQuestionFields {
  if (!question.trim()) {
    return {
      query: ""
    };
  }

  return {
    query: question
  };
}

function composeStructuredQuestion(fields: StructuredQuestionFields): string {
  return fields.query.trim();
}

export function NewDiagnosisPage() {
  const [payload, setPayload] = useState<DiagnosePayload>(createInitialPayload);
  const [structuredNotes, setStructuredNotes] = useState<StructuredNotesFields>({
    meshSetup: [],
    mesherSetup: [],
    refinement: [],
    physicsModelDetails: [],
    boundaryConditions: [],
    cflNumber: "",
    simulationType: "Steady state"
  });
  const [structuredQuestion, setStructuredQuestion] = useState<StructuredQuestionFields>({
    query: ""
  });
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

  function applyPayload(nextPayload: DiagnosePayload) {
    setPayload(nextPayload);
    setStructuredNotes(parseStructuredNotes(nextPayload.context.notes ?? ""));
    setStructuredQuestion(parseStructuredQuestion(nextPayload.question));
  }

  useEffect(() => {
    const prefills = (location.state as { draftPayload?: DiagnosePayload } | null)?.draftPayload;
    if (!prefills) return;

    applyPayload(prefills);
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

  function updateNotesField<K extends keyof StructuredNotesFields>(
    key: K,
    value: StructuredNotesFields[K]
  ) {
    setStructuredNotes((current) => {
      const next = {
        ...current,
        [key]: value
      };
      updateField("notes", composeStructuredNotes(next));
      return next;
    });
  }

  function updateQuestionField<K extends keyof StructuredQuestionFields>(
    key: K,
    value: StructuredQuestionFields[K]
  ) {
    setStructuredQuestion((current) => {
      const next = {
        ...current,
        [key]: value
      };
      setPayload((existing) => ({
        ...existing,
        question: composeStructuredQuestion(next)
      }));
      return next;
    });
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
    applyPayload(buildPayloadFromSample(sample));
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
                Solver <span className="field-required">*</span>
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
              <div className="eyebrow">2. Mesh Setup</div>
              <strong>Grid and initialization</strong>
            </div>

            <div className="field">
              <label htmlFor="mesherSetup">Mesher setup</label>
              <RuledLineInput
                id="mesherSetup"
                value={structuredNotes.mesherSetup}
                onChange={(next) => updateNotesField("mesherSetup", next)}
                placeholders={[
                  "snappyHexMesh layers",
                  "Prism growth rate",
                  "Surface refinement level",
                  "Volume refinement controls",
                  "Feature edge capture"
                ]}
                addLabel="Add mesher detail"
              />
            </div>

            <div className="field">
              <label htmlFor="meshSetup">Mesh setup</label>
              <RuledLineInput
                id="meshSetup"
                value={structuredNotes.meshSetup}
                onChange={(next) =>
                  updateNotesField(
                    "meshSetup",
                    next.map((item) => item.trimStart())
                  )
                }
                placeholders={[
                  "Mesh size / base cell size",
                  "Target y+",
                  "Prism layer count",
                  "First layer thickness",
                  "Surface growth rate"
                ]}
                addLabel="Add mesh detail"
              />
            </div>

            <div className="field">
              <label htmlFor="refinement">Refinement</label>
              <RuledLineInput
                id="refinement"
                value={structuredNotes.refinement}
                onChange={(next) =>
                  updateNotesField(
                    "refinement",
                    next.map((item) => item.trimStart())
                  )
                }
                placeholders={[
                  "Surface refinement level",
                  "Volume refinement region",
                  "Wake refinement extent",
                  "Leading/trailing edge refinement"
                ]}
                addLabel="Add refinement detail"
              />
            </div>
          </div>

          <div className="diagnosis-section">
            <div className="diagnosis-section-header">
              <div className="eyebrow">3. Flow Setup</div>
              <strong>Models and boundary setup</strong>
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
              <label htmlFor="physicsModelDetails">Physics model details</label>
              <RuledLineInput
                id="physicsModelDetails"
                value={structuredNotes.physicsModelDetails}
                onChange={(next) => updateNotesField("physicsModelDetails", next)}
                placeholder="Compressibility model"
                addLabel="Add physics detail"
              />
            </div>

            <div className="field">
              <label htmlFor="boundaryConditions">Boundary conditions</label>
              <RuledLineInput
                id="boundaryConditions"
                value={structuredNotes.boundaryConditions}
                onChange={(next) => updateNotesField("boundaryConditions", next)}
                placeholder="Inlet total pressure"
                addLabel="Add boundary condition"
              />
            </div>
          </div>

          <div className="diagnosis-section">
            <div className="diagnosis-section-header">
              <div className="eyebrow">4. Solver Setup</div>
              <strong>Solver controls</strong>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="solverSelection">Solver selection</label>
                <select
                  id="solverSelection"
                  value={payload.context.solverName}
                  onChange={(event) => updateField("solverName", event.target.value)}
                >
                  {solverOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="cflNumber">CFL Number</label>
                <input
                  id="cflNumber"
                  type="text"
                  value={structuredNotes.cflNumber}
                  onChange={(event) => updateNotesField("cflNumber", event.target.value)}
                  placeholder="25"
                />
              </div>

              <div className="field">
                <label htmlFor="simulationType">Simulation type</label>
                <select
                  id="simulationType"
                  value={structuredNotes.simulationType}
                  onChange={(event) => updateNotesField("simulationType", event.target.value)}
                >
                  {simulationTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="diagnosis-section">
            <div className="diagnosis-section-header">
              <div className="eyebrow">5. Troubleshooting Question</div>
              <strong>Troubleshooting query</strong>
            </div>

            <div className="field">
              <label htmlFor="troubleshootingQuery">
                Troubleshooting query <span className="field-required">*</span>
              </label>
              <textarea
                id="troubleshootingQuery"
                value={structuredQuestion.query}
                onBlur={() => markFieldActive("question")}
                onChange={(event) => updateQuestionField("query", event.target.value)}
                placeholder="Why does pressure correction diverge after the CFL ramp increases?"
              />
            </div>

            {activeErrors.question && formErrors.question ? (
              <span className="field-error">{formErrors.question}</span>
            ) : null}
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
