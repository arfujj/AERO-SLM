import type {
  DiagnosisResult,
  DiagnosticFinding,
  DiagnosticReport,
  DiagnosePayload,
  ParsedLogData,
  ParsedSolverLog
} from "@aeroslm/shared";
import { assembleDiagnosisResult } from "./diagnosisAssembler.js";
import { analyzeResidualTrends } from "./residualAnalysis.js";
import { parseLogToStructuredData, parseSolverLog } from "../parsing/solverLogParser.js";
import { buildRetrievalInput, retrieveEngineeringReferences } from "../retrieval/knowledgeRetriever.js";

function buildRootCauseCandidates(
  parsedLog: ParsedSolverLog,
  parsedLogData: ParsedLogData,
  retrievedReferenceSnippets: string[]
): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const warningText = parsedLog.warnings.join(" ").toLowerCase();
  const errorText = parsedLog.errors.join(" ").toLowerCase();
  const residualAnalysis = analyzeResidualTrends(parsedLogData);

  if (errorText.includes("pressure correction") || errorText.includes("diverging")) {
    findings.push({
      title: "Pressure-velocity coupling instability",
      severity: "critical",
      rationale: "The log explicitly reports divergence during pressure correction, which often indicates unstable coupling or an aggressive timestep/CFL ramp.",
      evidence: parsedLog.errors,
      recommendations: [
        "Reduce the CFL ramp or timestep growth.",
        "Tighten under-relaxation for pressure and velocity coupling.",
        "Restart from a stabilized checkpoint if available."
      ]
    });
  }

  if (parsedLog.warnings.some((warning) => warning.toLowerCase().includes("backflow"))) {
    findings.push({
      title: "Outlet boundary condition mismatch",
      severity: "high",
      rationale: "Backflow warnings typically indicate an outlet placement or pressure condition that is inconsistent with the current flow field.",
      evidence: parsedLog.warnings.filter((warning: string) => warning.toLowerCase().includes("backflow")),
      recommendations: [
        "Move the outlet further downstream if geometry allows.",
        "Review outlet pressure specification and reverse-flow handling.",
        "Inspect recirculation regions near the outlet boundary."
      ]
    });
  }

  if (
    parsedLog.residualSignals.some(
      (signal) => signal.label.toLowerCase().includes("continuity") && signal.severity !== "low"
    )
  ) {
    findings.push({
      title: "Continuity convergence degradation",
      severity: "high",
      rationale: "Elevated continuity residuals suggest mass imbalance or poor pressure correction convergence.",
      evidence: parsedLog.residualSignals
        .filter((signal: ParsedSolverLog["residualSignals"][number]) =>
          signal.label.toLowerCase().includes("continuity")
        )
        .map((signal: ParsedSolverLog["residualSignals"][number]) => signal.evidence),
      recommendations: [
        "Inspect flux balance across boundaries.",
        "Check mesh non-orthogonality near strong gradients.",
        "Reduce relaxation until continuity residuals settle."
      ]
    });
  }

  if (warningText.includes("oscillation") || warningText.includes("reverse flow")) {
    findings.push({
      title: "Oscillatory convergence driven by boundary interaction",
      severity: "high",
      rationale: "The log shows repeating monitor oscillations and intermittent reverse flow, which usually points to an outlet or boundary specification that is feeding unsteady residual behavior.",
      evidence: parsedLog.warnings,
      recommendations: [
        "Revisit outlet pressure specification and reverse-flow handling.",
        "Check whether the outlet boundary is too close to a separated or recirculating region.",
        "Stabilize inlet turbulence and monitor settings before increasing solver aggressiveness."
      ]
    });
  }

  if (warningText.includes("plateau") || warningText.includes("convergence rate below")) {
    findings.push({
      title: "Residual stagnation from solver tuning limits",
      severity: "medium",
      rationale: "Residual plateaus and weak linear solver progress usually indicate that solver controls or initialization quality are limiting further contraction.",
      evidence: parsedLog.warnings,
      recommendations: [
        "Retune multigrid or linear solver settings to increase contraction per iteration.",
        "Use a better initial field or a lower-order precursor solution.",
        "Compare residual plateaus against force and pressure monitor stabilization."
      ]
    });
  }

  if (warningText.includes("drifting") || warningText.includes("minimal")) {
    findings.push({
      title: "Slow asymptotic convergence",
      severity: "medium",
      rationale: "The solution is still evolving while residual reduction has become very slow, indicating the case may converge but is doing so inefficiently.",
      evidence: parsedLog.warnings,
      recommendations: [
        "Review pseudo-time stepping or CFL strategy for late-stage convergence.",
        "Check wall resolution and turbulence-model consistency for drag on convergence.",
        "Tighten monitor-based stopping logic around force and moment stabilization."
      ]
    });
  }

  for (const assessment of residualAnalysis) {
    if (assessment.classification === "divergence") {
      findings.push({
        title: "Residual divergence trend detected",
        severity: "critical",
        rationale: assessment.rationale,
        evidence: [assessment.trendSummary, ...assessment.debug.scoreBreakdown],
        recommendations: [
          "Reduce timestep or CFL aggressiveness and re-run from a stable checkpoint.",
          "Inspect pressure-velocity coupling settings for robustness.",
          "Review whether recent setup changes coincided with the observed residual rise."
        ]
      });
    }

    if (assessment.classification === "oscillatory-convergence") {
      findings.push({
        title: "Residual oscillation pattern detected",
        severity: "high",
        rationale: assessment.rationale,
        evidence: [assessment.trendSummary, ...assessment.debug.scoreBreakdown],
        recommendations: [
          "Check outlet placement, reverse-flow handling, and monitor setup.",
          "Stabilize boundary inputs before increasing solver aggressiveness.",
          "Compare residual oscillation against force or pressure monitor oscillation."
        ]
      });
    }

    if (assessment.classification === "residual-stagnation") {
      findings.push({
        title: "Residual stagnation trend detected",
        severity: "medium",
        rationale: assessment.rationale,
        evidence: [assessment.trendSummary, ...assessment.debug.scoreBreakdown],
        recommendations: [
          "Retune linear solver or multigrid settings to improve contraction per iteration.",
          "Check whether initialization quality is limiting progress.",
          "Use monitor data to decide whether the plateau is acceptable or not."
        ]
      });
    }

    if (assessment.classification === "slow-convergence") {
      findings.push({
        title: "Slow convergence trend detected",
        severity: "medium",
        rationale: assessment.rationale,
        evidence: [assessment.trendSummary, ...assessment.debug.scoreBreakdown],
        recommendations: [
          "Review late-stage CFL or pseudo-time stepping strategy.",
          "Check turbulence-model and wall-resolution consistency.",
          "Confirm stopping criteria against physical monitor stabilization."
        ]
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      title: "General solver instability pattern",
      severity: parsedLog.runStatus === "completed" ? "medium" : "high",
      rationale: "The current heuristic engine found limited explicit fault signatures, so the report falls back to broad stability guidance.",
      evidence: retrievedReferenceSnippets,
      recommendations: [
        "Review initialization quality and first-step transients.",
        "Inspect mesh quality and boundary condition consistency.",
        "Capture additional solver telemetry for finer-grained diagnosis."
      ]
    });
  }

  return findings;
}

export function buildDiagnosticReportDraft(input: {
  payload: DiagnosePayload;
  parsedLog: ParsedSolverLog;
  parsedLogData: ParsedLogData;
  residualAnalysis: ReturnType<typeof analyzeResidualTrends>;
  retrievedReferences: ReturnType<typeof retrieveEngineeringReferences>;
}): DiagnosticReport {
  const likelyRootCauses = buildRootCauseCandidates(
    input.parsedLog,
    input.parsedLogData,
    input.retrievedReferences.map((reference) => reference.snippet)
  );
  const now = new Date().toISOString();
  const id = `diag_${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    createdAt: now,
    question: input.payload.question,
    context: input.payload.context,
    summary:
      input.parsedLog.runStatus === "failed"
        ? "The solver log shows a failed run with pressure/continuity instability indicators."
        : input.parsedLog.runStatus === "unstable"
          ? "The solver log is trending unstable and needs stabilization before trusting the current solution."
          : "The run completed, but the parser still found notable signals worth reviewing.",
    residualAnalysis: input.residualAnalysis,
    likelyRootCauses,
    stabilizationPlan: [
      "Reduce timestep or CFL growth and rerun from the last healthy checkpoint.",
      "Audit outlet and farfield boundary conditions against expected pressure recovery.",
      "Inspect mesh quality hotspots in regions with steep residual growth."
    ],
    followUpChecks: [
      "Track continuity, pressure correction, and turbulence residual envelopes for the next 200 iterations.",
      "Compare force coefficients before and after stabilization changes.",
      "Attach mesh quality metrics and boundary condition metadata to the next diagnostic pass."
    ],
    parsedLog: input.parsedLog,
    retrievedReferences: input.retrievedReferences
  };
}

export function createDiagnosticReport(payload: DiagnosePayload): {
  report: DiagnosticReport;
  result: DiagnosisResult;
} {
  const parsedLogData = parseLogToStructuredData(payload.logFile.content);
  const parsedLog = parseSolverLog(payload.logFile.content);
  const residualAnalysis = analyzeResidualTrends(parsedLogData);
  const retrievedReferences = retrieveEngineeringReferences(
    buildRetrievalInput(residualAnalysis, payload.context, payload.question, parsedLogData)
  );
  const report = buildDiagnosticReportDraft({
    payload,
    parsedLog,
    parsedLogData,
    residualAnalysis,
    retrievedReferences
  });

  const result = assembleDiagnosisResult({
    payload,
    parsedLogData,
    residualAnalysis,
    retrievedReferences,
    summary: report.summary,
    report
  });

  return {
    report,
    result
  };
}
