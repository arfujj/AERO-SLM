import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedLogData, ResidualSeries } from "@aeroslm/shared";
import { analyzeResidualTrends } from "./residualAnalysis.js";

function buildSeries(metric: string, values: number[]): ResidualSeries {
  return {
    id: metric,
    metric,
    samples: values.map((value, index) => ({
      step: index + 1,
      value,
      rawValue: String(value)
    })),
    lastValue: values.at(-1) ?? null,
    trend: "unknown"
  };
}

function buildParsedLogData(residualSeries: ResidualSeries[]): ParsedLogData {
  return {
    parsedAt: new Date().toISOString(),
    parserVersion: "test",
    sourceFormat: "generic-v1",
    status: "unstable",
    rawLineCount: 10,
    iterationNumbers: [1, 2, 3, 4],
    lastIteration: 4,
    timestepCount: 4,
    cflSeries: null,
    warnings: [],
    errors: [],
    solverMessages: [],
    convergencePatterns: [],
    missingFields: [],
    residualSeries
  };
}

test("detects divergence when residuals rise materially", () => {
  const assessments = analyzeResidualTrends(
    buildParsedLogData([buildSeries("Continuity", [0.01, 0.014, 0.019, 0.026])])
  );

  assert.equal(assessments[0]?.classification, "divergence");
  assert.ok((assessments[0]?.confidence ?? 0) >= 0.7);
});

test("detects oscillatory convergence when residuals alternate direction", () => {
  const assessments = analyzeResidualTrends(
    buildParsedLogData([buildSeries("Continuity", [0.012, 0.02, 0.013, 0.019, 0.014])])
  );

  assert.ok(assessments.some((assessment) => assessment.classification === "oscillatory-convergence"));
});

test("detects residual stagnation when residuals barely improve", () => {
  const assessments = analyzeResidualTrends(
    buildParsedLogData([buildSeries("Continuity", [0.011, 0.0107, 0.0105, 0.0103])])
  );

  assert.ok(assessments.some((assessment) => assessment.classification === "residual-stagnation"));
});

test("detects slow convergence when residuals improve gradually", () => {
  const assessments = analyzeResidualTrends(
    buildParsedLogData([buildSeries("Continuity", [0.02, 0.0185, 0.0172, 0.0161, 0.0154])])
  );

  assert.ok(assessments.some((assessment) => assessment.classification === "slow-convergence"));
});
