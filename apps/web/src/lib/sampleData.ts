import type { DiagnosePayload, SampleSolverCase } from "@aeroslm/shared";
import { buildSimulationContextFromSample, sampleSolverCases } from "@aeroslm/shared";

export function buildPayloadFromSample(sample: SampleSolverCase): DiagnosePayload {
  return {
    question: sample.troubleshootingQuestion,
    context: buildSimulationContextFromSample(sample),
    logFile: {
      fileName: `${sample.id}.log`,
      content: sample.rawLogText,
      uploadedAt: new Date().toISOString()
    }
  };
}

export function getSampleSolverCase(index: number): SampleSolverCase {
  return sampleSolverCases[index % sampleSolverCases.length];
}

export const sampleCaseCount = sampleSolverCases.length;
