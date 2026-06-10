import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { DiagnosisRecord, DiagnosisResult, DiagnosticReport, UploadAsset } from "@aeroslm/shared";

export interface StoredLogAsset {
  fileName: string;
  uploadedAt: string;
  storagePath: string;
  sizeBytes: number;
}

interface StoredDiagnosis {
  report: DiagnosticReport;
  result?: DiagnosisResult;
  logAsset?: StoredLogAsset;
}

interface DiagnosisStoreDocument {
  schemaVersion: 1;
  diagnoses: StoredDiagnosis[];
}

export interface SavedDiagnosisRecord {
  report: DiagnosticReport;
  result?: DiagnosisResult;
  logAsset?: StoredLogAsset;
}

export interface SaveReportOptions {
  result?: DiagnosisResult;
  logFile?: UploadAsset;
}

function getDefaultDataDirectory(): string {
  if (process.env.AEROSLM_DATA_DIR) {
    return resolve(process.env.AEROSLM_DATA_DIR);
  }

  return resolve(process.cwd(), basename(process.cwd()) === "server" ? "data" : "apps/server/data");
}

function getStorePaths(dataDirectory = getDefaultDataDirectory()) {
  return {
    dataDirectory,
    indexPath: join(dataDirectory, "diagnoses.json"),
    uploadsDirectory: join(dataDirectory, "uploads")
  };
}

function createEmptyDocument(): DiagnosisStoreDocument {
  return {
    schemaVersion: 1,
    diagnoses: []
  };
}

function ensureStore(dataDirectory?: string): ReturnType<typeof getStorePaths> {
  const paths = getStorePaths(dataDirectory);
  mkdirSync(paths.uploadsDirectory, { recursive: true });

  if (!existsSync(paths.indexPath)) {
    writeFileSync(paths.indexPath, JSON.stringify(createEmptyDocument(), null, 2));
  }

  return paths;
}

function readStore(dataDirectory?: string): DiagnosisStoreDocument {
  const paths = ensureStore(dataDirectory);
  const rawDocument = readFileSync(paths.indexPath, "utf8");

  if (!rawDocument.trim()) {
    return createEmptyDocument();
  }

  const parsedDocument = JSON.parse(rawDocument) as Partial<DiagnosisStoreDocument>;

  return {
    schemaVersion: 1,
    diagnoses: Array.isArray(parsedDocument.diagnoses) ? parsedDocument.diagnoses : []
  };
}

function writeStore(document: DiagnosisStoreDocument, dataDirectory?: string): void {
  const paths = ensureStore(dataDirectory);
  writeFileSync(paths.indexPath, JSON.stringify(document, null, 2));
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "uploaded-log.txt";
}

function persistLogAsset(reportId: string, logFile: UploadAsset, dataDirectory?: string): StoredLogAsset {
  const paths = ensureStore(dataDirectory);
  const safeFileName = sanitizeFileName(logFile.fileName);
  const storagePath = join(paths.uploadsDirectory, `${reportId}_${safeFileName}`);

  writeFileSync(storagePath, logFile.content, "utf8");

  return {
    fileName: logFile.fileName,
    uploadedAt: logFile.uploadedAt,
    storagePath,
    sizeBytes: Buffer.byteLength(logFile.content, "utf8")
  };
}

export function saveReport(report: DiagnosticReport, options: SaveReportOptions = {}): void {
  const document = readStore();
  const existingIndex = document.diagnoses.findIndex((diagnosis) => diagnosis.report.id === report.id);
  const existingDiagnosis = existingIndex >= 0 ? document.diagnoses[existingIndex] : undefined;
  const nextDiagnosis: StoredDiagnosis = {
    report,
    result: options.result ?? existingDiagnosis?.result,
    logAsset: options.logFile ? persistLogAsset(report.id, options.logFile) : existingDiagnosis?.logAsset
  };

  if (existingIndex >= 0) {
    document.diagnoses[existingIndex] = nextDiagnosis;
  } else {
    document.diagnoses.push(nextDiagnosis);
  }

  writeStore(document);
}

export function listHistory(): DiagnosisRecord[] {
  return readStore()
    .diagnoses.map((diagnosis) => diagnosis.report)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((report) => ({
      id: report.id,
      createdAt: report.createdAt,
      question: report.question,
      solverName: report.context.solverName,
      status: report.parsedLog.runStatus,
      summary: report.summary
    }));
}

export function getReportById(id: string): DiagnosticReport | null {
  return getSavedDiagnosisById(id)?.report ?? null;
}

export function getSavedDiagnosisById(id: string): SavedDiagnosisRecord | null {
  const diagnosis = readStore().diagnoses.find((storedDiagnosis) => storedDiagnosis.report.id === id);

  if (!diagnosis) {
    return null;
  }

  return {
    report: diagnosis.report,
    result: diagnosis.result,
    logAsset: diagnosis.logAsset
  };
}

export const diagnosisStoreTestInternals = {
  getStorePaths,
  readStore,
  saveReportWithDataDirectory(report: DiagnosticReport, options: SaveReportOptions, dataDirectory: string): void {
    const document = readStore(dataDirectory);
    const logAsset = options.logFile ? persistLogAsset(report.id, options.logFile, dataDirectory) : undefined;
    const existingIndex = document.diagnoses.findIndex((diagnosis) => diagnosis.report.id === report.id);
    const nextDiagnosis: StoredDiagnosis = {
      report,
      result: options.result,
      logAsset
    };

    if (existingIndex >= 0) {
      document.diagnoses[existingIndex] = nextDiagnosis;
    } else {
      document.diagnoses.push(nextDiagnosis);
    }

    writeStore(document, dataDirectory);
  }
};
