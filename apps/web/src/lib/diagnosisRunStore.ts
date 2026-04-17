import type {
  DiagnosePayload,
  DiagnosisResult,
  DiagnosisRun,
  DiagnosisProgressStage,
  DetectedIssue,
  DiagnosticFinding,
  DiagnosticReport,
  ParsedLogData,
  ResidualSeries,
  Recommendation,
  SupportingReference,
  UploadedLog,
  ValidationFlag
} from "@aeroslm/shared";

const STORAGE_KEY = "aeroslm.diagnosis-runs";
const STORAGE_EVENT = "aeroslm:runs-updated";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readRuns(): DiagnosisRun[] {
  if (!canUseStorage()) return [];

  const rawValue = window.localStorage.getItem(STORAGE_KEY);
  if (!rawValue) return [];

  try {
    return JSON.parse(rawValue) as DiagnosisRun[];
  } catch {
    return [];
  }
}

function writeRuns(runs: DiagnosisRun[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
}

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createUploadedLog(payload: DiagnosePayload): UploadedLog {
  const lines = payload.logFile.content.split(/\r?\n/);

  return {
    id: createId("log"),
    fileName: payload.logFile.fileName,
    fileType: payload.logFile.fileName.split(".").at(-1) ?? "txt",
    mimeType: "text/plain",
    sizeBytes: payload.logFile.content.length,
    uploadedAt: payload.logFile.uploadedAt,
    rawText: payload.logFile.content,
    lines,
    lineCount: lines.length,
    content: payload.logFile.content
  };
}

function inferIssueType(finding: DiagnosticFinding): DetectedIssue["issueType"] {
  const normalized = `${finding.title} ${finding.rationale}`.toLowerCase();
  if (normalized.includes("boundary")) return "boundary-condition";
  if (normalized.includes("mesh")) return "mesh-quality";
  if (normalized.includes("physics")) return "physics-consistency";
  if (normalized.includes("stability") || normalized.includes("pressure-velocity")) {
    return "numerical-stability";
  }
  if (normalized.includes("continuity") || normalized.includes("convergence")) return "convergence";
  return "unknown";
}

function createValidationFlags(report: DiagnosticReport): ValidationFlag[] {
  const flags: ValidationFlag[] = [
    {
      id: createId("flag"),
      rule: "parsed-log-available",
      severity: report.parsedLog.residualSignals.length > 0 ? "info" : "caution",
      message:
        report.parsedLog.residualSignals.length > 0
          ? "Residual signals were parsed from the uploaded solver log."
          : "No residual series were extracted from the uploaded solver log.",
      triggeredBy: `parsed residual signal count=${report.parsedLog.residualSignals.length}`,
      suppressed: false
    }
  ];

  if (report.parsedLog.errors.length > 0) {
    flags.push({
      id: createId("flag"),
      rule: "solver-errors-detected",
      severity: "critical",
      message: "The solver log contains explicit error messages.",
      triggeredBy: report.parsedLog.errors[0],
      suppressed: false
    });
  }

  if (report.parsedLog.warnings.length > 0) {
    flags.push({
      id: createId("flag"),
      rule: "solver-warnings-detected",
      severity: "caution",
      message: "The solver log contains warnings that may affect solution quality.",
      triggeredBy: report.parsedLog.warnings[0],
      suppressed: false
    });
  }

  return flags;
}

function createSupportingReferences(report: DiagnosticReport): SupportingReference[] {
  const knowledgeReferences = report.retrievedReferences.map<SupportingReference>((reference) => ({
    id: reference.id,
    title: reference.title,
    sourceType: "knowledge-base",
    summary: reference.snippet,
    excerpt: reference.relevanceExplanation
  }));

  const parserReferences = report.parsedLog.residualSignals.map<SupportingReference>((signal) => ({
    id: createId("ref"),
    title: signal.label,
    sourceType: "parser",
    summary: signal.evidence,
    excerpt: signal.value
  }));

  return [...knowledgeReferences, ...parserReferences];
}

function mapRecommendations(
  report: DiagnosticReport,
  supportingReferences: SupportingReference[],
  validationFlags: ValidationFlag[]
): Recommendation[] {
  return report.stabilizationPlan.map((action, index) => ({
    id: createId("rec"),
    title: `Recommended action ${index + 1}`,
    action,
    rationale: report.followUpChecks[index] ?? report.summary,
    priority: index === 0 ? "high" : "medium",
    confidence: 0.72,
    rank: index + 1,
    groundedBy: [report.summary, ...(supportingReferences[0] ? [supportingReferences[0].title] : [])],
    references: supportingReferences.slice(0, 2),
    validationFlags
  }));
}

function mapDetectedIssues(
  report: DiagnosticReport,
  supportingReferences: SupportingReference[],
  validationFlags: ValidationFlag[]
): DetectedIssue[] {
  return report.likelyRootCauses.map((finding) => ({
    id: createId("issue"),
    issueType: inferIssueType(finding),
    title: finding.title,
    summary: finding.rationale,
    severity: finding.severity,
    confidence: 0.78,
    warnings: finding.evidence,
    references: supportingReferences.slice(0, 3),
    validationFlags
  }));
}

function mapParsedLogData(report: DiagnosticReport): ParsedLogData {
  const residualSeries: ResidualSeries[] = report.parsedLog.residualSignals.map((signal) => {
    const parsedValue = Number.parseFloat(signal.value);
    const numericValue = Number.isFinite(parsedValue) ? parsedValue : null;
    const trend: ResidualSeries["trend"] =
      signal.severity === "low" ? "improving" : signal.severity === "medium" ? "flat" : "worsening";

    return {
      id: createId("res"),
      metric: signal.label,
      samples: [
        {
          step: report.parsedLog.timestepsObserved || null,
          value: numericValue,
          rawValue: signal.value
        }
      ],
      lastValue: numericValue,
      trend
    };
  });

  const iterations = report.parsedLog.timestepsObserved ? [report.parsedLog.timestepsObserved] : [];
  const missingFields = ["cflEntries", "fatalMessages", "metadata"];

  return {
    parsedAt: report.createdAt,
    parserVersion: "report-adapter-v1",
    parserType: "generic-text-v1",
    solverDetected: report.context.solverName === "OpenFOAM" ? "OpenFOAM" : "Unknown",
    rawText: "",
    normalizedText: "",
    lines: [],
    lineCount: 0,
    iterations,
    residualEntries: residualSeries.flatMap((series) =>
      series.samples.map((sample) => ({
        field: series.metric,
        iteration: sample.step,
        rawValue: sample.rawValue,
        value: sample.value,
        sourceLine: `${series.metric} residual = ${sample.rawValue}`
      }))
    ),
    cflEntries: [],
    fatalMessages: [],
    notices: [],
    metadata: {},
    parseCoverage: {
      iterations: iterations.length > 0 ? "available" : "unavailable",
      residuals: residualSeries.length > 0 ? "available" : "unavailable",
      cfl: "unavailable",
      warnings: report.parsedLog.warnings.length > 0 ? "available" : "unavailable",
      errors: report.parsedLog.errors.length > 0 ? "available" : "unavailable",
      fatalMessages: "unavailable",
      notices: "unavailable",
      metadata: "unavailable",
      status: "partial",
      missingFields
    },
    unsupportedPatterns: [],
    parseStatus: "partial",
    sourceFormat: "generic-v1",
    status: report.parsedLog.runStatus,
    rawLineCount: 0,
    iterationNumbers: iterations,
    lastIteration: report.parsedLog.timestepsObserved || null,
    timestepCount: report.parsedLog.timestepsObserved,
    cflSeries: null,
    warnings: report.parsedLog.warnings,
    errors: report.parsedLog.errors,
    solverMessages: [],
    convergencePatterns: [...report.parsedLog.warnings, ...report.parsedLog.errors],
    missingFields,
    residualSeries
  };
}

export function mapReportToDiagnosisResult(report: DiagnosticReport): DiagnosisResult {
  const supportingReferences = createSupportingReferences(report);
  const validationFlags = createValidationFlags(report);

  return {
    id: createId("result"),
    createdAt: report.createdAt,
    updatedAt: report.createdAt,
    summary: report.summary,
    confidence:
      report.residualAnalysis.length > 0
        ? Math.max(...report.residualAnalysis.map((assessment) => assessment.confidence))
        : 0.5,
    warnings: [...report.parsedLog.warnings, ...report.parsedLog.errors],
    parsedSummary: {
      status: report.parsedLog.runStatus,
      lastIteration: report.parsedLog.timestepsObserved || null,
      residualOverview:
        report.parsedLog.residualSignals.length > 0
          ? `Tracked residuals: ${report.parsedLog.residualSignals.map((signal) => signal.label).join(", ")}.`
          : "No residual values could be extracted from the uploaded log.",
      residualMetrics: report.parsedLog.residualSignals.map((signal) => signal.label),
      warningCount: report.parsedLog.warnings.length,
      errorCount: report.parsedLog.errors.length,
      missingFields: ["cflValues", "solverMessages"]
    },
    primaryIssue: mapDetectedIssues(report, supportingReferences, validationFlags)[0] ?? null,
    supportingReferences,
    validationFlags,
    detectedIssues: mapDetectedIssues(report, supportingReferences, validationFlags),
    likelyCauses: report.likelyRootCauses.map((finding, index) => ({
      id: createId("cause"),
      title: finding.title,
      rationale: finding.rationale,
      confidence: 0.7,
      rank: index + 1,
      evidence: finding.evidence
    })),
    recommendations: mapRecommendations(report, supportingReferences, validationFlags),
    nextBestAction: mapRecommendations(report, supportingReferences, validationFlags)[0] ?? null,
    parsedLogData: mapParsedLogData(report),
    residualAnalysis: report.residualAnalysis,
    report
  };
}

export function createDiagnosisRun(payload: DiagnosePayload): DiagnosisRun {
  const now = new Date().toISOString();

  return {
    id: createId("run"),
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    status: "processing",
    statusMessage: "Preparing diagnosis run.",
    currentStage: "uploading-log",
    completedStages: [],
    question: payload.question,
    uploadedLog: createUploadedLog(payload),
    simulationContext: payload.context,
    request: payload
  };
}

export function loadDiagnosisRuns(): DiagnosisRun[] {
  return readRuns().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function getDiagnosisRunById(id: string): DiagnosisRun | null {
  return readRuns().find((run) => run.id === id) ?? null;
}

export function saveDiagnosisRun(run: DiagnosisRun): DiagnosisRun {
  const runs = readRuns();
  const existingIndex = runs.findIndex((item) => item.id === run.id);
  const nextRun = {
    ...run,
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    runs[existingIndex] = nextRun;
  } else {
    runs.unshift(nextRun);
  }

  writeRuns(runs);
  return nextRun;
}

export function updateDiagnosisRun(
  runId: string,
  updater: (run: DiagnosisRun) => DiagnosisRun
): DiagnosisRun | null {
  const current = getDiagnosisRunById(runId);
  if (!current) return null;
  const next = updater(current);
  return saveDiagnosisRun(next);
}

export function markDiagnosisRunProcessing(runId: string, statusMessage = "Processing uploaded solver log."): DiagnosisRun | null {
  return updateDiagnosisRun(runId, (run) => ({
    ...run,
    status: "processing",
    statusMessage,
    startedAt: run.startedAt ?? new Date().toISOString(),
    errorMessage: undefined
  }));
}

export function updateDiagnosisRunStage(
  runId: string,
  stage: DiagnosisProgressStage,
  statusMessage: string,
  partialResult?: Partial<DiagnosisResult>
): DiagnosisRun | null {
  return updateDiagnosisRun(runId, (run) => ({
    ...run,
    status: "processing",
    currentStage: stage,
    completedStages: Array.from(new Set([...(run.completedStages ?? []), stage])),
    statusMessage,
    partialResult: partialResult ?? run.partialResult,
    errorMessage: undefined
  }));
}

export function completeDiagnosisRun(
  runId: string,
  report: DiagnosticReport,
  result?: DiagnosisResult
): DiagnosisRun | null {
  return updateDiagnosisRun(runId, (run) => ({
    ...run,
    status: "completed",
    statusMessage: "Diagnosis completed.",
    completedAt: new Date().toISOString(),
    currentStage: "generating-report",
    completedStages: [
      "uploading-log",
      "parsing-iterations-and-residuals",
      "detecting-convergence-behavior",
      "retrieving-engineering-references",
      "applying-physics-validation",
      "generating-report"
    ],
    reportId: report.id,
    result: result ?? mapReportToDiagnosisResult(report),
    partialResult: undefined
  }));
}

export function failDiagnosisRun(
  runId: string,
  errorMessage: string,
  partialResult?: Partial<DiagnosisResult>
): DiagnosisRun | null {
  return updateDiagnosisRun(runId, (run) => ({
    ...run,
    status: "failed",
    statusMessage: "Diagnosis failed.",
    completedAt: new Date().toISOString(),
    errorMessage,
    partialResult: partialResult ?? run.partialResult
  }));
}

export function deleteDiagnosisRun(runId: string): void {
  writeRuns(readRuns().filter((run) => run.id !== runId));
}

export function subscribeDiagnosisRuns(onChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: Event) => {
    if (event instanceof StorageEvent && event.key && event.key !== STORAGE_KEY) {
      return;
    }
    onChange();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(STORAGE_EVENT, handleStorage);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STORAGE_EVENT, handleStorage);
  };
}
