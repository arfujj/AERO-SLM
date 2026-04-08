import type { DiagnosisResult, DiagnosisRun } from "@aeroslm/shared";
import { formatTimestamp } from "./display";

interface PdfExportInput {
  result: Partial<DiagnosisResult>;
  run?: DiagnosisRun | null;
}

function clampText(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export async function exportDiagnosisReportPdf({ result, run }: PdfExportInput): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    unit: "pt",
    format: "letter"
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 54;
  const right = pageWidth - 54;
  const contentWidth = right - left;
  let y = 54;

  function ensureSpace(required = 36) {
    if (y + required <= pageHeight - 54) return;
    doc.addPage();
    y = 54;
  }

  function writeWrappedText(text: string, options?: { size?: number; color?: [number, number, number]; lineGap?: number }) {
    const size = options?.size ?? 10.5;
    const lineGap = options?.lineGap ?? 14;
    const color = options?.color ?? [24, 33, 43];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      ensureSpace(lineGap);
      doc.text(line, left, y);
      y += lineGap;
    }
  }

  function writeSectionTitle(title: string) {
    ensureSpace(28);
    y += 8;
    doc.setDrawColor(219, 226, 231);
    doc.line(left, y, right, y);
    y += 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(24, 33, 43);
    doc.text(title, left, y);
    y += 16;
  }

  function writeLabelValue(label: string, value: string) {
    ensureSpace(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(82, 96, 109);
    doc.text(`${label}:`, left, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(24, 33, 43);
    const labelWidth = doc.getTextWidth(`${label}: `);
    const wrapped = doc.splitTextToSize(value, contentWidth - labelWidth - 4);
    if (wrapped.length === 0) {
      y += 14;
      return;
    }

    doc.text(wrapped[0], left + labelWidth + 4, y);
    y += 14;
    for (const line of wrapped.slice(1)) {
      ensureSpace(14);
      doc.text(line, left + labelWidth + 4, y);
      y += 14;
    }
  }

  function writeBullets(items: string[], fallback: string) {
    if (items.length === 0) {
      writeWrappedText(fallback, { color: [111, 124, 136] });
      return;
    }

    for (const item of items) {
      const lines = doc.splitTextToSize(item, contentWidth - 16);
      ensureSpace(lines.length * 14 + 4);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(24, 33, 43);
      doc.text("\u2022", left, y);
      doc.text(lines[0], left + 12, y);
      y += 14;
      for (const line of lines.slice(1)) {
        ensureSpace(14);
        doc.text(line, left + 12, y);
        y += 14;
      }
    }
  }

  const caseDescription = clampText(
    run?.simulationContext.caseDescription ?? result.report?.context.caseDescription,
    "Unavailable"
  );
  const solverName = clampText(
    run?.simulationContext.solverName ?? result.report?.context.solverName,
    "Unavailable"
  );
  const timestamp = formatTimestamp(result.report?.createdAt ?? run?.createdAt ?? result.createdAt);
  const status = clampText(run?.status ?? result.parsedSummary?.status, "unknown");
  const detectedIssue = clampText(result.primaryIssue?.title, "No primary issue identified");
  const nextStep = clampText(result.nextBestAction?.action, "Review the parsed evidence before changing solver settings.");
  const confidence = `${Math.round((result.confidence ?? 0) * 100)}%`;
  const parsedSummary = result.parsedSummary;
  const parsedLogData = result.parsedLogData;

  doc.setFillColor(61, 104, 119);
  doc.rect(left, y, 28, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(24, 33, 43);
  doc.text("AeroSLM", left + 40, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(82, 96, 109);
  doc.text("Physics-aware CFD diagnostic copilot", left + 40, y + 30);
  y += 52;

  writeSectionTitle("Report Summary");
  writeLabelValue("Timestamp", timestamp);
  writeLabelValue("Solver", solverName);
  writeLabelValue("Case description", caseDescription);
  writeLabelValue("Run status", status);
  writeLabelValue("Detected issue", detectedIssue);
  writeLabelValue("Confidence", confidence);
  writeLabelValue("Final suggested next step", nextStep);

  writeSectionTitle("Parsed Summary");
  writeLabelValue("File name", clampText(run?.uploadedLog.fileName, "Unavailable"));
  writeLabelValue("Residual overview", clampText(parsedSummary?.residualOverview, "No parsed residual overview is available."));
  writeLabelValue("Iterations found", `${parsedLogData?.iterationNumbers.length ?? 0}`);
  writeLabelValue(
    "Residual fields",
    parsedSummary?.residualMetrics.length ? parsedSummary.residualMetrics.join(", ") : "None detected"
  );
  writeLabelValue("CFL detected", parsedLogData?.cflSeries ? "Yes" : "No");
  writeLabelValue("Warnings count", `${parsedSummary?.warningCount ?? 0}`);

  writeSectionTitle("Residual Analysis");
  if ((result.residualAnalysis ?? []).length === 0) {
    writeWrappedText("No residual analysis could be assembled from the uploaded log.", {
      color: [111, 124, 136]
    });
  } else {
    for (const assessment of result.residualAnalysis ?? []) {
      writeLabelValue(
        assessment.classification,
        `${assessment.rationale} Confidence ${Math.round(assessment.confidence * 100)}%.`
      );
      writeWrappedText(assessment.trendSummary, { color: [82, 96, 109] });
    }
  }

  writeSectionTitle("Likely Causes");
  writeBullets(
    (result.likelyCauses ?? []).map(
      (cause) =>
        `${cause.rank}. ${cause.title}. ${cause.rationale} Evidence: ${cause.evidence.join("; ")}`
    ),
    "No ranked likely causes were assembled."
  );

  writeSectionTitle("Recommendations");
  writeBullets(
    (result.recommendations ?? []).map(
      (recommendation) =>
        `${recommendation.rank}. ${recommendation.title}. ${recommendation.action} Grounded by: ${recommendation.groundedBy.join("; ")}`
    ),
    "No corrective actions were emitted."
  );

  writeSectionTitle("Supporting References");
  writeBullets(
    (result.supportingReferences ?? []).map(
      (reference) =>
        `${reference.title}. ${reference.summary}${reference.excerpt ? ` Relevance: ${reference.excerpt}` : ""}`
    ),
    "No supporting references were retrieved."
  );

  writeSectionTitle("Validation Flags");
  writeBullets(
    (result.validationFlags ?? []).map(
      (flag) =>
        `${flag.rule} (${flag.severity}). ${flag.message} Triggered by: ${flag.triggeredBy}${flag.suppressed ? " Recommendation suppressed." : ""}`
    ),
    "No validation flags were recorded."
  );

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(111, 124, 136);
  ensureSpace(20);
  y += 12;
  doc.text("Generated by AeroSLM for internal engineering review.", left, y);

  const fileNameBase = caseDescription
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "aeroslm-diagnosis-report";

  doc.save(`${fileNameBase}.pdf`);
}
