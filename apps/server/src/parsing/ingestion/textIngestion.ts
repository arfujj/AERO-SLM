import { randomUUID } from "node:crypto";
import type { IngestedTextLog, ParseLogInput } from "../types.js";

const supportedExtensions = new Set([".txt", ".log", ""]);
export const maxUploadBytes = 2 * 1024 * 1024;

export class LogIngestionError extends Error {
  readonly code:
    | "unsupported-file-type"
    | "empty-file"
    | "file-too-large"
    | "unreadable-file";

  constructor(
    code: LogIngestionError["code"],
    message: string
  ) {
    super(message);
    this.name = "LogIngestionError";
    this.code = code;
  }
}

function inferExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0) return "";
  return fileName.slice(lastDot).toLowerCase();
}

function inferMimeType(fileExtension: string, mimeType?: string): string {
  if (mimeType?.trim()) return mimeType.trim();
  if (fileExtension === ".log") return "text/plain";
  if (fileExtension === ".txt") return "text/plain";
  return "text/plain";
}

function sanitizeText(rawText: string): string {
  return rawText
    .replace(/^\uFEFF/, "")
    .replace(/\u0000+/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n");
}

export function ingestTextLog(input: ParseLogInput): IngestedTextLog {
  const fileName = input.fileName?.trim() || "uploaded.log";
  const fileExtension = inferExtension(fileName);

  if (!supportedExtensions.has(fileExtension)) {
    throw new LogIngestionError(
      "unsupported-file-type",
      "Unsupported file type. AeroSLM accepts .txt and .log files."
    );
  }

  if (typeof input.rawText !== "string") {
    throw new LogIngestionError(
      "unreadable-file",
      "The uploaded file could not be read as text. Export the solver log as plain text and try again."
    );
  }

  const sizeBytes = input.sizeBytes ?? Buffer.byteLength(input.rawText, "utf8");

  if (sizeBytes === 0 || input.rawText.length === 0) {
    throw new LogIngestionError(
      "empty-file",
      "The uploaded file is empty. Upload a text-based solver log."
    );
  }

  if (sizeBytes > maxUploadBytes) {
    throw new LogIngestionError(
      "file-too-large",
      `The uploaded file is too large for the MVP ingestion flow. Keep files under ${Math.round(maxUploadBytes / (1024 * 1024))} MB.`
    );
  }

  const normalizedText = sanitizeText(input.rawText);

  if (!normalizedText.trim()) {
    throw new LogIngestionError(
      "empty-file",
      "The uploaded file does not contain readable log text."
    );
  }

  const lines = normalizedText.split("\n");
  const uploadedAt = input.uploadedAt ?? new Date().toISOString();
  const mimeType = inferMimeType(fileExtension, input.mimeType);

  return {
    id: randomUUID(),
    fileName,
    fileType: fileExtension.replace(/^\./, "") || "txt",
    mimeType,
    sizeBytes,
    uploadedAt,
    rawText: normalizedText,
    lines,
    lineCount: lines.length,
    content: normalizedText,
    fileExtension,
    normalizedText
  };
}
