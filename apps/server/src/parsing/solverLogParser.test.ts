import assert from "node:assert/strict";
import test from "node:test";
import { sampleSolverCases } from "@aeroslm/shared";
import { parseLogToStructuredData } from "./solverLogParser.js";

test("generic v1 parser extracts residuals, warnings, and iterations from seeded divergence case", () => {
  const sample = sampleSolverCases[0];
  const parsed = parseLogToStructuredData(sample.rawLogText);

  assert.equal(parsed.status, "failed");
  assert.equal(parsed.lastIteration, sample.expectedParsedSummary.timestepsObserved);
  assert.ok(parsed.residualSeries.length >= 3);
  assert.ok(parsed.warnings.length >= 1);
  assert.ok(parsed.errors.length >= 1);
  assert.ok(parsed.convergencePatterns.some((pattern) => pattern.toLowerCase().includes("diverging")));
});

test("generic v1 parser handles oscillatory warning patterns without fabricating CFL values", () => {
  const sample = sampleSolverCases[1];
  const parsed = parseLogToStructuredData(sample.rawLogText);

  assert.equal(parsed.status, "unstable");
  assert.equal(parsed.cflSeries, null);
  assert.ok(parsed.missingFields.includes("cflValues"));
  assert.ok(parsed.convergencePatterns.some((pattern) => pattern.toLowerCase().includes("oscillation")));
});

test("generic v1 parser is resilient to incomplete noisy logs", () => {
  const noisyLog = `
    Solver initialized with fallback defaults
    Warning: Residual plateau detected in pressure equation
    Continuity residual = not-a-number
    CFL = ???
    Iteration 41
    Some unrelated diagnostic line
  `.trim();

  const parsed = parseLogToStructuredData(noisyLog);

  assert.equal(parsed.lastIteration, 41);
  assert.equal(parsed.cflSeries, null);
  assert.ok(parsed.missingFields.includes("cflValues"));
  assert.ok(parsed.residualSeries.some((series) => series.metric === "Continuity"));
  assert.equal(parsed.residualSeries.find((series) => series.metric === "Continuity")?.lastValue, null);
});
