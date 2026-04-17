import type { ParsedCflEntry, ParsedLogData, ParsedResidualEntry } from "@aeroslm/shared";
import type { IngestedTextLog, SolverLogParser } from "../types.js";
import {
  buildCflSeries,
  buildResidualSeries,
  determineLegacyStatus,
  extractConvergencePatterns,
  parseNumericValue,
  toMissingFields
} from "../utils/common.js";

const openFoamMarkers = [
  /OpenFOAM:\s+The Open Source CFD Toolbox/i,
  /FOAM FATAL ERROR/i,
  /\bExec\s*:\s*\w+/i,
  /\bsmoothSolver:\s+Solving for\b/i
];

const timePattern = /^\s*Time\s*=\s*([0-9.+\-eE]+)\s*$/i;
const solverResidualPattern =
  /^\s*\w+Solver:\s+Solving for\s+([^,]+),\s+Initial residual\s*=\s*([^,]+),\s+Final residual\s*=\s*([^,]+),\s+No Iterations\s+(\d+)/i;
const courantPattern = /Courant Number mean:\s*([0-9.+\-eE]+)\s+max:\s*([0-9.+\-eE]+)/i;
const metadataPatterns = [
  { key: "version", pattern: /^\s*Version:\s*(.+)$/i },
  { key: "build", pattern: /^\s*Build\s*:\s*(.+)$/i },
  { key: "exec", pattern: /^\s*Exec\s*:\s*(.+)$/i },
  { key: "date", pattern: /^\s*Date\s*:\s*(.+)$/i },
  { key: "time", pattern: /^\s*Time\s*:\s*(.+)$/i },
  { key: "host", pattern: /^\s*Host\s*:\s*(.+)$/i },
  { key: "case", pattern: /^\s*Case\s*:\s*(.+)$/i },
  { key: "nProcs", pattern: /^\s*nProcs\s*:\s*(.+)$/i }
];

function extractTimeStep(line: string): number | null {
  const match = line.match(timePattern);
  if (!match?.[1]) return null;

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractMetadata(lines: string[]): Record<string, string> {
  const metadata: Record<string, string> = {};

  for (const line of lines) {
    for (const { key, pattern } of metadataPatterns) {
      const match = line.match(pattern);
      if (match?.[1]) {
        metadata[key] = match[1].trim().replace(/^"|"$/g, "");
      }
    }
  }

  return metadata;
}

function extractResidualEntries(lines: string[]): ParsedResidualEntry[] {
  const entries: ParsedResidualEntry[] = [];
  let currentIteration: number | null = null;

  for (const line of lines) {
    const nextIteration = extractTimeStep(line);
    if (nextIteration !== null) {
      currentIteration = nextIteration;
      continue;
    }

    const match = line.match(solverResidualPattern);
    if (!match) continue;

    entries.push({
      field: match[1].trim(),
      iteration: currentIteration,
      rawValue: match[2].trim(),
      value: parseNumericValue(match[2]),
      sourceLine: line
    });
  }

  return entries;
}

function extractCflEntries(lines: string[]): ParsedCflEntry[] {
  const entries: ParsedCflEntry[] = [];
  let currentIteration: number | null = null;

  for (const line of lines) {
    const nextIteration = extractTimeStep(line);
    if (nextIteration !== null) {
      currentIteration = nextIteration;
    }

    const match = line.match(courantPattern);
    if (!match) continue;

    entries.push({
      metric: "Courant mean",
      iteration: currentIteration,
      rawValue: match[1].trim(),
      value: parseNumericValue(match[1]),
      sourceLine: line
    });
    entries.push({
      metric: "Courant max",
      iteration: currentIteration,
      rawValue: match[2].trim(),
      value: parseNumericValue(match[2]),
      sourceLine: line
    });
  }

  return entries;
}

function extractMessages(lines: string[]) {
  const warnings: string[] = [];
  const errors: string[] = [];
  const fatalMessages: string[] = [];
  const notices: string[] = [];

  let captureFatalBody = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^FOAM FATAL ERROR/i.test(line)) {
      fatalMessages.push(line);
      captureFatalBody = true;
      continue;
    }

    if (captureFatalBody) {
      if (/^FOAM exiting/i.test(line)) {
        notices.push(line);
        captureFatalBody = false;
        continue;
      }

      fatalMessages.push(line);
      continue;
    }

    if (/^FOAM Warning/i.test(line)) {
      warnings.push(line);
      continue;
    }

    if (/error/i.test(line) && !/ExecutionTime/i.test(line)) {
      errors.push(line);
      continue;
    }

    if (
      /^Time\s*=/i.test(line) ||
      /^Courant Number/i.test(line) ||
      /^ExecutionTime/i.test(line) ||
      /^Create time/i.test(line)
    ) {
      notices.push(line);
    }
  }

  return {
    warnings,
    errors,
    fatalMessages,
    notices
  };
}

export const openfoamParser: SolverLogParser = {
  parserType: "openfoam-v1",
  solverDetected: "OpenFOAM",
  canParse(input: IngestedTextLog) {
    return openFoamMarkers.some((pattern) => pattern.test(input.normalizedText));
  },
  parse(input: IngestedTextLog): ParsedLogData {
    const iterations = input.lines
      .map((line) => extractTimeStep(line))
      .filter((value): value is number => value !== null);
    const residualEntries = extractResidualEntries(input.lines);
    const cflEntries = extractCflEntries(input.lines);
    const metadata = extractMetadata(input.lines);
    const { warnings, errors, fatalMessages, notices } = extractMessages(input.lines);
    const unsupportedPatterns: string[] = [];
    const convergencePatterns = extractConvergencePatterns([
      ...input.lines,
      ...warnings,
      ...errors,
      ...fatalMessages
    ]);
    const residualSeries = buildResidualSeries(residualEntries);
    const missingFields = toMissingFields({
      iterations,
      cflEntries,
      residualEntries,
      warnings,
      errors,
      fatalMessages,
      notices,
      metadata
    });

    const coreMissingCount = [
      iterations.length === 0,
      residualEntries.length === 0,
      cflEntries.length === 0
    ].filter(Boolean).length;

    const parseStatus: ParsedLogData["parseStatus"] =
      fatalMessages.length > 0
        ? "failed"
        : coreMissingCount === 0
          ? "parsed"
          : "partial";

    const parseCoverage: ParsedLogData["parseCoverage"] = {
      iterations: iterations.length > 0 ? "available" : "unavailable",
      residuals: residualEntries.length > 0 ? "available" : "unavailable",
      cfl: cflEntries.length > 0 ? "available" : "unavailable",
      warnings: warnings.length > 0 ? "available" : "unavailable",
      errors: errors.length > 0 ? "available" : "unavailable",
      fatalMessages: fatalMessages.length > 0 ? "available" : "unavailable",
      notices: notices.length > 0 ? "available" : "unavailable",
      metadata: Object.keys(metadata).length > 0 ? "available" : "unavailable",
      status: parseStatus === "parsed" ? "complete" : parseStatus === "partial" ? "partial" : "minimal",
      missingFields
    };

    return {
      parsedAt: new Date().toISOString(),
      parserVersion: "openfoam-v1",
      parserType: "openfoam-v1",
      solverDetected: "OpenFOAM",
      rawText: input.rawText,
      normalizedText: input.normalizedText,
      lines: input.lines,
      lineCount: input.lineCount,
      iterations,
      residualEntries,
      cflEntries,
      warnings,
      errors,
      fatalMessages,
      notices,
      metadata,
      parseCoverage,
      unsupportedPatterns,
      parseStatus,
      sourceFormat: "openfoam-v1",
      status: determineLegacyStatus({
        errors,
        fatalMessages,
        warnings,
        residualSeries,
        convergencePatterns
      }),
      rawLineCount: input.lineCount,
      iterationNumbers: iterations,
      lastIteration: iterations.at(-1) ?? null,
      timestepCount: iterations.length,
      cflSeries: buildCflSeries(cflEntries),
      solverMessages: notices,
      convergencePatterns,
      missingFields,
      residualSeries
    };
  }
};
