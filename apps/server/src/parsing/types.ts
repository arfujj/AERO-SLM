import type { ParsedLogData, SolverDetected, UploadedLog } from "@aeroslm/shared";

export interface IngestedTextLog extends UploadedLog {
  fileExtension: string;
  normalizedText: string;
}

export interface ParseLogInput {
  fileName?: string;
  sizeBytes?: number;
  mimeType?: string;
  uploadedAt?: string;
  rawText: unknown;
}

export interface SolverLogParser {
  parserType: ParsedLogData["parserType"];
  solverDetected: SolverDetected;
  canParse(input: IngestedTextLog): boolean;
  parse(input: IngestedTextLog): ParsedLogData;
}
