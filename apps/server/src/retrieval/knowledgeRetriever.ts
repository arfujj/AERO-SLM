import type {
  ParsedLogData,
  RetrievedEngineeringReference,
  ResidualAnalysisAssessment,
  SimulationContext
} from "@aeroslm/shared";
import { knowledgeBase } from "../sample-data/knowledgeBase.js";

interface RetrievalInput {
  issueTypes: string[];
  solver: string;
  turbulenceModel: string;
  question: string;
  parsedLogData: ParsedLogData;
}

interface ScoredReference {
  reference: RetrievedEngineeringReference;
  score: number;
}

function normalize(value: string): string {
  return value.toLowerCase();
}

function buildSignalUniverse(input: RetrievalInput): string[] {
  return [
    normalize(input.solver),
    normalize(input.turbulenceModel),
    normalize(input.question),
    ...input.issueTypes.map(normalize),
    ...input.parsedLogData.warnings.map(normalize),
    ...input.parsedLogData.errors.map(normalize),
    ...input.parsedLogData.convergencePatterns.map(normalize),
    ...input.parsedLogData.residualSeries.map((series) => normalize(series.metric))
  ];
}

function buildRelevanceExplanation(reasons: string[]): string {
  return reasons.join("; ");
}

export function retrieveEngineeringReferences(input: RetrievalInput): RetrievedEngineeringReference[] {
  const signalUniverse = buildSignalUniverse(input);

  const scored: ScoredReference[] = knowledgeBase
    .map((reference) => {
      const reasons: string[] = [];
      let score = 0;

      const issueMatches = reference.relatedIssueTypes.filter((issueType) =>
        input.issueTypes.some((candidate) => normalize(candidate).includes(normalize(issueType)))
      );
      if (issueMatches.length > 0) {
        score += issueMatches.length * 5;
        reasons.push(`matched issue type ${issueMatches.join(", ")}`);
      }

      const keywordMatches = reference.keywords.filter((keyword) =>
        signalUniverse.some((signal) => signal.includes(normalize(keyword)))
      );
      if (keywordMatches.length > 0) {
        score += keywordMatches.length * 2;
        reasons.push(`matched keywords ${keywordMatches.join(", ")}`);
      }

      if (normalize(input.question).includes(normalize(reference.title))) {
        score += 2;
        reasons.push("question closely matches reference topic");
      }

      if (score === 0) {
        return null;
      }

      return {
        reference: {
          ...reference,
          relevanceExplanation: buildRelevanceExplanation(reasons)
        },
        score
      };
    })
    .filter((item): item is ScoredReference => item !== null)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.reference.id.localeCompare(right.reference.id);
    });

  return scored.slice(0, 5).map(({ reference }) => reference);
}

export function buildRetrievalInput(
  residualAnalysis: ResidualAnalysisAssessment[],
  context: SimulationContext,
  question: string,
  parsedLogData: ParsedLogData
): RetrievalInput {
  return {
    issueTypes: residualAnalysis.map((assessment) => assessment.classification),
    solver: context.solverName,
    turbulenceModel: context.turbulenceModel,
    question,
    parsedLogData
  };
}
