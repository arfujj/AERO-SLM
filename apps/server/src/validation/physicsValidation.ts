import type {
  DetectedIssue,
  ParsedLogData,
  Recommendation,
  SimulationContext,
  SupportingReference,
  ValidationFlag
} from "@aeroslm/shared";

interface PhysicsValidationInput {
  context: SimulationContext;
  parsedLogData: ParsedLogData;
  detectedIssues: DetectedIssue[];
  recommendations: Recommendation[];
  supportingReferences: SupportingReference[];
}

interface PhysicsValidationResult {
  recommendations: Recommendation[];
  flags: ValidationFlag[];
}

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeFlag(input: {
  rule: string;
  severity: ValidationFlag["severity"];
  message: string;
  triggeredBy: string;
  recommendationId?: string;
  suppressed?: boolean;
}): ValidationFlag {
  return {
    id: createId("flag"),
    rule: input.rule,
    severity: input.severity,
    message: input.message,
    triggeredBy: input.triggeredBy,
    recommendationId: input.recommendationId,
    suppressed: input.suppressed ?? false
  };
}

function hasBoundaryEvidence(parsedLogData: ParsedLogData, supportingReferences: SupportingReference[]): boolean {
  const warningText = [...parsedLogData.warnings, ...parsedLogData.convergencePatterns].join(" ").toLowerCase();
  const referenceText = supportingReferences.map((reference) => reference.title.toLowerCase()).join(" ");
  return (
    warningText.includes("backflow") ||
    warningText.includes("reverse flow") ||
    warningText.includes("outlet") ||
    referenceText.includes("outlet")
  );
}

function hasSolverTuningEvidence(parsedLogData: ParsedLogData, detectedIssues: DetectedIssue[]): boolean {
  const patternText = parsedLogData.convergencePatterns.join(" ").toLowerCase();
  return (
    patternText.includes("plateau") ||
    patternText.includes("below configured target") ||
    detectedIssues.some((issue) => issue.title.includes("stagnation") || issue.title.includes("Slow convergence"))
  );
}

function hasCflEvidence(parsedLogData: ParsedLogData, detectedIssues: DetectedIssue[]): boolean {
  return (
    parsedLogData.cflSeries !== null ||
    detectedIssues.some((issue) => issue.title.includes("divergence")) ||
    parsedLogData.errors.some((error) => error.toLowerCase().includes("diverg"))
  );
}

export function validatePhysicsRecommendations(input: PhysicsValidationInput): PhysicsValidationResult {
  const flags: ValidationFlag[] = [];
  let recommendations = [...input.recommendations];

  const mach = input.context.machNumber;
  const flowRegime = input.context.flowRegime.toLowerCase();
  const turbulenceModel = input.context.turbulenceModel.toLowerCase();
  const reynolds = input.context.reynoldsNumber;

  if (mach !== undefined) {
    if (mach < 0.8 && ["transonic", "supersonic", "hypersonic"].includes(flowRegime)) {
      flags.push(
        makeFlag({
          rule: "mach-regime-consistency",
          severity: flowRegime === "transonic" ? "caution" : "critical",
          message: `Mach ${mach} is lower than expected for the selected ${input.context.flowRegime} regime.`,
          triggeredBy: `context.machNumber=${mach}, context.flowRegime=${input.context.flowRegime}`
        })
      );
    }

    if (mach >= 0.8 && mach < 1.2 && flowRegime === "subsonic") {
      flags.push(
        makeFlag({
          rule: "mach-regime-consistency",
          severity: "caution",
          message: `Mach ${mach} lies near the transonic range, so a purely subsonic label may be misleading.`,
          triggeredBy: `context.machNumber=${mach}, context.flowRegime=${input.context.flowRegime}`
        })
      );
    }

    if (mach >= 1.2 && ["subsonic", "transonic"].includes(flowRegime)) {
      flags.push(
        makeFlag({
          rule: "mach-regime-consistency",
          severity: "critical",
          message: `Mach ${mach} is inconsistent with the selected ${input.context.flowRegime} regime.`,
          triggeredBy: `context.machNumber=${mach}, context.flowRegime=${input.context.flowRegime}`
        })
      );
    }
  }

  if (turbulenceModel === "les" && input.context.meshCells < 1000000) {
    flags.push(
      makeFlag({
        rule: "turbulence-model-suitability",
        severity: "caution",
        message: "LES is selected with a relatively low mesh count, which may be too coarse for credible resolved turbulence behavior.",
        triggeredBy: `context.turbulenceModel=${input.context.turbulenceModel}, context.meshCells=${input.context.meshCells}`
      })
    );
  }

  if (turbulenceModel === "spalart-allmaras" && flowRegime === "hypersonic") {
    flags.push(
      makeFlag({
        rule: "turbulence-model-suitability",
        severity: "caution",
        message: "Spalart-Allmaras can be a weak fit for hypersonic physics without additional modeling justification.",
        triggeredBy: `context.turbulenceModel=${input.context.turbulenceModel}, context.flowRegime=${input.context.flowRegime}`
      })
    );
  }

  if (reynolds !== undefined && reynolds < 10000 && turbulenceModel !== "les") {
    flags.push(
      makeFlag({
        rule: "reynolds-flow-sanity",
        severity: "info",
        message: "The supplied Reynolds number is low for a turbulence-model-driven setup; confirm whether a laminar treatment is more appropriate.",
        triggeredBy: `context.reynoldsNumber=${reynolds}, context.turbulenceModel=${input.context.turbulenceModel}`
      })
    );
  }

  recommendations = recommendations.filter((recommendation) => {
    const actionText = `${recommendation.title} ${recommendation.action}`.toLowerCase();

    if ((actionText.includes("outlet") || actionText.includes("reverse-flow")) && !hasBoundaryEvidence(input.parsedLogData, input.supportingReferences)) {
      flags.push(
        makeFlag({
          rule: "suspicious-aerodynamic-conclusion",
          severity: "critical",
          message: "An outlet-handling recommendation was suppressed because the parsed log does not contain outlet, backflow, or reverse-flow evidence.",
          triggeredBy: "recommendation references outlet handling without matching parsed boundary evidence",
          recommendationId: recommendation.id,
          suppressed: true
        })
      );
      return false;
    }

    if ((actionText.includes("cfl") || actionText.includes("timestep")) && !hasCflEvidence(input.parsedLogData, input.detectedIssues)) {
      flags.push(
        makeFlag({
          rule: "solver-setting-caution",
          severity: "caution",
          message: "A CFL or timestep recommendation was kept, but supporting CFL-specific evidence is limited.",
          triggeredBy: "recommendation references CFL/timestep without parsed CFL series",
          recommendationId: recommendation.id
        })
      );
    }

    if ((actionText.includes("linear solver") || actionText.includes("multigrid")) && !hasSolverTuningEvidence(input.parsedLogData, input.detectedIssues)) {
      flags.push(
        makeFlag({
          rule: "solver-setting-caution",
          severity: "caution",
          message: "A solver-tuning recommendation was kept, but the parsed log lacks a clear plateau or slow-convergence signal.",
          triggeredBy: "recommendation references linear-solver tuning without plateau evidence",
          recommendationId: recommendation.id
        })
      );
    }

    if (actionText.includes("force") && !input.parsedLogData.convergencePatterns.some((pattern) => pattern.toLowerCase().includes("force"))) {
      flags.push(
        makeFlag({
          rule: "suspicious-aerodynamic-conclusion",
          severity: "info",
          message: "The recommendation references force-monitor interpretation, but no explicit force-monitor signal was parsed from the log.",
          triggeredBy: "recommendation references force monitoring without parsed force-monitor text",
          recommendationId: recommendation.id
        })
      );
    }

    return true;
  });

  return {
    recommendations,
    flags
  };
}
