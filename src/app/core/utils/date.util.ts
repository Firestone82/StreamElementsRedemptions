export function todayIso(): string {
  const now: Date = new Date();
  const tzOffsetMs: number = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

export function isoBounds(dateFrom: string, dateTo: string): [string | null, string | null] {
  const from: string | null = dateFrom ? `${dateFrom}T00:00:00.000Z` : null;
  const to: string | null = dateTo ? `${dateTo}T23:59:59.999Z` : null;
  return [from, to];
}
