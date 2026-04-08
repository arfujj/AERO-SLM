import type { DiagnosisRecord, DiagnosticReport } from "@aeroslm/shared";

const reportStore = new Map<string, DiagnosticReport>();

export function saveReport(report: DiagnosticReport): void {
  reportStore.set(report.id, report);
}

export function listHistory(): DiagnosisRecord[] {
  return [...reportStore.values()]
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
  return reportStore.get(id) ?? null;
}
