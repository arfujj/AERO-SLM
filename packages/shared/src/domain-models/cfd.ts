import type { ParsedLogData, ResidualAnalysisAssessment } from "./diagnosis-run.js";

export type SeverityLevel = "low" | "medium" | "high" | "critical";

export interface SimulationContext {
  solverName: string;
  solverVersion?: string;
  caseDescription: string;
  flowRegime: string;
  meshCells: number;
  turbulenceModel: string;
  machNumber?: number;
  reynoldsNumber?: number;
  notes?: string;
}

export interface UploadAsset {
  fileName: string;
  content: string;
  uploadedAt: string;
}

export interface DiagnosisRequest {
  question: string;
  context: SimulationContext;
  logFile: UploadAsset;
}

export interface ParsedSolverSignal {
  label: string;
  value: string;
  severity: SeverityLevel;
  evidence: string;
}

export interface ParsedSolverLog {
  runStatus: "completed" | "failed" | "unstable" | "unknown";
  residualSignals: ParsedSolverSignal[];
  warnings: string[];
  errors: string[];
  timestepsObserved: number;
}

export interface EngineeringReference {
  id: string;
  title: string;
  sourceType: "seed-library";
  snippet: string;
  keywords: string[];
  relatedIssueTypes: string[];
}

export interface RetrievedEngineeringReference extends EngineeringReference {
  relevanceExplanation: string;
}

export interface DiagnosticFinding {
  title: string;
  severity: SeverityLevel;
  rationale: string;
  evidence: string[];
  recommendations: string[];
}

export interface DiagnosticReport {
  id: string;
  createdAt: string;
  question: string;
  context: SimulationContext;
  summary: string;
  residualAnalysis: ResidualAnalysisAssessment[];
  likelyRootCauses: DiagnosticFinding[];
  stabilizationPlan: string[];
  followUpChecks: string[];
  parsedLog: ParsedSolverLog;
  retrievedReferences: RetrievedEngineeringReference[];
}

export interface DiagnosisRecord {
  id: string;
  createdAt: string;
  question: string;
  solverName: string;
  status: ParsedSolverLog["runStatus"];
  summary: string;
}

export interface AdminDebugSnapshot {
  sampleQuestion: string;
  parserPreview: ParsedSolverLog;
  parserStructuredPreview: ParsedLogData;
  knowledgeBaseSize: number;
  validationRules: string[];
}
