export const currencyFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 8,
});

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
