import type {
  DiagnosePayload,
  DiagnosisResult,
  DiagnosticFinding,
  DiagnosticReport,
  ParsedLogData,
  ParsedSolverLog,
  ResidualIssueClassification,
  ResidualAnalysisAssessment,
  RetrievedEngineeringReference,
  SampleSolverCase,
  SupportingReference,
  ValidationFlag
} from "@aeroslm/shared";
import { sampleSolverCases, supportingEngineeringReferences } from "@aeroslm/shared";

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapSampleIssueToResidualClassification(issue: SampleSolverCase["expectedIssueClassification"][number]): ResidualIssueClassification {
  return issue === "Divergence"
    ? "divergence"
    : issue === "Oscillatory convergence"
      ? "oscillatory-convergence"
      : issue === "Residual stagnation"
        ? "residual-stagnation"
        : "slow-convergence";
}

function findMatchingSample(payload: DiagnosePayload): SampleSolverCase | null {
  return (
    sampleSolverCases.find(
      (sample) =>
        sample.rawLogText.trim() === payload.logFile.content.trim() &&
        sample.troubleshootingQuestion === payload.question
    ) ?? null
  );
}

function parseResidualSeries(logText: string): ParsedLogData["residualSeries"] {
  const lines = logText.split(/\r?\n/);
  const seriesMap = new Map<string, ParsedLogData["residualSeries"][number]>();
  let currentStep: number | null = null;

  for (const line of lines) {
    const stepMatch = line.match(/Time Step\s+(\d+)/i);
    if (stepMatch) {
      currentStep = Number(stepMatch[1]);
      continue;
    }

    const residualMatch = line.match(/^([A-Za-z+\-\s]+?)\s+residual\s*=\s*([0-9.eE+-]+)/i);
    if (!residualMatch) continue;

    const metric = residualMatch[1].trim();
    const rawValue = residualMatch[2];
    const value = Number.parseFloat(rawValue);
    const existing =
      seriesMap.get(metric) ??
      {
        id: createId("series"),
        metric,
        samples: [],
        lastValue: null,
        trend: "unknown" as const
      };

    existing.samples.push({
      step: currentStep,
      value: Number.isFinite(value) ? value : null,
      rawValue
    });
    existing.lastValue = Number.isFinite(value) ? value : null;
    seriesMap.set(metric, existing);
  }

  return Array.from(seriesMap.values()).map((series) => {
    if (series.samples.length < 2) {
      return series;
    }

    const first = series.samples[0]?.value;
    const last = series.samples.at(-1)?.value;
    if (first === null || first === undefined || last === null || last === undefined) {
      return series;
    }

    return {
      ...series,
      trend: last < first ? "improving" : last > first ? "worsening" : "flat"
    };
  });
}

function parseStructuredData(sample: SampleSolverCase): ParsedLogData {
  const lines = sample.rawLogText.split(/\r?\n/);
  const residualSeries = parseResidualSeries(sample.rawLogText);
  const warnings = sample.rawLogText
    .split(/\r?\n/)
    .filter((line) => line.startsWith("Warning:"))
    .map((line) => line.replace(/^Warning:\s*/, ""));
  const errors = sample.rawLogText
    .split(/\r?\n/)
    .filter((line) => line.startsWith("Error:"))
    .map((line) => line.replace(/^Error:\s*/, ""));

  const iterations =
    sample.expectedParsedSummary.timestepsObserved > 0
      ? [sample.expectedParsedSummary.timestepsObserved]
      : [];
  const missingFields = sample.rawLogText.toLowerCase().includes("courant")
    ? ["errors", "fatalMessages", "notices", "metadata"]
    : ["cflEntries", "errors", "fatalMessages", "notices", "metadata"];

  return {
    parsedAt: new Date().toISOString(),
    parserVersion: "sample-fallback-v1",
    parserType: "generic-text-v1",
    solverDetected: sample.solver === "OpenFOAM" ? "OpenFOAM" : "Unknown",
    rawText: sample.rawLogText,
    normalizedText: sample.rawLogText.replace(/\r\n?/g, "\n"),
    lines,
    lineCount: lines.length,
    iterations,
    residualEntries: residualSeries.flatMap((series) =>
      series.samples.map((entry) => ({
        field: series.metric,
        iteration: entry.step,
        rawValue: entry.rawValue,
        value: entry.value,
        sourceLine: `${series.metric} residual = ${entry.rawValue}`
      }))
    ),
    cflEntries: sample.rawLogText.toLowerCase().includes("courant")
      ? [{
          metric: "CFL",
          iteration: sample.expectedParsedSummary.timestepsObserved || null,
          rawValue: "unavailable",
          value: null,
          sourceLine: "Courant number detected in sample fallback log"
        }]
      : [],
    fatalMessages: [],
    notices: [],
    metadata: sample.solver === "OpenFOAM" ? { solver: "OpenFOAM" } : {},
    parseCoverage: {
      iterations: iterations.length > 0 ? "available" : "unavailable",
      residuals: residualSeries.length > 0 ? "available" : "unavailable",
      cfl: sample.rawLogText.toLowerCase().includes("courant") ? "available" : "unavailable",
      warnings: warnings.length > 0 ? "available" : "unavailable",
      errors: errors.length > 0 ? "available" : "unavailable",
      fatalMessages: "unavailable",
      notices: "unavailable",
      metadata: sample.solver === "OpenFOAM" ? "available" : "unavailable",
      status: "partial",
      missingFields
    },
    unsupportedPatterns: [],
    parseStatus: "partial",
    sourceFormat: "generic-v1",
    status: sample.expectedParsedSummary.runStatus,
    rawLineCount: lines.length,
    iterationNumbers: iterations,
    lastIteration:
      sample.expectedParsedSummary.timestepsObserved > 0
        ? sample.expectedParsedSummary.timestepsObserved
        : null,
    timestepCount: sample.expectedParsedSummary.timestepsObserved,
    cflSeries: sample.rawLogText.toLowerCase().includes("courant") ? {
      id: createId("cfl"),
      metric: "CFL",
      samples: [],
      lastValue: null
    } : null,
    warnings,
    errors,
    solverMessages: [],
    convergencePatterns: [...warnings, ...errors],
    missingFields,
    residualSeries
  };
}

function parseLegacyLog(sample: SampleSolverCase, parsedLogData: ParsedLogData): ParsedSolverLog {
  return {
    runStatus: sample.expectedParsedSummary.runStatus,
    residualSignals: parsedLogData.residualSeries.map((series) => ({
      label: series.metric,
      value: series.lastValue === null ? "missing" : String(series.lastValue),
      severity:
        series.trend === "worsening" ? "high" : series.trend === "flat" ? "medium" : "low",
      evidence: `${series.metric} residual trend is ${series.trend}.`
    })),
    warnings: parsedLogData.warnings,
    errors: parsedLogData.errors,
    timestepsObserved: sample.expectedParsedSummary.timestepsObserved
  };
}

function buildResidualAnalysis(sample: SampleSolverCase): ResidualAnalysisAssessment[] {
  return sample.expectedIssueClassification.map((issue) => {
    const classification = mapSampleIssueToResidualClassification(issue);

    return {
      classification,
      confidence: issue === "Divergence" ? 0.82 : issue === "Oscillatory convergence" ? 0.74 : 0.61,
      rationale: `${issue} was inferred from the seeded sample log patterns.`,
      trendSummary: `${issue} behavior is consistent with the expected sample-case solver signals.`,
      debug: {
        analyzedSeriesCount: sample.expectedParsedSummary.dominantResiduals.length,
        totalNumericSamples: sample.expectedParsedSummary.timestepsObserved > 0 ? 2 : 0,
        matchedMetrics: sample.expectedParsedSummary.dominantResiduals,
        windowLength: sample.expectedParsedSummary.timestepsObserved > 0 ? 2 : 0,
        averageRelativeChange: null,
        signChangeCount: issue === "Oscillatory convergence" ? 2 : 0,
        scoreBreakdown: [`seeded sample matched expected issue category: ${issue}`],
        weakData: false
      }
    };
  });
}

function buildRetrievedReferences(sample: SampleSolverCase): RetrievedEngineeringReference[] {
  const issueTerms = sample.expectedIssueClassification.map(mapSampleIssueToResidualClassification);

  return supportingEngineeringReferences
    .filter((reference) =>
      reference.relatedIssueTypes.some((issueType) =>
        issueTerms.some((term) => term === issueType)
      )
    )
    .slice(0, 5)
    .map((reference) => ({
      ...reference,
      relevanceExplanation: `matched seeded sample issue category and keywords for ${sample.solver}`
    }));
}

function buildLikelyRootCauses(sample: SampleSolverCase): DiagnosticFinding[] {
  return sample.expectedIssueClassification.map((issue, index) => ({
    title: issue,
    severity: issue === "Divergence" ? "critical" : issue === "Oscillatory convergence" ? "high" : "medium",
    rationale: sample.expectedRecommendations[index] ?? "Expected sample cause based on seeded CFD troubleshooting data.",
    evidence: [
      `sample case: ${sample.title}`,
      `dominant residuals: ${sample.expectedParsedSummary.dominantResiduals.join(", ")}`
    ],
    recommendations: sample.expectedRecommendations.slice(0, 3)
  }));
}

function buildValidationFlags(sample: SampleSolverCase): ValidationFlag[] {
  return sample.expectedValidationFlags.map((message) => ({
    id: createId("flag"),
    rule: "sample-fallback-validation",
    severity: message.toLowerCase().includes("required") || message.toLowerCase().includes("may")
      ? "caution"
      : "info",
    message,
    triggeredBy: "seeded sample fallback workflow",
    suppressed: false
  }));
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

export function createSampleFallbackDiagnosis(payload: DiagnosePayload): {
  report: DiagnosticReport;
  result: DiagnosisResult;
} | null {
  const sample = findMatchingSample(payload);
  if (!sample) return null;

  const parsedLogData = parseStructuredData(sample);
  const parsedLog = parseLegacyLog(sample, parsedLogData);
  const residualAnalysis = buildResidualAnalysis(sample);
  const retrievedReferences = buildRetrievedReferences(sample);
  const likelyRootCauses = buildLikelyRootCauses(sample);
  const validationFlags = buildValidationFlags(sample);
  const supportingReferences = toSupportingReferences(retrievedReferences);
  const now = new Date().toISOString();

  const report: DiagnosticReport = {
    id: createId("diag"),
    createdAt: now,
    question: payload.question,
    context: payload.context,
    summary:
      sample.expectedIssueClassification.length > 0
        ? `${sample.expectedIssueClassification.join(" and ")} detected from the seeded sample workflow.`
        : "Seeded sample fallback generated a partial diagnostic report.",
    residualAnalysis,
    likelyRootCauses,
    stabilizationPlan: sample.expectedRecommendations,
    followUpChecks: [
      "Review the parsed residual trends against the seeded sample expectations.",
      "Compare the fallback report with the backend-generated version once the API is available.",
      "Use the admin/debug page to inspect raw parser and rule behavior."
    ],
    parsedLog,
    retrievedReferences
  };

  const result: DiagnosisResult = {
    id: createId("result"),
    createdAt: now,
    updatedAt: now,
    summary: report.summary,
    confidence: 0.72,
    warnings: [...parsedLogData.warnings, ...parsedLogData.errors],
    parsedSummary: {
      status: parsedLogData.status,
      lastIteration: parsedLogData.lastIteration,
      residualOverview:
        parsedLogData.residualSeries.length > 0
          ? `Tracked residuals: ${parsedLogData.residualSeries.map((series) => series.metric).join(", ")}.`
          : "No residual values were extracted from the seeded sample log.",
      residualMetrics: parsedLogData.residualSeries.map((series) => series.metric),
      warningCount: parsedLogData.warnings.length,
      errorCount: parsedLogData.errors.length,
      missingFields: parsedLogData.missingFields
    },
    primaryIssue:
      residualAnalysis.length > 0
        ? {
            id: createId("issue"),
            issueType:
              residualAnalysis[0].classification === "divergence"
                ? "numerical-stability"
                : residualAnalysis[0].classification === "oscillatory-convergence"
                  ? "boundary-condition"
                  : "convergence",
            title: sample.expectedIssueClassification[0] ?? "Seeded sample issue",
            summary: residualAnalysis[0].rationale,
            severity: likelyRootCauses[0]?.severity ?? "medium",
            confidence: residualAnalysis[0].confidence,
            warnings: [residualAnalysis[0].trendSummary],
            references: supportingReferences.slice(0, 3),
            validationFlags
          }
        : null,
    supportingReferences,
    validationFlags,
    detectedIssues: [],
    likelyCauses: likelyRootCauses.map((cause, index) => ({
      id: createId("cause"),
      title: cause.title,
      rationale: cause.rationale,
      confidence: residualAnalysis[index]?.confidence ?? 0.6,
      rank: index + 1,
      evidence: cause.evidence
    })),
    recommendations: sample.expectedRecommendations.map((action, index) => ({
      id: createId("rec"),
      title: `Recommended action ${index + 1}`,
      action,
      rationale: "Generated from the seeded sample fallback workflow.",
      priority: index === 0 ? "high" : "medium",
      confidence: 0.68,
      rank: index + 1,
      groundedBy: [`seeded sample: ${sample.title}`],
      references: supportingReferences.slice(0, 2),
      validationFlags
    })),
    nextBestAction: null,
    parsedLogData,
    residualAnalysis,
    report
  };

  result.nextBestAction = result.recommendations[0] ?? null;
  result.detectedIssues = result.primaryIssue ? [result.primaryIssue] : [];

  return { report, result };
}
