import type { DiagnosisRequest, DiagnosticReport, SeverityLevel, SimulationContext } from "./cfd.js";

export type DiagnosisRunStatus = "draft" | "queued" | "processing" | "completed" | "failed";
export type DiagnosisProgressStage =
  | "uploading-log"
  | "parsing-iterations-and-residuals"
  | "detecting-convergence-behavior"
  | "retrieving-engineering-references"
  | "applying-physics-validation"
  | "generating-report";
export type ResidualIssueClassification =
  | "divergence"
  | "oscillatory-convergence"
  | "residual-stagnation"
  | "slow-convergence";
export type IssueType =
  | "convergence"
  | "boundary-condition"
  | "mesh-quality"
  | "numerical-stability"
  | "physics-consistency"
  | "unknown";
export type RecommendationPriority = "low" | "medium" | "high";
export type ReferenceSourceType = "knowledge-base" | "parser" | "solver-log" | "validation";
export type ValidationSeverity = "info" | "caution" | "critical";
export type ParserType = "openfoam-v1" | "generic-text-v1";
export type SolverDetected = "OpenFOAM" | "Unknown";
export type ParserAvailability = "available" | "unavailable";
export type ParserCoverageStatus = "complete" | "partial" | "minimal";
export type ParserOutcomeStatus = "parsed" | "partial" | "unsupported" | "failed";

export interface UploadedLog {
  id: string;
  fileName: string;
  fileType: string;
  mimeType?: string;
  sizeBytes: number;
  uploadedAt: string;
  rawText: string;
  lines: string[];
  lineCount: number;
  content: string;
}

export interface ResidualSample {
  step: number | null;
  value: number | null;
  rawValue: string;
}

export interface ResidualSeries {
  id: string;
  metric: string;
  samples: ResidualSample[];
  lastValue: number | null;
  trend: "improving" | "flat" | "worsening" | "unknown";
}

export interface NumericSeries {
  id: string;
  metric: string;
  samples: ResidualSample[];
  lastValue: number | null;
}

export interface ParsedResidualEntry {
  field: string;
  iteration: number | null;
  rawValue: string;
  value: number | null;
  sourceLine: string;
}

export interface ParsedCflEntry {
  metric: string;
  iteration: number | null;
  rawValue: string;
  value: number | null;
  sourceLine: string;
}

export interface ParserCoverage {
  iterations: ParserAvailability;
  residuals: ParserAvailability;
  cfl: ParserAvailability;
  warnings: ParserAvailability;
  errors: ParserAvailability;
  fatalMessages: ParserAvailability;
  notices: ParserAvailability;
  metadata: ParserAvailability;
  status: ParserCoverageStatus;
  missingFields: string[];
}

export interface SupportingReference {
  id: string;
  title: string;
  sourceType: ReferenceSourceType;
  summary: string;
  excerpt?: string;
}

export interface ValidationFlag {
  id: string;
  rule: string;
  severity: ValidationSeverity;
  message: string;
  triggeredBy: string;
  recommendationId?: string;
  suppressed: boolean;
}

export interface DetectedIssue {
  id: string;
  issueType: IssueType;
  title: string;
  summary: string;
  severity: SeverityLevel;
  confidence: number;
  warnings: string[];
  references: SupportingReference[];
  validationFlags: ValidationFlag[];
}

export interface ParsedSummary {
  status: ParsedLogData["status"];
  lastIteration: number | null;
  residualOverview: string;
  residualMetrics: string[];
  warningCount: number;
  errorCount: number;
  missingFields: string[];
}

export interface LikelyCause {
  id: string;
  title: string;
  rationale: string;
  confidence: number;
  rank: number;
  evidence: string[];
}

export interface Recommendation {
  id: string;
  title: string;
  action: string;
  rationale: string;
  priority: RecommendationPriority;
  confidence: number;
  rank: number;
  groundedBy: string[];
  references: SupportingReference[];
  validationFlags: ValidationFlag[];
}

export interface ParsedLogData {
  parsedAt: string;
  parserVersion: string;
  parserType: ParserType;
  solverDetected: SolverDetected;
  rawText: string;
  normalizedText: string;
  lines: string[];
  lineCount: number;
  iterations: number[];
  residualEntries: ParsedResidualEntry[];
  cflEntries: ParsedCflEntry[];
  fatalMessages: string[];
  notices: string[];
  metadata: Record<string, string>;
  parseCoverage: ParserCoverage;
  unsupportedPatterns: string[];
  parseStatus: ParserOutcomeStatus;
  sourceFormat: "openfoam-v1" | "generic-v1" | "unknown";
  status: "completed" | "failed" | "unstable" | "unknown";
  rawLineCount: number;
  iterationNumbers: number[];
  lastIteration: number | null;
  timestepCount: number;
  cflSeries: NumericSeries | null;
  warnings: string[];
  errors: string[];
  solverMessages: string[];
  convergencePatterns: string[];
  missingFields: string[];
  residualSeries: ResidualSeries[];
}

export interface ResidualAnalysisDebug {
  analyzedSeriesCount: number;
  totalNumericSamples: number;
  matchedMetrics: string[];
  windowLength: number;
  averageRelativeChange: number | null;
  signChangeCount: number;
  scoreBreakdown: string[];
  weakData: boolean;
}

export interface ResidualAnalysisAssessment {
  classification: ResidualIssueClassification;
  confidence: number;
  rationale: string;
  trendSummary: string;
  debug: ResidualAnalysisDebug;
}

export interface DiagnosisResult {
  id: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  confidence: number;
  warnings: string[];
  parsedSummary: ParsedSummary;
  primaryIssue: DetectedIssue | null;
  supportingReferences: SupportingReference[];
  validationFlags: ValidationFlag[];
  detectedIssues: DetectedIssue[];
  likelyCauses: LikelyCause[];
  recommendations: Recommendation[];
  nextBestAction: Recommendation | null;
  parsedLogData: ParsedLogData;
  residualAnalysis: ResidualAnalysisAssessment[];
  report?: DiagnosticReport;
}

export interface DiagnosisRun {
  id: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  status: DiagnosisRunStatus;
  statusMessage: string;
  question: string;
  uploadedLog: UploadedLog;
  simulationContext: SimulationContext;
  request: DiagnosisRequest;
  result?: DiagnosisResult;
  partialResult?: Partial<DiagnosisResult>;
  currentStage?: DiagnosisProgressStage;
  completedStages?: DiagnosisProgressStage[];
  errorMessage?: string;
  reportId?: string;
}
