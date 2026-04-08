interface StatusBadgeProps {
  value: string;
}

export function StatusBadge({ value }: StatusBadgeProps) {
  const normalized = value.toLowerCase();
  return <span className={`status status-${normalized}`}>{value}</span>;
}
