import type {
  NumericSeries,
  ParsedLogData,
  ParsedSolverLog,
  ParsedSolverSignal,
  ResidualSample,
  ResidualSeries,
  SeverityLevel
} from "@aeroslm/shared";

const iterationPatterns = [
  /Time Step\s+(\d+)/i,
  /Iteration\s+(\d+)/i,
  /^\s*(\d+)\s*[:,]/i
];

const residualPattern = /([A-Za-z][A-Za-z0-9+\-_/(). ]*?) residual = (\S+)/gi;
const residualLinePattern = /([A-Za-z][A-Za-z0-9+\-_/(). ]*?) residual = (\S+)/i;
const cflPatterns = [
  /Courant number(?:\s*\(mean|max\))?\s*=\s*([\deE+.-]+)/i,
  /\bCFL\s*(?:number)?\s*=\s*([\deE+.-]+)/i
];
const warningPattern = /Warning:\s*(.+)/gi;
const warningLinePattern = /Warning:\s*(.+)/i;
const errorPattern = /Error:\s*(.+)/gi;
const errorLinePattern = /Error:\s*(.+)/i;
const convergencePatternMatchers = [
  /diverg/i,
  /oscillat/i,
  /plateau/i,
  /stagnat/i,
  /converg/i,
  /reverse flow/i,
  /backflow/i,
  /residual plateau/i,
  /below configured target/i
];

function parseNumericValue(rawValue: string): number | null {
  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyResidualSeverity(value: number | null): SeverityLevel {
  if (value === null) return "medium";
  if (value > 1e-1) return "critical";
  if (value > 1e-2) return "high";
  if (value > 1e-3) return "medium";
  return "low";
}

function inferTrend(samples: ResidualSample[]): ResidualSeries["trend"] {
  const numericSamples = samples.map((sample) => sample.value).filter((value): value is number => value !== null);
  if (numericSamples.length < 2) return "unknown";
  const first = numericSamples[0];
  const last = numericSamples.at(-1) ?? first;
  if (last < first * 0.9) return "improving";
  if (last > first * 1.1) return "worsening";
  return "flat";
}

function extractIterationNumber(line: string): number | null {
  for (const pattern of iterationPatterns) {
    const match = line.match(pattern);
    if (match?.[1]) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function buildResidualSeriesMap(lines: string[]): Map<string, ResidualSeries> {
  const seriesMap = new Map<string, ResidualSeries>();
  let currentIteration: number | null = null;

  for (const line of lines) {
    const nextIteration = extractIterationNumber(line);
    if (nextIteration !== null) {
      currentIteration = nextIteration;
    }

    for (const match of line.matchAll(residualPattern)) {
      const metric = match[1].trim();
      const rawValue = match[2];
      const parsedValue = parseNumericValue(rawValue);
      const existing = seriesMap.get(metric);

      const sample: ResidualSample = {
        step: currentIteration,
        value: parsedValue,
        rawValue
      };

      if (existing) {
        existing.samples.push(sample);
        existing.lastValue = parsedValue;
      } else {
        seriesMap.set(metric, {
          id: `residual_${metric.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
          metric,
          samples: [sample],
          lastValue: parsedValue,
          trend: "unknown"
        });
      }
    }
  }

  for (const series of seriesMap.values()) {
    series.trend = inferTrend(series.samples);
  }

  return seriesMap;
}

function buildCflSeries(lines: string[]): NumericSeries | null {
  const samples: ResidualSample[] = [];
  let currentIteration: number | null = null;

  for (const line of lines) {
    const nextIteration = extractIterationNumber(line);
    if (nextIteration !== null) {
      currentIteration = nextIteration;
    }

    for (const pattern of cflPatterns) {
      const match = line.match(pattern);
      if (match?.[1]) {
        const rawValue = match[1];
        samples.push({
          step: currentIteration,
          value: parseNumericValue(rawValue),
          rawValue
        });
        break;
      }
    }
  }

  if (samples.length === 0) {
    return null;
  }

  return {
    id: "cfl",
    metric: "CFL",
    samples,
    lastValue: samples.at(-1)?.value ?? null
  };
}

function extractConvergencePatterns(lines: string[]): string[] {
  const patterns = new Set<string>();

  for (const line of lines) {
    for (const matcher of convergencePatternMatchers) {
      if (matcher.test(line)) {
        patterns.add(line.trim());
        break;
      }
    }
  }

  return [...patterns];
}

function extractSolverMessages(lines: string[]): string[] {
  return lines
    .filter((line) => {
      const normalized = line.trim();
      return (
        normalized.length > 0 &&
        !residualLinePattern.test(normalized) &&
        !warningLinePattern.test(normalized) &&
        !errorLinePattern.test(normalized)
      );
    })
    .slice(0, 20)
    .map((line) => line.trim());
}

function determineStatus(
  warnings: string[],
  errors: string[],
  residualSeries: ResidualSeries[],
  convergencePatterns: string[]
): ParsedLogData["status"] {
  if (errors.length > 0 || convergencePatterns.some((pattern) => /diverg/i.test(pattern))) {
    return "failed";
  }

  const unstableResidual = residualSeries.some((series) => {
    const lastValue = series.lastValue;
    return lastValue !== null && lastValue > 1e-2;
  });

  if (warnings.length > 0 || unstableResidual) {
    return "unstable";
  }

  if (residualSeries.length > 0) {
    return "completed";
  }

  return "unknown";
}

function toMissingFields(parsedLogData: Omit<ParsedLogData, "missingFields">): string[] {
  const missing: string[] = [];
  if (parsedLogData.iterationNumbers.length === 0) missing.push("iterationNumbers");
  if (parsedLogData.cflSeries === null) missing.push("cflValues");
  if (parsedLogData.residualSeries.length === 0) missing.push("residualValues");
  if (parsedLogData.warnings.length === 0) missing.push("warnings");
  if (parsedLogData.convergencePatterns.length === 0) missing.push("convergencePatterns");
  return missing;
}

export function parseLogToStructuredData(content: string): ParsedLogData {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const warnings = [...content.matchAll(warningPattern)].map((match) => match[1].trim());
  const errors = [...content.matchAll(errorPattern)].map((match) => match[1].trim());
  const residualSeries = [...buildResidualSeriesMap(lines).values()];
  const cflSeries = buildCflSeries(lines);
  const iterationNumbers = lines
    .map((line) => extractIterationNumber(line))
    .filter((value): value is number => value !== null);
  const convergencePatterns = extractConvergencePatterns(lines);

  const parsedWithoutMissing: Omit<ParsedLogData, "missingFields"> = {
    parsedAt: new Date().toISOString(),
    parserVersion: "generic-v1",
    sourceFormat: residualSeries.length > 0 || warnings.length > 0 || errors.length > 0 ? "generic-v1" : "unknown",
    status: determineStatus(warnings, errors, residualSeries, convergencePatterns),
    rawLineCount: lines.length,
    iterationNumbers,
    lastIteration: iterationNumbers.at(-1) ?? null,
    timestepCount: iterationNumbers.length,
    cflSeries,
    warnings,
    errors,
    solverMessages: extractSolverMessages(lines),
    convergencePatterns,
    residualSeries
  };

  return {
    ...parsedWithoutMissing,
    missingFields: toMissingFields(parsedWithoutMissing)
  };
}

export function parseSolverLog(content: string): ParsedSolverLog {
  const parsed = parseLogToStructuredData(content);

  const residualSignals: ParsedSolverSignal[] = parsed.residualSeries.map((series) => ({
    label: series.metric,
    value: series.lastValue !== null ? String(series.lastValue) : "missing",
    severity: classifyResidualSeverity(series.lastValue),
    evidence:
      series.lastValue !== null
        ? `${series.metric} residual observed at ${series.lastValue}`
        : `${series.metric} residual referenced but value was not parseable`
  }));

  return {
    runStatus: parsed.status,
    residualSignals,
    warnings: parsed.warnings,
    errors: parsed.errors,
    timestepsObserved: parsed.lastIteration ?? 0
  };
}
