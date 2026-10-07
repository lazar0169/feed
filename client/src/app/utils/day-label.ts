/** Local midnight `n` days before today. */
export function localMidnightDaysAgo(n: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.getTime();
}

/** 'Today', 'Yesterday', or e.g. 'Mon, Oct 5' for a YYYY-MM-DD key. */
export function formatDayLabel(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`).getTime();
  if (date === localMidnightDaysAgo(0)) return 'Today';
  if (date === localMidnightDaysAgo(1)) return 'Yesterday';
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** YYYY-MM-DD → DD.MM.YYYY */
export function formatDateBadge(dateString: string): string {
  const [year, month, day] = dateString.split('-');
  return `${day}.${month}.${year}`;
}
