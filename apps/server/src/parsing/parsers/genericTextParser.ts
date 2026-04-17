import type { ParsedCflEntry, ParsedLogData, ParsedResidualEntry, ResidualSeries } from "@aeroslm/shared";
import type { IngestedTextLog, SolverLogParser } from "../types.js";
import {
  buildCflSeries,
  buildResidualSeries,
  determineLegacyStatus,
  extractConvergencePatterns,
  parseNumericValue,
  toMissingFields
} from "../utils/common.js";

const iterationPatterns = [
  /Time Step\s+(\d+)/i,
  /Iteration\s+(\d+)/i,
  /^\s*(\d+)\s*[:,]/i
];

const residualPattern = /([A-Za-z][A-Za-z0-9+\-_/(). ]*?) residual = (\S+)/gi;
const cflPatterns = [
  /Courant number(?:\s*\(mean|max\))?\s*=\s*([\deE+.-]+)/i,
  /\bCFL\s*(?:number)?\s*=\s*([\deE+.-]+)/i
];
const warningPattern = /Warning:\s*(.+)/i;
const errorPattern = /Error:\s*(.+)/i;
const fatalPattern = /Fatal(?:\s+Error)?[:\s]+(.+)/i;
const knownSolverPatterns = [
  { label: "openfoam-markers", pattern: /OpenFOAM|FOAM FATAL ERROR|smoothSolver:/i },
  { label: "fluent-markers", pattern: /ANSYS Fluent|iter\s+\d+\s+continuity/i },
  { label: "su2-markers", pattern: /Begin Solver|SU2_CFD|MG level/i }
];

function extractIterationNumber(line: string): number | null {
  for (const pattern of iterationPatterns) {
    const match = line.match(pattern);
    if (!match?.[1]) continue;

    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function extractResidualEntries(lines: string[]): ParsedResidualEntry[] {
  const entries: ParsedResidualEntry[] = [];
  let currentIteration: number | null = null;

  for (const line of lines) {
    const iteration = extractIterationNumber(line);
    if (iteration !== null) {
      currentIteration = iteration;
    }

    for (const match of line.matchAll(residualPattern)) {
      entries.push({
        field: match[1].trim(),
        iteration: currentIteration,
        rawValue: match[2],
        value: parseNumericValue(match[2]),
        sourceLine: line
      });
    }
  }

  return entries;
}

function extractCflEntries(lines: string[]): ParsedCflEntry[] {
  const entries: ParsedCflEntry[] = [];
  let currentIteration: number | null = null;

  for (const line of lines) {
    const iteration = extractIterationNumber(line);
    if (iteration !== null) {
      currentIteration = iteration;
    }

    for (const pattern of cflPatterns) {
      const match = line.match(pattern);
      if (!match?.[1]) continue;

      entries.push({
        metric: "CFL",
        iteration: currentIteration,
        rawValue: match[1],
        value: parseNumericValue(match[1]),
        sourceLine: line
      });
      break;
    }
  }

  return entries;
}

function extractMessages(lines: string[]) {
  const warnings: string[] = [];
  const errors: string[] = [];
  const fatalMessages: string[] = [];
  const notices: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const fatalMatch = line.match(fatalPattern);
    if (fatalMatch?.[1]) {
      fatalMessages.push(fatalMatch[1].trim());
      continue;
    }

    const errorMatch = line.match(errorPattern);
    if (errorMatch?.[1]) {
      errors.push(errorMatch[1].trim());
      continue;
    }

    const warningMatch = line.match(warningPattern);
    if (warningMatch?.[1]) {
      warnings.push(warningMatch[1].trim());
      continue;
    }

    notices.push(line);
  }

  return {
    warnings,
    errors,
    fatalMessages,
    notices: notices.slice(0, 24)
  };
}

function buildUnsupportedPatterns(lines: string[]): string[] {
  const matches = new Set<string>();

  for (const line of lines) {
    for (const knownPattern of knownSolverPatterns) {
      if (knownPattern.pattern.test(line)) {
        matches.add(knownPattern.label);
      }
    }
  }

  return [...matches];
}

export const genericTextParser: SolverLogParser = {
  parserType: "generic-text-v1",
  solverDetected: "Unknown",
  canParse() {
    return true;
  },
  parse(input: IngestedTextLog): ParsedLogData {
    const iterations = input.lines
      .map((line) => extractIterationNumber(line))
      .filter((value): value is number => value !== null);
    const residualEntries = extractResidualEntries(input.lines);
    const cflEntries = extractCflEntries(input.lines);
    const { warnings, errors, fatalMessages, notices } = extractMessages(input.lines);
    const metadata: Record<string, string> = {};
    const unsupportedPatterns = buildUnsupportedPatterns(input.lines);
    const convergencePatterns = extractConvergencePatterns(input.lines);
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

    let parseStatus: ParsedLogData["parseStatus"] = "parsed";
    if (residualEntries.length === 0 && cflEntries.length === 0 && iterations.length === 0) {
      parseStatus = unsupportedPatterns.length > 0 ? "unsupported" : "partial";
    } else if (missingFields.length >= 4) {
      parseStatus = "partial";
    }

    const parseCoverage: ParsedLogData["parseCoverage"] = {
      iterations: iterations.length > 0 ? "available" : "unavailable",
      residuals: residualEntries.length > 0 ? "available" : "unavailable",
      cfl: cflEntries.length > 0 ? "available" : "unavailable",
      warnings: warnings.length > 0 ? "available" : "unavailable",
      errors: errors.length > 0 ? "available" : "unavailable",
      fatalMessages: fatalMessages.length > 0 ? "available" : "unavailable",
      notices: notices.length > 0 ? "available" : "unavailable",
      metadata: "unavailable",
      status: parseStatus === "parsed" ? "complete" : parseStatus === "partial" ? "partial" : "minimal",
      missingFields
    };

    return {
      parsedAt: new Date().toISOString(),
      parserVersion: "generic-text-v1",
      parserType: "generic-text-v1",
      solverDetected: "Unknown",
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
      sourceFormat: residualEntries.length > 0 || warnings.length > 0 || errors.length > 0 ? "generic-v1" : "unknown",
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
