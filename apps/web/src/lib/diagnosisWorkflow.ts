import type {
  DiagnosePayload,
  DiagnosisProgressStage,
  DiagnosisResult,
  ParseLogResponse,
  ResidualAnalysisAssessment,
  RetrievedEngineeringReference,
  SupportingReference
} from "@aeroslm/shared";
import { api } from "./api";
import { completeDiagnosisRun, failDiagnosisRun, updateDiagnosisRunStage } from "./diagnosisRunStore";
import { createSampleFallbackDiagnosis } from "./sampleFallbackDiagnosis";

export const diagnosisProgressStages: Array<{
  key: DiagnosisProgressStage;
  label: string;
}> = [
  { key: "uploading-log", label: "Uploading log" },
  { key: "parsing-iterations-and-residuals", label: "Parsing iterations and residuals" },
  { key: "detecting-convergence-behavior", label: "Detecting convergence behavior" },
  { key: "retrieving-engineering-references", label: "Retrieving engineering references" },
  { key: "applying-physics-validation", label: "Applying physics validation" },
  { key: "generating-report", label: "Generating report" }
];

function createPartialId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function toSupportingReferences(retrievedReferences: RetrievedEngineeringReference[]): SupportingReference[] {
  return retrievedReferences.map((reference) => ({
    id: reference.id,
    title: reference.title,
    sourceType: "knowledge-base",
    summary: reference.snippet,
    excerpt: reference.relevanceExplanation
  }));
}

function buildPartialDiagnosisResult(input: {
  runId: string;
  summary: string;
  parsedLogData?: ParseLogResponse["parsedLogData"];
  residualAnalysis?: ResidualAnalysisAssessment[];
  retrievedReferences?: RetrievedEngineeringReference[];
}): Partial<DiagnosisResult> {
  const now = new Date().toISOString();
  const supportingReferences = input.retrievedReferences
    ? toSupportingReferences(input.retrievedReferences)
    : [];

  return {
    id: `partial_${input.runId}`,
    createdAt: now,
    updatedAt: now,
    summary: input.summary,
    confidence:
      input.residualAnalysis && input.residualAnalysis.length > 0
        ? Math.max(...input.residualAnalysis.map((assessment) => assessment.confidence))
        : 0.2,
    warnings: input.parsedLogData
      ? [...input.parsedLogData.warnings, ...input.parsedLogData.errors]
      : [],
    parsedSummary: input.parsedLogData
      ? {
          status: input.parsedLogData.status,
          lastIteration: input.parsedLogData.lastIteration,
          residualOverview:
            input.parsedLogData.residualSeries.length > 0
              ? `Tracked residuals: ${input.parsedLogData.residualSeries
                  .map((series) => series.metric)
                  .join(", ")}.`
              : "No residual values could be extracted from the uploaded log.",
          residualMetrics: input.parsedLogData.residualSeries.map((series) => series.metric),
          warningCount: input.parsedLogData.warnings.length,
          errorCount: input.parsedLogData.errors.length,
          missingFields: input.parsedLogData.missingFields
        }
      : undefined,
    supportingReferences,
    validationFlags: [],
    detectedIssues: [],
    likelyCauses: [],
    recommendations: [],
    nextBestAction: null,
    parsedLogData: input.parsedLogData,
    residualAnalysis: input.residualAnalysis ?? []
  };
}

export async function runDiagnosisWorkflow(runId: string, payload: DiagnosePayload): Promise<void> {
  let parsedLogData: ParseLogResponse["parsedLogData"] | undefined;
  let parsedLog: ParseLogResponse["parsedLog"] | undefined;
  let residualAnalysis: ResidualAnalysisAssessment[] | undefined;
  let retrievedReferences: RetrievedEngineeringReference[] | undefined;

  try {
    updateDiagnosisRunStage(runId, "uploading-log", "Uploading solver log.");

    updateDiagnosisRunStage(
      runId,
      "parsing-iterations-and-residuals",
      "Parsing iterations and residuals from the uploaded log."
    );
    const parseResponse = await api.parseLog(payload);
    parsedLogData = parseResponse.parsedLogData;
    parsedLog = parseResponse.parsedLog;

    updateDiagnosisRunStage(
      runId,
      "detecting-convergence-behavior",
      "Detecting convergence behavior from parsed residual trends.",
      buildPartialDiagnosisResult({
        runId,
        summary: "Log parsed successfully. AeroSLM is analyzing convergence behavior.",
        parsedLogData
      })
    );
    const residualResponse = await api.analyzeResiduals(parsedLogData);
    residualAnalysis = residualResponse.residualAnalysis;

    updateDiagnosisRunStage(
      runId,
      "retrieving-engineering-references",
      "Retrieving engineering references relevant to the parsed solver signals.",
      buildPartialDiagnosisResult({
        runId,
        summary: "Residual behavior classified. AeroSLM is retrieving supporting engineering references.",
        parsedLogData,
        residualAnalysis
      })
    );
    const retrievalResponse = await api.retrieveReferences({
      context: payload.context,
      question: payload.question,
      parsedLogData,
      residualAnalysis
    });
    retrievedReferences = retrievalResponse.retrievedReferences;

    updateDiagnosisRunStage(
      runId,
      "applying-physics-validation",
      "Applying physics validation to generated corrective actions.",
      buildPartialDiagnosisResult({
        runId,
        summary: "Supporting references retrieved. AeroSLM is validating recommendations against the simulation context.",
        parsedLogData,
        residualAnalysis,
        retrievedReferences
      })
    );

    const diagnosisResponse = await api.finalizeDiagnosis({
      payload,
      parsedLogData,
      parsedLog,
      residualAnalysis,
      retrievedReferences
    });

    updateDiagnosisRunStage(
      runId,
      "generating-report",
      "Generating the final structured diagnostic report.",
      diagnosisResponse.result
    );
    completeDiagnosisRun(runId, diagnosisResponse.report, diagnosisResponse.result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Diagnosis workflow failed before the report was completed.";

    const sampleFallback = createSampleFallbackDiagnosis(payload);
    if (sampleFallback && error instanceof Error && error.message.toLowerCase().includes("could not reach the backend api")) {
      updateDiagnosisRunStage(
        runId,
        "generating-report",
        "Backend unavailable. Falling back to the seeded sample diagnosis workflow.",
        sampleFallback.result
      );
      completeDiagnosisRun(runId, sampleFallback.report, sampleFallback.result);
      return;
    }

    failDiagnosisRun(
      runId,
      message,
      buildPartialDiagnosisResult({
        runId,
        summary: "Diagnosis workflow ended early. Partial parser and analysis output is available for review.",
        parsedLogData,
        residualAnalysis,
        retrievedReferences
      })
    );

    throw error;
  }
}
