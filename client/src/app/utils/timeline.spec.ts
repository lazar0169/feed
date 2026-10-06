import { buildTimeline, localDateKey } from './timeline';
import { FeedingEntry } from '../models/feeding-entry.model';
import { SleepSession } from '../models/sleep-session.model';

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).getTime();
const HOUR = 60 * 60 * 1000;

function feed(id: string, ms: number, amount = 120, type: 'milk' | 'solid' = 'milk'): FeedingEntry {
  const d = new Date(ms);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { id, type, date: localDateKey(ms), time, amount, timestamp: ms };
}

const night: SleepSession = { id: 'night', kind: 'night', startAt: at(5, 21), endAt: at(6, 6) };
const nap: SleepSession = { id: 'nap', kind: 'nap', startAt: at(6, 13), endAt: at(6, 14, 30) };
const feeds = [feed('f1', at(5, 20, 30), 180), feed('f2', at(6, 2, 15)), feed('f3', at(6, 7))];
const options = { since: at(1, 0), now: at(6, 20), filter: 'all' as const };

describe('buildTimeline', () => {
  it('splits a night across midnight and slots night feeds between its events', () => {
    const days = buildTimeline(feeds, [nap, night], options);

    expect(days.map((d) => d.date)).toEqual(['2026-10-06', '2026-10-05']);
    expect(days[0].items.map((i) => i.key)).toEqual([
      'sleep:nap:end',
      'sleep:nap:start',
      'feed:f3',
      'sleep:night:end',
      'feed:f2',
    ]);
    expect(days[1].items.map((i) => i.key)).toEqual(['sleep:night:start', 'feed:f1']);
  });

  it('totals milk, solids and sleep clipped to each day', () => {
    const solid = feed('s1', at(6, 12), 40, 'solid');
    const [today, yesterday] = buildTimeline([...feeds, solid], [nap, night], options);

    expect(today).toMatchObject({ milkMl: 240, solidFeeds: 1, sleepMs: 6 * HOUR + 1.5 * HOUR });
    expect(yesterday).toMatchObject({ milkMl: 180, solidFeeds: 0, sleepMs: 3 * HOUR });
  });

  it('filters rows but keeps day totals, dropping days left empty', () => {
    const onlySleepDay: SleepSession = {
      id: 'old',
      kind: 'nap',
      startAt: at(3, 10),
      endAt: at(3, 11),
    };

    const feedDays = buildTimeline(feeds, [nap, night, onlySleepDay], {
      ...options,
      filter: 'feeds',
    });
    expect(feedDays.map((d) => d.date)).toEqual(['2026-10-06', '2026-10-05']);
    expect(feedDays[0].items.every((i) => i.kind === 'feed')).toBe(true);
    expect(feedDays[0].sleepMs).toBe(7.5 * HOUR);

    const sleepDays = buildTimeline(feeds, [nap, night, onlySleepDay], {
      ...options,
      filter: 'sleep',
    });
    expect(sleepDays.map((d) => d.date)).toEqual(['2026-10-06', '2026-10-05', '2026-10-03']);
    expect(sleepDays[0].items.every((i) => i.kind !== 'feed')).toBe(true);
    expect(sleepDays[0].milkMl).toBe(240);
  });

  it('drops events before `since` but keeps a wake-up after it', () => {
    const days = buildTimeline(feeds, [night], { ...options, since: at(6, 0) });
    expect(days.map((d) => d.date)).toEqual(['2026-10-06']);
    expect(days[0].items.map((i) => i.key)).toContain('sleep:night:end');
    expect(days[0].items.map((i) => i.key)).not.toContain('sleep:night:start');
  });

  it('shows only the start of an in-progress session and counts it to now', () => {
    const ongoing: SleepSession = { id: 'x', kind: 'nap', startAt: at(6, 19), endAt: null };
    const [today] = buildTimeline([], [ongoing], options);
    expect(today.items.map((i) => i.key)).toEqual(['sleep:x:start']);
    expect(today.sleepMs).toBe(HOUR);
  });

  it('keeps the first copy of a duplicated row', () => {
    const live = feed('f3', at(6, 7), 150);
    const stale = feed('f3', at(6, 7), 90);
    const [today] = buildTimeline([live, stale], [], options);
    expect(today.items).toHaveLength(1);
    expect(today.milkMl).toBe(150);
  });
});
