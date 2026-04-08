import type { DiagnosePayload } from "@aeroslm/shared";

export const solverOptions = [
  "ANSYS Fluent",
  "OpenFOAM",
  "SU2",
  "Generic Solver Log"
] as const;

export const flowRegimeOptions = [
  "Subsonic",
  "Transonic",
  "Supersonic",
  "Hypersonic",
  "Unknown"
] as const;

export const turbulenceModelOptions = [
  "k-epsilon",
  "k-omega SST",
  "Spalart-Allmaras",
  "LES",
  "RANS",
  "Unknown"
] as const;

export interface FormErrors {
  solverName?: string;
  caseDescription?: string;
  question?: string;
  logFile?: string;
}

export interface ParsingPreview {
  lineCount: number;
  warningCount: number;
  errorCount: number;
  residualCount: number;
  status: "awaiting_upload" | "ready" | "warning" | "error";
  statusLabel: string;
}

export function createInitialPayload(): DiagnosePayload {
  return {
    question: "",
    context: {
      solverName: "ANSYS Fluent",
      solverVersion: "2024 R2",
      caseDescription: "",
      flowRegime: "Transonic",
      meshCells: 4500000,
      turbulenceModel: "k-omega SST",
      machNumber: 0.82,
      reynoldsNumber: 6200000,
      notes: ""
    },
    logFile: {
      fileName: "",
      content: "",
      uploadedAt: new Date().toISOString()
    }
  };
}

export function validateDiagnosisForm(payload: DiagnosePayload): FormErrors {
  const errors: FormErrors = {};

  if (!payload.context.solverName.trim()) {
    errors.solverName = "Select a solver.";
  }

  if (!payload.context.caseDescription.trim()) {
    errors.caseDescription = "Add a short case description.";
  }

  if (!payload.question.trim()) {
    errors.question = "Enter the troubleshooting question.";
  }

  if (!payload.logFile.content.trim()) {
    errors.logFile = "Upload a .txt or .log solver file.";
  }

  return errors;
}

export function hasFormErrors(errors: FormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

export function analyzeLogContent(content: string): ParsingPreview {
  if (!content.trim()) {
    return {
      lineCount: 0,
      warningCount: 0,
      errorCount: 0,
      residualCount: 0,
      status: "awaiting_upload",
      statusLabel: "Awaiting upload"
    };
  }

  const lineCount = content.split(/\r?\n/).filter(Boolean).length;
  const warningCount = [...content.matchAll(/Warning:/g)].length;
  const errorCount = [...content.matchAll(/Error:/g)].length;
  const residualCount = [...content.matchAll(/residual =/gi)].length;

  if (errorCount > 0) {
    return {
      lineCount,
      warningCount,
      errorCount,
      residualCount,
      status: "error",
      statusLabel: "Errors detected"
    };
  }

  if (warningCount > 0 || residualCount > 0) {
    return {
      lineCount,
      warningCount,
      errorCount,
      residualCount,
      status: "warning",
      statusLabel: "Parsable solver signals found"
    };
  }

  return {
    lineCount,
    warningCount,
    errorCount,
    residualCount,
    status: "ready",
    statusLabel: "File loaded"
  };
}

export function buildFilePreview(content: string): string {
  return content.split(/\r?\n/).slice(0, 8).join("\n");
}
