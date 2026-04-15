interface StatusBadgeProps {
  value: string;
}

function humanize(value: string): string {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveStatusBadge(value: string) {
  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case "draft":
      return { tone: "neutral", label: "Draft" };
    case "queued":
      return { tone: "accent", label: "Queued" };
    case "processing":
      return { tone: "accent", label: "In progress" };
    case "completed":
      return { tone: "success", label: "Completed" };
    case "failed":
      return { tone: "danger", label: "Failed" };
    case "unknown":
      return { tone: "neutral", label: "Unknown" };
    case "critical":
      return { tone: "danger", label: "Critical" };
    case "high":
      return { tone: "warning", label: "High" };
    case "medium":
      return { tone: "warning", label: "Medium" };
    case "low":
      return { tone: "accent", label: "Low" };
    case "caution":
      return { tone: "warning", label: "Caution" };
    case "info":
      return { tone: "neutral", label: "Info" };
    case "unstable":
      return { tone: "warning", label: "Unstable" };
    case "knowledge-base":
      return { tone: "neutral", label: "Knowledge base" };
    case "solver-log":
      return { tone: "neutral", label: "Solver log" };
    default:
      return { tone: "neutral", label: humanize(value) };
  }
}

export function StatusBadge({ value }: StatusBadgeProps) {
  const resolved = resolveStatusBadge(value);

  return (
    <span className={`status status-${resolved.tone}`} title={resolved.label}>
      {resolved.label}
    </span>
  );
}
