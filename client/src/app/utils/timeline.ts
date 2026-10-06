import { FeedingEntry } from '../models/feeding-entry.model';
import { SleepSession } from '../models/sleep-session.model';

export type LogFilter = 'all' | 'feeds' | 'sleep';

/**
 * One row in the Log. A sleep session becomes two events so night feeds
 * land between them and a session crossing midnight splits naturally.
 */
export type TimelineItem =
  | { kind: 'feed'; key: string; at: number; entry: FeedingEntry }
  | { kind: 'sleep-start' | 'sleep-end'; key: string; at: number; session: SleepSession };

export interface TimelineDay {
  date: string; // YYYY-MM-DD, local
  items: TimelineItem[]; // newest first, after filtering
  milkMl: number;
  solidFeeds: number;
  sleepMs: number; // asleep time clipped to this day
}

export interface TimelineOptions {
  since: number; // events before this are dropped
  now: number; // end of in-progress sessions
  filter: LogFilter;
}

/** Local YYYY-MM-DD, matching how feeding entries store `date`. */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Duplicates (same id) keep the first occurrence, so pass live data first. */
export function buildTimeline(
  feeds: FeedingEntry[],
  sessions: SleepSession[],
  { since, now, filter }: TimelineOptions,
): TimelineDay[] {
  const uniqueFeeds = dedupe(feeds).filter((f) => f.timestamp >= since);
  const uniqueSessions = dedupe(sessions);

  const days = new Map<string, TimelineDay>();
  const day = (date: string) => {
    let d = days.get(date);
    if (!d) {
      d = { date, items: [], milkMl: 0, solidFeeds: 0, sleepMs: 0 };
      days.set(date, d);
    }
    return d;
  };

  for (const entry of uniqueFeeds) {
    const d = day(entry.date);
    if (entry.type === 'solid') d.solidFeeds++;
    else d.milkMl += entry.amount || 0;
    if (filter !== 'sleep') {
      d.items.push({ kind: 'feed', key: `feed:${entry.id}`, at: entry.timestamp, entry });
    }
  }

  for (const session of uniqueSessions) {
    const events: TimelineItem[] = [
      { kind: 'sleep-start', key: `sleep:${session.id}:start`, at: session.startAt, session },
    ];
    if (session.endAt !== null) {
      events.push({
        kind: 'sleep-end',
        key: `sleep:${session.id}:end`,
        at: session.endAt,
        session,
      });
    }
    for (const event of events) {
      if (event.at < since) continue;
      const d = day(localDateKey(event.at));
      if (filter !== 'feeds') d.items.push(event);
    }
  }

  for (const d of days.values()) {
    d.sleepMs = sleepWithinDay(uniqueSessions, d.date, now);
  }

  return Array.from(days.values())
    .filter((d) => d.items.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((d) => ({ ...d, items: d.items.sort((a, b) => b.at - a.at) }));
}

function sleepWithinDay(sessions: SleepSession[], date: string, now: number): number {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1); // DST-safe, unlike + 24h
  let total = 0;
  for (const s of sessions) {
    const overlap = Math.min(s.endAt ?? now, end.getTime()) - Math.max(s.startAt, start.getTime());
    if (overlap > 0) total += overlap;
  }
  return total;
}

function dedupe<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.id) && !!seen.add(r.id));
}
