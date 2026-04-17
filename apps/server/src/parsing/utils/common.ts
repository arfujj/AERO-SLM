import type {
  NumericSeries,
  ParsedCflEntry,
  ParsedLogData,
  ParsedResidualEntry,
  ResidualSample,
  ResidualSeries
} from "@aeroslm/shared";

export const convergencePatternMatchers = [
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

export function parseNumericValue(rawValue: string): number | null {
  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

export function inferTrend(samples: ResidualSample[]): ResidualSeries["trend"] {
  const numericSamples = samples
    .map((sample) => sample.value)
    .filter((value): value is number => value !== null);

  if (numericSamples.length < 2) return "unknown";

  const first = numericSamples[0];
  const last = numericSamples.at(-1) ?? first;

  if (last < first * 0.9) return "improving";
  if (last > first * 1.1) return "worsening";
  return "flat";
}

export function buildResidualSeries(entries: ParsedResidualEntry[]): ResidualSeries[] {
  const seriesMap = new Map<string, ResidualSeries>();

  for (const entry of entries) {
    const existing = seriesMap.get(entry.field) ?? {
      id: `residual_${entry.field.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      metric: entry.field,
      samples: [],
      lastValue: null,
      trend: "unknown" as const
    };

    existing.samples.push({
      step: entry.iteration,
      value: entry.value,
      rawValue: entry.rawValue
    });
    existing.lastValue = entry.value;
    seriesMap.set(entry.field, existing);
  }

  return Array.from(seriesMap.values()).map((series) => ({
    ...series,
    trend: inferTrend(series.samples)
  }));
}

export function buildCflSeries(entries: ParsedCflEntry[]): NumericSeries | null {
  if (entries.length === 0) return null;

  return {
    id: "cfl",
    metric: "CFL",
    samples: entries.map((entry) => ({
      step: entry.iteration,
      value: entry.value,
      rawValue: entry.rawValue
    })),
    lastValue: entries.at(-1)?.value ?? null
  };
}

export function extractConvergencePatterns(lines: string[]): string[] {
  const patterns = new Set<string>();

  for (const line of lines) {
    const normalized = line.trim();
    if (!normalized) continue;

    for (const matcher of convergencePatternMatchers) {
      if (matcher.test(normalized)) {
        patterns.add(normalized);
        break;
      }
    }
  }

  return [...patterns];
}

export function determineLegacyStatus(input: {
  errors: string[];
  fatalMessages: string[];
  warnings: string[];
  residualSeries: ResidualSeries[];
  convergencePatterns: string[];
}): ParsedLogData["status"] {
  if (
    input.errors.length > 0 ||
    input.fatalMessages.length > 0 ||
    input.convergencePatterns.some((pattern) => /diverg/i.test(pattern))
  ) {
    return "failed";
  }

  const unstableResidual = input.residualSeries.some((series) => {
    const lastValue = series.lastValue;
    return lastValue !== null && lastValue > 1e-2;
  });

  if (input.warnings.length > 0 || unstableResidual) {
    return "unstable";
  }

  if (input.residualSeries.length > 0) {
    return "completed";
  }

  return "unknown";
}

export function toMissingFields(input: {
  iterations: number[];
  cflEntries: ParsedCflEntry[];
  residualEntries: ParsedResidualEntry[];
  warnings: string[];
  errors: string[];
  fatalMessages: string[];
  notices: string[];
  metadata: Record<string, string>;
}): string[] {
  const missing: string[] = [];

  if (input.iterations.length === 0) missing.push("iterations");
  if (input.residualEntries.length === 0) missing.push("residualEntries");
  if (input.cflEntries.length === 0) missing.push("cflEntries");
  if (input.warnings.length === 0) missing.push("warnings");
  if (input.errors.length === 0) missing.push("errors");
  if (input.fatalMessages.length === 0) missing.push("fatalMessages");
  if (input.notices.length === 0) missing.push("notices");
  if (Object.keys(input.metadata).length === 0) missing.push("metadata");

  return missing;
}
