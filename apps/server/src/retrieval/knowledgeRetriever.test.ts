import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedLogData } from "@aeroslm/shared";
import { buildRetrievalInput, retrieveEngineeringReferences } from "./knowledgeRetriever.js";

const parsedLogData: ParsedLogData = {
  parsedAt: new Date().toISOString(),
  parserVersion: "test",
  sourceFormat: "generic-v1",
  status: "unstable",
  rawLineCount: 6,
  iterationNumbers: [100, 101, 102],
  lastIteration: 102,
  timestepCount: 3,
  cflSeries: null,
  warnings: ["Outlet backflow detected on patch farfield_outlet"],
  errors: [],
  solverMessages: [],
  convergencePatterns: ["Outlet pressure monitor oscillation exceeds tolerance band"],
  missingFields: ["cflValues"],
  residualSeries: [
    {
      id: "continuity",
      metric: "Continuity",
      samples: [
        { step: 100, value: 0.008, rawValue: "8.0e-03" },
        { step: 101, value: 0.011, rawValue: "1.1e-02" },
        { step: 102, value: 0.009, rawValue: "9.0e-03" }
      ],
      lastValue: 0.009,
      trend: "flat"
    }
  ]
};

test("retrieval ranks seeded references deterministically with relevance explanations", () => {
  const input = buildRetrievalInput(
    [{ classification: "oscillatory-convergence", confidence: 0.71, rationale: "", trendSummary: "", debug: {
      analyzedSeriesCount: 1,
      totalNumericSamples: 3,
      matchedMetrics: ["Continuity"],
      windowLength: 3,
      averageRelativeChange: 0.02,
      signChangeCount: 2,
      scoreBreakdown: [],
      weakData: false
    } }],
    {
      solverName: "OpenFOAM",
      solverVersion: "v2312",
      caseDescription: "Separated duct oscillatory case",
      flowRegime: "Subsonic",
      meshCells: 3200000,
      turbulenceModel: "LES",
      machNumber: 0.28,
      reynoldsNumber: 1800000,
      notes: "Outlet reverse flow"
    },
    "Why do the residuals and outlet pressure monitors keep oscillating instead of settling?",
    parsedLogData
  );

  const references = retrieveEngineeringReferences(input);

  assert.ok(references.length >= 3);
  assert.ok(
    ["ref-outlet-backflow", "ref-turbulence-inlet"].includes(references[0]?.id ?? ""),
    "top-ranked reference should be one of the strongest oscillation matches"
  );
  assert.ok(references.some((reference) => reference.id === "ref-outlet-backflow"));
  assert.ok(references.every((reference) => reference.relevanceExplanation.length > 0));
});
