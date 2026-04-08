import { physicsValidationRules } from "@aeroslm/shared";
import type { DiagnosePayload } from "@aeroslm/shared";

export function validateDiagnosisRequest(payload: Partial<DiagnosePayload>): string[] {
  const issues: string[] = [];

  if (!payload.question?.trim()) {
    issues.push("A troubleshooting question is required.");
  }

  if (!payload.context?.solverName?.trim()) {
    issues.push("Solver name is required.");
  }

  if (!payload.context?.caseDescription?.trim()) {
    issues.push("Short case description is required.");
  }

  if (!payload.context?.flowRegime?.trim()) {
    issues.push("Flow regime is required.");
  }

  if (!payload.context?.turbulenceModel?.trim()) {
    issues.push("Turbulence model is required.");
  }

  if (!payload.context?.meshCells || payload.context.meshCells <= 0) {
    issues.push("Mesh cells must be a positive number.");
  }

  if (!payload.logFile?.content?.trim()) {
    issues.push("Solver log content is required.");
  }

  return issues;
}

export const validationRuleDescriptions = [
  "Question, solver name, short case description, flow regime, turbulence model, and log content are mandatory.",
  "Mesh cell count must be positive.",
  ...physicsValidationRules
];
