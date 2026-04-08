import type { EngineeringReference, ParsedSolverLog, SimulationContext } from "../domain-models/cfd.js";

export type DemoIssueCategory =
  | "Divergence"
  | "Oscillatory convergence"
  | "Residual stagnation"
  | "Slow convergence";

export interface ExpectedParsedSummary {
  runStatus: ParsedSolverLog["runStatus"];
  dominantResiduals: string[];
  warningCount: number;
  errorCount: number;
  timestepsObserved: number;
}

export interface EngineeringReferenceSeed {
  id: string;
  title: string;
  sourceType: "seed-library";
  snippet: string;
  keywords: string[];
  relatedIssueTypes: string[];
}

export interface SampleSolverCase {
  id: string;
  title: string;
  solver: string;
  caseDescription: string;
  flowRegime: string;
  turbulenceModel: string;
  machNumber?: number;
  reynoldsNumber?: number;
  meshCells: number;
  troubleshootingQuestion: string;
  notes: string;
  rawLogText: string;
  expectedParsedSummary: ExpectedParsedSummary;
  expectedIssueClassification: DemoIssueCategory[];
  expectedRecommendations: string[];
  expectedValidationFlags: string[];
}

export const issueCategories: DemoIssueCategory[] = [
  "Divergence",
  "Oscillatory convergence",
  "Residual stagnation",
  "Slow convergence"
];

export const likelyCausesCatalog = [
  "Aggressive CFL or timestep ramp causing unstable pressure-velocity coupling.",
  "Outlet pressure or reverse-flow treatment inconsistent with the recirculating wake.",
  "Mesh skewness and non-orthogonality amplifying continuity and turbulence residual growth.",
  "Boundary condition mismatch driving oscillatory residual bands and force coefficient noise.",
  "Initialization quality leaving the solution on a non-physical transient branch.",
  "Linear solver or multigrid settings causing residual plateaus and slow asymptotic convergence."
] as const;

export const recommendedActionsCatalog = [
  "Reduce CFL growth or timestep size and restart from the last stable checkpoint.",
  "Tighten pressure-velocity under-relaxation and re-evaluate outer-corrector settings.",
  "Move the outlet boundary downstream or revise reverse-flow boundary handling.",
  "Inspect mesh quality hotspots and improve non-orthogonal or high-skewness regions.",
  "Improve initialization with a lower-order precursor or field mapping from a stable run.",
  "Retune linear solver tolerances, multigrid levels, or pseudo-time stepping controls."
] as const;

export const supportingEngineeringReferences: EngineeringReferenceSeed[] = [
  {
    id: "ref-cfl-ramp",
    title: "CFL ramp scheduling for compressible external flows",
    sourceType: "seed-library",
    snippet: "Rapid CFL escalation in transonic cases commonly destabilizes pressure correction before the shock structure has settled.",
    keywords: ["cfl", "compressible", "transonic", "divergence", "ansys fluent", "k-omega sst"],
    relatedIssueTypes: ["divergence", "numerical-stability"]
  },
  {
    id: "ref-outlet-backflow",
    title: "Outlet boundary treatment under separated wake conditions",
    sourceType: "seed-library",
    snippet: "Outlet backflow and oscillatory pressure recovery indicate that the outlet boundary may be too close to the dominant recirculation region.",
    keywords: ["outlet", "backflow", "wake", "oscillation", "boundary", "reverse flow"],
    relatedIssueTypes: ["oscillatory-convergence", "boundary-condition"]
  },
  {
    id: "ref-mesh-orthogonality",
    title: "Mesh orthogonality effects on pressure equation robustness",
    sourceType: "seed-library",
    snippet: "Poor orthogonality increases pressure-correction sensitivity and often presents as elevated continuity residuals.",
    keywords: ["mesh", "orthogonality", "pressure", "continuity", "residual", "convergence"],
    relatedIssueTypes: ["divergence", "residual-stagnation"]
  },
  {
    id: "ref-turbulence-inlet",
    title: "Turbulence boundary specification and residual oscillation",
    sourceType: "seed-library",
    snippet: "Incorrect inlet turbulence intensity or length scale can create periodic residual forcing and coefficient chatter.",
    keywords: ["turbulence", "inlet", "oscillation", "les", "openfoam", "residual"],
    relatedIssueTypes: ["oscillatory-convergence", "physics-consistency"]
  },
  {
    id: "ref-initialization",
    title: "Initialization strategy for accelerating convergence",
    sourceType: "seed-library",
    snippet: "A poor initial field can trap the solver in a long transient settle period and delay true asymptotic convergence.",
    keywords: ["initialization", "convergence", "stagnation", "slow", "startup"],
    relatedIssueTypes: ["slow-convergence", "residual-stagnation"]
  },
  {
    id: "ref-linear-solver",
    title: "Linear solver tuning for residual plateaus",
    sourceType: "seed-library",
    snippet: "Residual stagnation frequently traces back to coarse solver tolerances, ineffective preconditioning, or under-resolved multigrid settings.",
    keywords: ["linear-solver", "stagnation", "multigrid", "slow", "su2", "plateau"],
    relatedIssueTypes: ["residual-stagnation", "slow-convergence"]
  },
  {
    id: "ref-wall-resolution",
    title: "Wall resolution and turbulence-model consistency",
    sourceType: "seed-library",
    snippet: "A mismatch between near-wall resolution and turbulence model expectations can cause slow or oscillatory residual decay.",
    keywords: ["wall", "turbulence", "y+", "slow", "spalart-allmaras", "rans"],
    relatedIssueTypes: ["slow-convergence", "oscillatory-convergence"]
  },
  {
    id: "ref-force-monitoring",
    title: "Force-monitor interpretation during convergence assessment",
    sourceType: "seed-library",
    snippet: "Force coefficients that keep oscillating while residuals plateau often indicate unresolved physics or poor outlet placement.",
    keywords: ["forces", "monitoring", "oscillation", "validation", "plateau", "question"],
    relatedIssueTypes: ["oscillatory-convergence", "residual-stagnation"]
  }
];

export const physicsValidationRules = [
  "Check that the selected flow regime is consistent with the Mach number supplied for the case.",
  "Verify that turbulence model selection is compatible with the near-wall mesh resolution and intended fidelity.",
  "Flag outlet boundaries likely to sit inside recirculating or shock-influenced regions.",
  "Warn when solver residuals plateau without corresponding stabilization in force or pressure monitors.",
  "Require mesh and boundary-condition notes whenever the diagnosis indicates continuity or backflow issues."
] as const;

export const sampleSolverCases: SampleSolverCase[] = [
  {
    id: "sample-divergence-transonic",
    title: "Transonic wing-body divergence",
    solver: "ANSYS Fluent",
    caseDescription: "Transonic wing-body cruise case with wake recovery outlet placed close to the aft body.",
    flowRegime: "Transonic",
    turbulenceModel: "k-omega SST",
    machNumber: 0.82,
    reynoldsNumber: 6200000,
    meshCells: 4500000,
    troubleshootingQuestion: "Why does the pressure correction diverge immediately after the CFL ramp increases above 25?",
    notes: "Farfield outlet is near wake closure. Local mesh skewness around wing-body junction remains elevated.",
    rawLogText: `
Time Step 1178
Continuity residual = 1.8e-02
X-momentum residual = 9.7e-04
Y-momentum residual = 1.3e-03
k residual = 4.9e-03
omega residual = 6.5e-03
Time Step 1182
Continuity residual = 3.1e-02
X-momentum residual = 9.8e-04
Y-momentum residual = 1.1e-03
k residual = 5.7e-03
omega residual = 7.2e-03
Warning: Outlet backflow detected on patch farfield_outlet
Warning: Courant number exceeded target ramp value
Error: Solution diverging for pressure correction equation
`.trim(),
    expectedParsedSummary: {
      runStatus: "failed",
      dominantResiduals: ["Continuity", "k", "omega"],
      warningCount: 2,
      errorCount: 1,
      timestepsObserved: 1182
    },
    expectedIssueClassification: ["Divergence"],
    expectedRecommendations: [
      "Reduce CFL growth or timestep size and restart from the last stable checkpoint.",
      "Move the outlet boundary downstream or revise reverse-flow boundary handling.",
      "Inspect mesh quality hotspots and improve non-orthogonal or high-skewness regions."
    ],
    expectedValidationFlags: [
      "Flow regime and Mach pairing are consistent.",
      "Outlet placement may be inside a recirculating wake region.",
      "Mesh and boundary-condition notes are required for continuity-related instability."
    ]
  },
  {
    id: "sample-oscillation-openfoam",
    title: "Separated duct oscillatory convergence",
    solver: "OpenFOAM",
    caseDescription: "Subsonic internal duct with separation bubble near the diffuser shoulder and oscillatory outlet pressure recovery.",
    flowRegime: "Subsonic",
    turbulenceModel: "LES",
    machNumber: 0.28,
    reynoldsNumber: 1800000,
    meshCells: 3200000,
    troubleshootingQuestion: "Why do the residuals and outlet pressure monitors keep oscillating instead of settling?",
    notes: "Outlet pressure target was recently adjusted. Inlet turbulence intensity estimated from sparse test data.",
    rawLogText: `
Time Step 842
Continuity residual = 8.5e-03
X-momentum residual = 2.8e-03
Y-momentum residual = 2.5e-03
k residual = 1.9e-02
omega residual = 1.6e-02
Warning: Outlet pressure monitor oscillation exceeds tolerance band
Warning: Reverse flow intermittently detected on outlet patch diffuser_exit
Time Step 846
Continuity residual = 7.9e-03
X-momentum residual = 3.1e-03
Y-momentum residual = 2.7e-03
k residual = 2.1e-02
omega residual = 1.8e-02
Warning: Lift and pressure monitors show repeating low-frequency oscillation
`.trim(),
    expectedParsedSummary: {
      runStatus: "unstable",
      dominantResiduals: ["k", "omega", "Continuity"],
      warningCount: 3,
      errorCount: 0,
      timestepsObserved: 846
    },
    expectedIssueClassification: ["Oscillatory convergence"],
    expectedRecommendations: [
      "Move the outlet boundary downstream or revise reverse-flow boundary handling.",
      "Tighten pressure-velocity under-relaxation and re-evaluate outer-corrector settings.",
      "Improve initialization with a lower-order precursor or field mapping from a stable run."
    ],
    expectedValidationFlags: [
      "Outlet boundary may conflict with separated-flow recirculation.",
      "Turbulence setup should be checked against intended LES inlet conditions."
    ]
  },
  {
    id: "sample-stagnation-su2",
    title: "High-lift slow convergence plateau",
    solver: "SU2",
    caseDescription: "High-lift takeoff configuration with residual plateau after initial monotonic drop.",
    flowRegime: "Subsonic",
    turbulenceModel: "Spalart-Allmaras",
    machNumber: 0.21,
    reynoldsNumber: 9400000,
    meshCells: 6100000,
    troubleshootingQuestion: "Why do the residuals stop improving after the first few hundred iterations and converge so slowly afterward?",
    notes: "Wake refinement is moderate. Multigrid settings were relaxed to improve robustness on the previous run.",
    rawLogText: `
Time Step 392
Continuity residual = 6.4e-03
X-momentum residual = 2.2e-03
Y-momentum residual = 2.1e-03
k residual = 0.0
omega residual = 0.0
Warning: Residual plateau detected in density and momentum equations
Time Step 404
Continuity residual = 6.1e-03
X-momentum residual = 2.1e-03
Y-momentum residual = 2.0e-03
Warning: Linear solver convergence rate below configured target
Warning: Force coefficients still drifting while residual change remains minimal
`.trim(),
    expectedParsedSummary: {
      runStatus: "unstable",
      dominantResiduals: ["Continuity", "X-momentum", "Y-momentum"],
      warningCount: 3,
      errorCount: 0,
      timestepsObserved: 404
    },
    expectedIssueClassification: ["Residual stagnation", "Slow convergence"],
    expectedRecommendations: [
      "Retune linear solver tolerances, multigrid levels, or pseudo-time stepping controls.",
      "Improve initialization with a lower-order precursor or field mapping from a stable run.",
      "Inspect mesh quality hotspots and improve non-orthogonal or high-skewness regions."
    ],
    expectedValidationFlags: [
      "Residual plateau should be checked against force monitor stabilization.",
      "Solver settings may be too conservative for acceptable turnaround time."
    ]
  }
];

export const knowledgeBaseSeeds: EngineeringReference[] = supportingEngineeringReferences.map((reference) => ({
  id: reference.id,
  title: reference.title,
  sourceType: reference.sourceType,
  snippet: reference.snippet,
  keywords: reference.keywords,
  relatedIssueTypes: reference.relatedIssueTypes
}));

export function buildSimulationContextFromSample(sample: SampleSolverCase): SimulationContext {
  return {
    solverName: sample.solver,
    solverVersion: sample.solver === "ANSYS Fluent" ? "2024 R2" : sample.solver === "OpenFOAM" ? "v2312" : "v8.0",
    caseDescription: sample.caseDescription,
    flowRegime: sample.flowRegime,
    meshCells: sample.meshCells,
    turbulenceModel: sample.turbulenceModel,
    machNumber: sample.machNumber,
    reynoldsNumber: sample.reynoldsNumber,
    notes: sample.notes
  };
}
