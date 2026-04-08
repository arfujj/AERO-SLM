import type {
  ParsedLogData,
  ResidualAnalysisAssessment,
  ResidualAnalysisDebug,
  ResidualIssueClassification,
  ResidualSeries
} from "@aeroslm/shared";

interface SeriesFeatures {
  metric: string;
  numericValues: number[];
  relativeChange: number | null;
  slopeDirectionRatio: number | null;
  signChangeCount: number;
}

function roundConfidence(value: number): number {
  return Math.max(0.15, Math.min(0.92, Number(value.toFixed(2))));
}

function summarizeMetrics(metrics: string[]): string {
  return metrics.length > 0 ? metrics.join(", ") : "available residuals";
}

function computeSeriesFeatures(series: ResidualSeries): SeriesFeatures | null {
  const numericValues = series.samples
    .map((sample) => sample.value)
    .filter((value): value is number => value !== null);

  if (numericValues.length < 2) {
    return null;
  }

  const deltas = numericValues.slice(1).map((value, index) => value - numericValues[index]);
  const signs = deltas.filter((delta) => Math.abs(delta) > 1e-10).map((delta) => Math.sign(delta));
  const signChangeCount = signs.slice(1).reduce((count, sign, index) => count + Number(sign !== signs[index]), 0);
  const first = numericValues[0];
  const last = numericValues.at(-1) ?? first;
  const relativeChange = first !== 0 ? (last - first) / Math.abs(first) : null;
  const positiveSteps = deltas.filter((delta) => delta > 0).length;
  const slopeDirectionRatio = deltas.length > 0 ? positiveSteps / deltas.length : null;

  return {
    metric: series.metric,
    numericValues,
    relativeChange,
    slopeDirectionRatio,
    signChangeCount
  };
}

function buildDebug(
  features: SeriesFeatures[],
  matchedMetrics: string[],
  scoreBreakdown: string[],
  weakData: boolean
): ResidualAnalysisDebug {
  const allRelativeChanges = features
    .map((feature) => feature.relativeChange)
    .filter((value): value is number => value !== null);
  const maxWindow = Math.max(0, ...features.map((feature) => feature.numericValues.length));

  return {
    analyzedSeriesCount: features.length,
    totalNumericSamples: features.reduce((total, feature) => total + feature.numericValues.length, 0),
    matchedMetrics,
    windowLength: maxWindow,
    averageRelativeChange:
      allRelativeChanges.length > 0
        ? Number((allRelativeChanges.reduce((sum, value) => sum + value, 0) / allRelativeChanges.length).toFixed(3))
        : null,
    signChangeCount: features.reduce((total, feature) => total + feature.signChangeCount, 0),
    scoreBreakdown,
    weakData
  };
}

function createAssessment(
  classification: ResidualIssueClassification,
  confidence: number,
  rationale: string,
  trendSummary: string,
  debug: ResidualAnalysisDebug
): ResidualAnalysisAssessment {
  return {
    classification,
    confidence: roundConfidence(confidence),
    rationale,
    trendSummary,
    debug
  };
}

export function analyzeResidualTrends(parsedLogData: ParsedLogData): ResidualAnalysisAssessment[] {
  const features = parsedLogData.residualSeries
    .map((series) => computeSeriesFeatures(series))
    .filter((feature): feature is SeriesFeatures => feature !== null);

  if (features.length === 0) {
    return [];
  }

  const weakData = features.every((feature) => feature.numericValues.length < 3);
  const assessments: ResidualAnalysisAssessment[] = [];

  const divergenceMetrics = features
    .filter(
      (feature) =>
        feature.relativeChange !== null &&
        feature.relativeChange >= 0.35 &&
        (feature.slopeDirectionRatio ?? 0) >= 0.6
    )
    .map((feature) => feature.metric);

  if (divergenceMetrics.length > 0) {
    const scoreBreakdown = [
      `metrics rising materially: ${summarizeMetrics(divergenceMetrics)}`,
      "relative growth threshold >= 35%",
      "majority of step-to-step changes are positive"
    ];
    assessments.push(
      createAssessment(
        "divergence",
        weakData ? 0.42 : 0.78,
        "Multiple residual series are increasing over the available analysis window instead of decaying, which is consistent with divergence.",
        `Residuals for ${summarizeMetrics(divergenceMetrics)} rise materially over the observed window.`,
        buildDebug(features, divergenceMetrics, scoreBreakdown, weakData)
      )
    );
  }

  const oscillationMetrics = features
    .filter(
      (feature) =>
        feature.signChangeCount >= 1 &&
        Math.abs(feature.relativeChange ?? 0) < 0.25 &&
        feature.numericValues.length >= 3
    )
    .map((feature) => feature.metric);

  if (oscillationMetrics.length > 0) {
    const scoreBreakdown = [
      `alternating rises and falls in: ${summarizeMetrics(oscillationMetrics)}`,
      "net settling remains limited",
      "sign changes detected in successive residual deltas"
    ];
    assessments.push(
      createAssessment(
        "oscillatory-convergence",
        weakData ? 0.38 : 0.71,
        "Residuals repeatedly rise and fall without showing a stable downward settlement, which suggests oscillatory convergence.",
        `Residuals for ${summarizeMetrics(oscillationMetrics)} alternate direction without settling cleanly.`,
        buildDebug(features, oscillationMetrics, scoreBreakdown, weakData)
      )
    );
  }

  const stagnationMetrics = features
    .filter(
      (feature) =>
        feature.numericValues.length >= 2 &&
        feature.relativeChange !== null &&
        Math.abs(feature.relativeChange) < 0.1 &&
        feature.signChangeCount === 0
    )
    .map((feature) => feature.metric);

  if (stagnationMetrics.length > 0) {
    const scoreBreakdown = [
      `minimal net improvement in: ${summarizeMetrics(stagnationMetrics)}`,
      "overall change stays below 10%",
      "no meaningful decay trend across the observed window"
    ];
    assessments.push(
      createAssessment(
        "residual-stagnation",
        weakData ? 0.35 : 0.68,
        "Residuals show little net improvement across the available iterations, which is consistent with stagnation.",
        `Residuals for ${summarizeMetrics(stagnationMetrics)} remain nearly flat over the observed window.`,
        buildDebug(features, stagnationMetrics, scoreBreakdown, weakData)
      )
    );
  }

  const slowMetrics = features
    .filter(
      (feature) =>
        feature.numericValues.length >= 2 &&
        feature.relativeChange !== null &&
        feature.relativeChange <= -0.1 &&
        feature.relativeChange > -0.6 &&
        feature.signChangeCount <= 1
    )
    .map((feature) => feature.metric);

  if (slowMetrics.length > 0) {
    const scoreBreakdown = [
      `gradual improvement in: ${summarizeMetrics(slowMetrics)}`,
      "residuals are decaying, but not sharply",
      "trend is mostly one-directional"
    ];
    assessments.push(
      createAssessment(
        "slow-convergence",
        weakData ? 0.33 : 0.63,
        "Residuals are improving, but only gradually across the observed iterations, which suggests slow convergence rather than clean rapid decay.",
        `Residuals for ${summarizeMetrics(slowMetrics)} are trending downward slowly over the observed window.`,
        buildDebug(features, slowMetrics, scoreBreakdown, weakData)
      )
    );
  }

  return assessments.sort((left, right) => right.confidence - left.confidence);
}
