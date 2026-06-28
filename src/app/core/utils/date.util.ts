export function todayIso(): string {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

export function isoBounds(dateFrom: string, dateTo: string): [string | null, string | null] {
  const from = dateFrom ? `${dateFrom}T00:00:00.000Z` : null;
  const to = dateTo ? `${dateTo}T23:59:59.999Z` : null;
  return [from, to];
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
