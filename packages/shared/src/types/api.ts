import type {
  AdminDebugSnapshot,
  DiagnosisRecord,
  DiagnosticReport,
  DiagnosisRequest,
  ParsedSolverLog,
  RetrievedEngineeringReference
} from "../domain-models/cfd.js";
import type {
  DiagnosisResult,
  ParsedLogData,
  ResidualAnalysisAssessment
} from "../domain-models/diagnosis-run.js";

export interface DiagnoseResponse {
  report: DiagnosticReport;
  result: DiagnosisResult;
}

export interface ParseLogResponse {
  parsedLogData: ParsedLogData;
  parsedLog: ParsedSolverLog;
}

export interface ResidualAnalysisResponse {
  residualAnalysis: ResidualAnalysisAssessment[];
}

export interface RetrievalResponse {
  retrievedReferences: RetrievedEngineeringReference[];
}

export interface FinalizeDiagnosisPayload {
  payload: DiagnosisRequest;
  parsedLogData: ParsedLogData;
  residualAnalysis: ResidualAnalysisAssessment[];
  retrievedReferences: RetrievedEngineeringReference[];
}

export interface HistoryResponse {
  records: DiagnosisRecord[];
}

export interface ReportResponse {
  report: DiagnosticReport | null;
  result?: DiagnosisResult | null;
}

export interface AdminDebugResponse {
  snapshot: AdminDebugSnapshot;
}

export interface ValidationErrorResponse {
  error: string;
  details?: string[];
}

export type DiagnosePayload = DiagnosisRequest;
