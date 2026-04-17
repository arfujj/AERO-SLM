import assert from "node:assert/strict";
import test from "node:test";
import type { DiagnosePayload, ParsedLogData, ResidualAnalysisAssessment, RetrievedEngineeringReference } from "@aeroslm/shared";
import { assembleDiagnosisResult } from "./diagnosisAssembler.js";

const payload: DiagnosePayload = {
  question: "Why are the residuals oscillating instead of settling?",
  context: {
    solverName: "OpenFOAM",
    solverVersion: "v2312",
    caseDescription: "Separated duct oscillatory case",
    flowRegime: "Subsonic",
    meshCells: 3200000,
    turbulenceModel: "LES",
    machNumber: 0.28,
    reynoldsNumber: 1800000,
    notes: "Outlet reverse flow present."
  },
  logFile: {
    fileName: "demo.log",
    content: "Warning: Outlet backflow detected",
    uploadedAt: new Date().toISOString()
  }
};

const parsedLogData: ParsedLogData = {
  parsedAt: new Date().toISOString(),
  parserVersion: "generic-v1",
  parserType: "generic-text-v1",
  solverDetected: "OpenFOAM",
  rawText: payload.logFile.content,
  normalizedText: payload.logFile.content,
  lines: [payload.logFile.content],
  lineCount: 1,
  iterations: [100, 101, 102],
  residualEntries: [
    {
      field: "Continuity",
      iteration: 100,
      rawValue: "8.0e-03",
      value: 0.008,
      sourceLine: "Continuity residual = 8.0e-03"
    }
  ],
  cflEntries: [],
  fatalMessages: [],
  notices: [],
  metadata: { solver: "OpenFOAM" },
  parseCoverage: {
    iterations: "available",
    residuals: "available",
    cfl: "unavailable",
    warnings: "available",
    errors: "unavailable",
    fatalMessages: "unavailable",
    notices: "unavailable",
    metadata: "available",
    status: "partial",
    missingFields: ["cflEntries", "errors", "fatalMessages", "notices"]
  },
  unsupportedPatterns: [],
  parseStatus: "partial",
  sourceFormat: "generic-v1",
  status: "unstable",
  rawLineCount: 8,
  iterationNumbers: [100, 101, 102],
  lastIteration: 102,
  timestepCount: 3,
  cflSeries: null,
  warnings: ["Outlet backflow detected on patch diffuser_exit"],
  errors: [],
  solverMessages: [],
  convergencePatterns: ["Outlet pressure monitor oscillation exceeds tolerance band"],
  missingFields: ["cflEntries"],
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

const residualAnalysis: ResidualAnalysisAssessment[] = [
  {
    classification: "oscillatory-convergence",
    confidence: 0.71,
    rationale: "Residuals alternate direction without settling.",
    trendSummary: "Continuity residuals oscillate across the observed window.",
    debug: {
      analyzedSeriesCount: 1,
      totalNumericSamples: 3,
      matchedMetrics: ["Continuity"],
      windowLength: 3,
      averageRelativeChange: 0.02,
      signChangeCount: 2,
      scoreBreakdown: ["alternating rises and falls"],
      weakData: false
    }
  }
];

const retrievedReferences: RetrievedEngineeringReference[] = [
  {
    id: "ref-outlet-backflow",
    title: "Outlet boundary treatment under separated wake conditions",
    sourceType: "seed-library",
    snippet: "Outlet backflow often indicates the outlet is too close to recirculation.",
    keywords: ["outlet", "backflow"],
    relatedIssueTypes: ["oscillatory-convergence", "boundary-condition"],
    relevanceExplanation: "matched issue type oscillatory-convergence; matched keywords outlet, backflow"
  }
];

test("assembles structured diagnosis result with ranked causes and actions", () => {
  const result = assembleDiagnosisResult({
    payload,
    parsedLogData,
    residualAnalysis,
    retrievedReferences,
    summary: "The log is unstable and shows oscillatory convergence behavior."
  });

  assert.equal(result.primaryIssue?.issueType, "boundary-condition");
  assert.ok(result.likelyCauses.length >= 1);
  assert.ok(result.recommendations.length >= 1);
  assert.ok(result.nextBestAction);
  assert.equal(result.parsedSummary.lastIteration, 102);
  assert.ok(result.supportingReferences[0]?.excerpt?.includes("matched issue type"));
});

test("assembles partial diagnosis output gracefully when parsing is incomplete", () => {
  const partial = assembleDiagnosisResult({
    payload,
    parsedLogData: {
      ...parsedLogData,
      residualSeries: [],
      residualEntries: [],
      missingFields: ["residualEntries", "cflEntries", "solverMessages"]
    },
    residualAnalysis: [],
    retrievedReferences: [],
    summary: "Parsing is incomplete; recommendations are broad and low confidence."
  });

  assert.equal(partial.primaryIssue, null);
  assert.ok(partial.confidence <= 0.35);
  assert.ok(partial.nextBestAction);
  assert.ok(partial.nextBestAction?.action.includes("Capture a longer residual history"));
});
