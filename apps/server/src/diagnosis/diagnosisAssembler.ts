import type {
  DiagnosePayload,
  DiagnosisResult,
  DetectedIssue,
  LikelyCause,
  ParsedLogData,
  Recommendation,
  RetrievedEngineeringReference,
  SeverityLevel,
  SupportingReference,
  ValidationFlag,
  ResidualAnalysisAssessment
} from "@aeroslm/shared";
import { validatePhysicsRecommendations } from "../validation/physicsValidation.js";

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function severityFromClassification(classification: ResidualAnalysisAssessment["classification"]): SeverityLevel {
  switch (classification) {
    case "divergence":
      return "critical";
    case "oscillatory-convergence":
      return "high";
    case "residual-stagnation":
      return "medium";
    case "slow-convergence":
      return "medium";
  }
}

function issueTypeFromClassification(classification: ResidualAnalysisAssessment["classification"]): DetectedIssue["issueType"] {
  switch (classification) {
    case "divergence":
      return "numerical-stability";
    case "oscillatory-convergence":
      return "boundary-condition";
    case "residual-stagnation":
      return "convergence";
    case "slow-convergence":
      return "convergence";
  }
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

function createValidationFlags(parsedLogData: ParsedLogData): ValidationFlag[] {
  const flags: ValidationFlag[] = [];

  flags.push({
    id: createId("flag"),
    rule: "parsed-log-available",
    severity: parsedLogData.residualSeries.length > 0 ? "info" : "caution",
    message:
      parsedLogData.residualSeries.length > 0
        ? "Residual-related signals were parsed successfully."
        : "Residual-related signals were not found in the uploaded log.",
    triggeredBy: `parsed residual series count=${parsedLogData.residualSeries.length}`,
    suppressed: false
  });

  if (parsedLogData.errors.length > 0) {
    flags.push({
      id: createId("flag"),
      rule: "explicit-solver-errors",
      severity: "critical",
      message: "Explicit solver errors were detected in the log.",
      triggeredBy: parsedLogData.errors[0],
      suppressed: false
    });
  }

  if (parsedLogData.missingFields.length > 0) {
    flags.push({
      id: createId("flag"),
      rule: "partial-parser-coverage",
      severity: "caution",
      message: `Parser output is partial. Missing: ${parsedLogData.missingFields.join(", ")}.`,
      triggeredBy: parsedLogData.missingFields.join(", "),
      suppressed: false
    });
  }

  return flags;
}

function createDetectedIssues(
  residualAnalysis: ResidualAnalysisAssessment[],
  supportingReferences: SupportingReference[],
  validationFlags: ValidationFlag[]
): DetectedIssue[] {
  return residualAnalysis.map((assessment) => ({
    id: createId("issue"),
    issueType: issueTypeFromClassification(assessment.classification),
    title: assessment.classification.replace(/-/g, " "),
    summary: assessment.rationale,
    severity: severityFromClassification(assessment.classification),
    confidence: assessment.confidence,
    warnings: [assessment.trendSummary, ...assessment.debug.scoreBreakdown],
    references: supportingReferences.slice(0, 3),
    validationFlags
  }));
}

function createLikelyCauses(
  detectedIssues: DetectedIssue[],
  parsedLogData: ParsedLogData,
  supportingReferences: SupportingReference[]
): LikelyCause[] {
  const causes: LikelyCause[] = detectedIssues.map((issue, index) => ({
    id: createId("cause"),
    title:
      issue.issueType === "numerical-stability"
        ? "Solver control instability"
        : issue.issueType === "boundary-condition"
          ? "Boundary-condition interaction"
          : "Convergence control limitation",
    rationale: issue.summary,
    confidence: issue.confidence,
    rank: index + 1,
    evidence: [
      ...issue.warnings.slice(0, 2),
      ...(parsedLogData.warnings.length > 0 ? [parsedLogData.warnings[0]] : []),
      ...(supportingReferences[0] ? [supportingReferences[0].summary] : [])
    ]
  }));

  if (causes.length === 0) {
    causes.push({
      id: createId("cause"),
      title: "Insufficient parsed evidence",
      rationale: "The parser produced partial data, so only a broad convergence cause can be suggested.",
      confidence: 0.28,
      rank: 1,
      evidence: parsedLogData.missingFields.length > 0 ? parsedLogData.missingFields : ["Limited residual signal coverage"]
    });
  }

  return causes.sort((left, right) => right.confidence - left.confidence).map((cause, index) => ({
    ...cause,
    rank: index + 1
  }));
}

function groundedBy(issue: DetectedIssue, references: SupportingReference[]): string[] {
  return [
    `detected pattern: ${issue.title}`,
    ...issue.warnings.slice(0, 1),
    ...references.slice(0, 1).map((reference) => `reference: ${reference.title}`)
  ];
}

function createRecommendations(
  detectedIssues: DetectedIssue[],
  parsedLogData: ParsedLogData,
  supportingReferences: SupportingReference[],
  validationFlags: ValidationFlag[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const issue of detectedIssues) {
    if (issue.issueType === "numerical-stability") {
      recommendations.push({
        id: createId("rec"),
        title: "Reduce solver aggressiveness",
        action: "Reduce CFL growth or timestep size and rerun from the last stable checkpoint.",
        rationale: "Grounded in the detected divergence trend and explicit instability signals in the parsed residuals.",
        priority: "high",
        confidence: issue.confidence,
        rank: 0,
        groundedBy: groundedBy(issue, supportingReferences),
        references: supportingReferences.slice(0, 2),
        validationFlags
      });
    }

    if (issue.issueType === "boundary-condition") {
      recommendations.push({
        id: createId("rec"),
        title: "Review outlet and reverse-flow handling",
        action: "Inspect outlet placement, outlet pressure settings, and reverse-flow boundary handling.",
        rationale: "Grounded in oscillatory/backflow signals and supporting retrieval matches for outlet behavior.",
        priority: "high",
        confidence: issue.confidence,
        rank: 0,
        groundedBy: groundedBy(issue, supportingReferences),
        references: supportingReferences.slice(0, 2),
        validationFlags
      });
    }

    if (issue.issueType === "convergence") {
      recommendations.push({
        id: createId("rec"),
        title: "Retune convergence controls",
        action: "Retune linear solver, multigrid, or initialization settings to improve residual decay.",
        rationale: "Grounded in stagnation or slow-convergence patterns plus retrieved references about solver tuning.",
        priority: "medium",
        confidence: issue.confidence,
        rank: 0,
        groundedBy: groundedBy(issue, supportingReferences),
        references: supportingReferences.slice(0, 2),
        validationFlags
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: createId("rec"),
      title: "Gather more solver evidence",
      action: "Capture a longer residual history, CFL values, and monitor traces before making aggressive setup changes.",
      rationale: "Recommended because parsed data is incomplete and the current evidence base is limited.",
      priority: "medium",
      confidence: 0.3,
      rank: 0,
      groundedBy: [
        `missing parser fields: ${parsedLogData.missingFields.join(", ") || "none reported"}`
      ],
      references: supportingReferences.slice(0, 1),
      validationFlags
    });
  }

  return recommendations
    .sort((left, right) => right.confidence - left.confidence)
    .map((recommendation, index) => ({
      ...recommendation,
      rank: index + 1
    }));
}

function buildParsedSummary(parsedLogData: ParsedLogData) {
  const metrics = parsedLogData.residualSeries.map((series) => series.metric);
  const residualOverview =
    metrics.length > 0
      ? `Tracked residuals: ${metrics.join(", ")}.`
      : "No residual values could be extracted from the uploaded log.";

  return {
    status: parsedLogData.status,
    lastIteration: parsedLogData.lastIteration,
    residualOverview,
    residualMetrics: metrics,
    warningCount: parsedLogData.warnings.length,
    errorCount: parsedLogData.errors.length,
    missingFields: parsedLogData.missingFields
  };
}

function overallConfidence(
  detectedIssues: DetectedIssue[],
  parsedLogData: ParsedLogData,
  supportingReferences: SupportingReference[]
): number {
  const base =
    detectedIssues.length > 0
      ? detectedIssues.reduce((sum, issue) => sum + issue.confidence, 0) / detectedIssues.length
      : 0.28;

  const missingPenalty = parsedLogData.missingFields.length >= 3 ? 0.15 : parsedLogData.missingFields.length > 0 ? 0.08 : 0;
  const referenceBoost = supportingReferences.length >= 3 ? 0.05 : supportingReferences.length > 0 ? 0.02 : 0;
  return Math.max(0.2, Math.min(0.9, Number((base - missingPenalty + referenceBoost).toFixed(2))));
}

export function assembleDiagnosisResult(input: {
  payload: DiagnosePayload;
  parsedLogData: ParsedLogData;
  residualAnalysis: ResidualAnalysisAssessment[];
  retrievedReferences: RetrievedEngineeringReference[];
  summary: string;
  report?: DiagnosisResult["report"];
}): DiagnosisResult {
  const createdAt = new Date().toISOString();
  const supportingReferences = toSupportingReferences(input.retrievedReferences);
  const baseValidationFlags = createValidationFlags(input.parsedLogData);
  const detectedIssues = createDetectedIssues(input.residualAnalysis, supportingReferences, baseValidationFlags);
  const likelyCauses = createLikelyCauses(detectedIssues, input.parsedLogData, supportingReferences);
  const unvalidatedRecommendations = createRecommendations(
    detectedIssues,
    input.parsedLogData,
    supportingReferences,
    baseValidationFlags
  );
  const physicsValidation = validatePhysicsRecommendations({
    context: input.payload.context,
    parsedLogData: input.parsedLogData,
    detectedIssues,
    recommendations: unvalidatedRecommendations,
    supportingReferences
  });
  const validationFlags = [...baseValidationFlags, ...physicsValidation.flags];
  const recommendations = physicsValidation.recommendations.map((recommendation) => ({
    ...recommendation,
    validationFlags: validationFlags.filter(
      (flag) => !flag.recommendationId || flag.recommendationId === recommendation.id
    )
  }));
  const primaryIssue = detectedIssues[0] ?? null;
  const nextBestAction = recommendations[0] ?? null;
  const confidence = overallConfidence(detectedIssues, input.parsedLogData, supportingReferences);

  return {
    id: createId("result"),
    createdAt,
    updatedAt: createdAt,
    summary: input.summary,
    confidence,
    warnings: [...input.parsedLogData.warnings, ...input.parsedLogData.errors],
    parsedSummary: buildParsedSummary(input.parsedLogData),
    primaryIssue,
    supportingReferences,
    validationFlags,
    detectedIssues,
    likelyCauses,
    recommendations,
    nextBestAction,
    parsedLogData: input.parsedLogData,
    residualAnalysis: input.residualAnalysis,
    report: input.report
  };
}
