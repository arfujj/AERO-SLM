import assert from "node:assert/strict";
import test from "node:test";
import type { DetectedIssue, ParsedLogData, Recommendation, SupportingReference } from "@aeroslm/shared";
import { validatePhysicsRecommendations } from "./physicsValidation.js";

const parsedLogData: ParsedLogData = {
  parsedAt: new Date().toISOString(),
  parserVersion: "generic-v1",
  sourceFormat: "generic-v1",
  status: "unstable",
  rawLineCount: 4,
  iterationNumbers: [10, 11],
  lastIteration: 11,
  timestepCount: 2,
  cflSeries: null,
  warnings: [],
  errors: [],
  solverMessages: [],
  convergencePatterns: [],
  missingFields: ["cflValues"],
  residualSeries: []
};

const detectedIssues: DetectedIssue[] = [
  {
    id: "issue_1",
    issueType: "convergence",
    title: "residual stagnation",
    summary: "Residuals are flat.",
    severity: "medium",
    confidence: 0.66,
    warnings: ["minimal net improvement"],
    references: [],
    validationFlags: []
  }
];

const supportingReferences: SupportingReference[] = [];

test("physics validation suppresses unsupported outlet recommendation and logs critical flag", () => {
  const recommendations: Recommendation[] = [
    {
      id: "rec_outlet",
      title: "Review outlet and reverse-flow handling",
      action: "Inspect outlet placement, outlet pressure settings, and reverse-flow boundary handling.",
      rationale: "Boundary handling recommendation.",
      priority: "high",
      confidence: 0.7,
      rank: 1,
      groundedBy: ["detected pattern"],
      references: [],
      validationFlags: []
    }
  ];

  const result = validatePhysicsRecommendations({
    context: {
      solverName: "SU2",
      solverVersion: "8.0",
      caseDescription: "High-lift case",
      flowRegime: "Subsonic",
      meshCells: 5000000,
      turbulenceModel: "Spalart-Allmaras",
      machNumber: 0.21,
      reynoldsNumber: 9400000,
      notes: ""
    },
    parsedLogData,
    detectedIssues,
    recommendations,
    supportingReferences
  });

  assert.equal(result.recommendations.length, 0);
  assert.ok(result.flags.some((flag) => flag.rule === "suspicious-aerodynamic-conclusion" && flag.suppressed));
});

test("physics validation emits caution for low-mesh LES suitability", () => {
  const result = validatePhysicsRecommendations({
    context: {
      solverName: "OpenFOAM",
      solverVersion: "v2312",
      caseDescription: "Separated duct",
      flowRegime: "Subsonic",
      meshCells: 800000,
      turbulenceModel: "LES",
      machNumber: 0.28,
      reynoldsNumber: 1800000,
      notes: ""
    },
    parsedLogData: {
      ...parsedLogData,
      warnings: ["Outlet backflow detected"],
      convergencePatterns: ["oscillation detected"]
    },
    detectedIssues,
    recommendations: [],
    supportingReferences
  });

  assert.ok(result.flags.some((flag) => flag.rule === "turbulence-model-suitability" && flag.severity === "caution"));
});
