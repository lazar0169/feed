import { FeedingEntry } from '../models/feeding-entry.model';
import { SleepSession } from '../models/sleep-session.model';

/**
 * One row in a day list. A sleep session becomes two events so a session
 * crossing midnight splits naturally across days.
 */
export type TimelineItem =
  | { kind: 'feed'; key: string; at: number; entry: FeedingEntry }
  | {
      kind: 'sleep-start';
      key: string;
      at: number;
      session: SleepSession;
      awakeBeforeMs: number | null; // since the previous session ended
    }
  | { kind: 'sleep-end'; key: string; at: number; session: SleepSession };

export interface TimelineDay {
  date: string; // YYYY-MM-DD, local
  items: TimelineItem[]; // newest first
  milkMl: number;
  solidFeeds: number;
  sleepMs: number; // whole sessions belonging to this day, see sleepDayKey
  naps: number;
}

export interface TimelineOptions {
  since: number; // events before this are dropped
  now: number; // end of in-progress sessions
}

/** Local YYYY-MM-DD, matching how feeding entries store `date`. */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The day a session's sleep counts toward. A night started after noon belongs
 * to the next morning, so a night split by wakings before midnight stays whole.
 */
export function sleepDayKey(session: SleepSession): string {
  const start = new Date(session.startAt);
  if (session.kind === 'night' && start.getHours() >= 12) {
    start.setDate(start.getDate() + 1);
  }
  return localDateKey(start.getTime());
}

/** Duplicates (same id) keep the first occurrence, so pass live data first. */
export function buildTimeline(
  feeds: FeedingEntry[],
  sessions: SleepSession[],
  { since, now }: TimelineOptions,
): TimelineDay[] {
  const uniqueFeeds = dedupe(feeds).filter((f) => f.timestamp >= since);
  const uniqueSessions = dedupe(sessions).sort((a, b) => a.startAt - b.startAt);

  const days = new Map<string, TimelineDay>();
  const day = (date: string) => {
    let d = days.get(date);
    if (!d) {
      d = { date, items: [], milkMl: 0, solidFeeds: 0, sleepMs: 0, naps: 0 };
      days.set(date, d);
    }
    return d;
  };

  for (const entry of uniqueFeeds) {
    const d = day(entry.date);
    if (entry.type === 'solid') d.solidFeeds++;
    else d.milkMl += entry.amount || 0;
    d.items.push({ kind: 'feed', key: `feed:${entry.id}`, at: entry.timestamp, entry });
  }

  uniqueSessions.forEach((session, i) => {
    const prevEnd = i > 0 ? uniqueSessions[i - 1].endAt : null;
    const events: TimelineItem[] = [
      {
        kind: 'sleep-start',
        key: `sleep:${session.id}:start`,
        at: session.startAt,
        session,
        awakeBeforeMs: prevEnd !== null ? Math.max(0, session.startAt - prevEnd) : null,
      },
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
      if (event.at >= since) day(localDateKey(event.at)).items.push(event);
    }
  });

  // Totals only land on days that already have rows; an empty group for a
  // night still in progress past midnight would look broken.
  for (const session of uniqueSessions) {
    const d = days.get(sleepDayKey(session));
    if (!d) continue;
    d.sleepMs += (session.endAt ?? now) - session.startAt;
    if (session.kind === 'nap') d.naps++;
  }

  return Array.from(days.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((d) => ({ ...d, items: d.items.sort((a, b) => b.at - a.at) }));
}

function dedupe<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.id) && !!seen.add(r.id));
}
