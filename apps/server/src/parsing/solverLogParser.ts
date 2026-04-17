import type { ParsedLogData, ParsedSolverLog, ParsedSolverSignal, SeverityLevel } from "@aeroslm/shared";
import { routeLogParser } from "./parserRouter.js";

function classifyResidualSeverity(value: number | null): SeverityLevel {
  if (value === null) return "medium";
  if (value > 1e-1) return "critical";
  if (value > 1e-2) return "high";
  if (value > 1e-3) return "medium";
  return "low";
}

function toResidualSignals(parsed: ParsedLogData): ParsedSolverSignal[] {
  return parsed.residualSeries.map((series) => ({
    label: series.metric,
    value: series.lastValue === null ? "missing" : String(series.lastValue),
    severity: classifyResidualSeverity(series.lastValue),
    evidence:
      series.samples.at(-1)?.rawValue !== undefined
        ? `${series.metric} residual observed at ${series.samples.at(-1)?.rawValue}`
        : `${series.metric} residual trend is ${series.trend}`
  }));
}

export function parseLogToStructuredData(content: string) {
  return routeLogParser({ rawText: content });
}

export function parseUploadedLogToStructuredData(input: { fileName?: string; rawText: string }) {
  return routeLogParser(input);
}

export function parseSolverLog(content: string): ParsedSolverLog {
  const parsed = routeLogParser({ rawText: content });

  return {
    runStatus: parsed.status,
    residualSignals: toResidualSignals(parsed),
    warnings: parsed.warnings,
    errors: [...parsed.errors, ...parsed.fatalMessages],
    timestepsObserved: parsed.lastIteration ?? parsed.iterations.length
  };
}
