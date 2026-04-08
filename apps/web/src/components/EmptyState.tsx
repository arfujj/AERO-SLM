interface EmptyStateProps {
  message: string;
  tone?: "default" | "report";
}

export function EmptyState({ message, tone = "default" }: EmptyStateProps) {
  return <div className={tone === "report" ? "report-empty-state" : "empty-state"}>{message}</div>;
}
