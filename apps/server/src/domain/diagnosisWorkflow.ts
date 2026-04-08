import type {
  DiagnosePayload,
  DiagnosticReport,
  RetrievedEngineeringReference,
  ParsedSolverLog
} from "@aeroslm/shared";

export interface DiagnosisWorkflowDependencies {
  validate(payload: Partial<DiagnosePayload>): string[];
  parse(logContent: string): ParsedSolverLog;
  retrieve(parsedLog: ParsedSolverLog, payload: DiagnosePayload): RetrievedEngineeringReference[];
  diagnose(payload: DiagnosePayload): DiagnosticReport;
}
