import type { ValidationFlag } from "@aeroslm/shared";

export function formatTimestamp(value?: string): string {
  if (!value) return "Unavailable";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function toTitleCase(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function confidenceLevel(value: number): "low" | "medium" | "high" {
  if (value >= 0.75) return "high";
  if (value >= 0.45) return "medium";
  return "low";
}

export function summarizeValidationFlags(flags: ValidationFlag[]) {
  return {
    critical: flags.filter((flag) => flag.severity === "critical").length,
    caution: flags.filter((flag) => flag.severity === "caution").length,
    info: flags.filter((flag) => flag.severity === "info").length
  };
}
