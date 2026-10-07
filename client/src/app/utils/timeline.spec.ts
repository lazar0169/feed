import { buildTimeline, localDateKey, sleepDayKey } from './timeline';
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

const night: SleepSession = { id: 'night', kind: 'night', startAt: at(5, 19), endAt: at(6, 7) };
const nap: SleepSession = { id: 'nap', kind: 'nap', startAt: at(6, 13), endAt: at(6, 14, 30) };
const feeds = [feed('f1', at(5, 18, 30), 180), feed('f2', at(6, 2, 15)), feed('f3', at(6, 8))];
const options = { since: at(1, 0), now: at(6, 20) };

describe('sleepDayKey', () => {
  it('moves a night started after noon to the next day', () => {
    expect(sleepDayKey(night)).toBe('2026-10-06');
    expect(sleepDayKey({ ...night, startAt: at(6, 0, 30) })).toBe('2026-10-06');
  });

  it('keeps naps on the day they start, even late ones', () => {
    expect(sleepDayKey({ ...nap, startAt: at(6, 19) })).toBe('2026-10-06');
  });
});

describe('buildTimeline', () => {
  it('splits sleep events across midnight, newest first', () => {
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

  it('counts the whole night toward the morning it ends', () => {
    const solid = feed('s1', at(6, 12), 40, 'solid');
    const [today, yesterday] = buildTimeline([...feeds, solid], [nap, night], options);

    expect(today).toMatchObject({ milkMl: 240, solidFeeds: 1, sleepMs: 12 * HOUR + 1.5 * HOUR });
    expect(today.naps).toBe(1);
    expect(yesterday).toMatchObject({ milkMl: 180, sleepMs: 0, naps: 0 });
  });

  it('keeps a night split by an evening waking together', () => {
    const early: SleepSession = { id: 'e', kind: 'night', startAt: at(5, 19), endAt: at(5, 23) };
    const late: SleepSession = { id: 'l', kind: 'night', startAt: at(5, 23, 30), endAt: at(6, 6) };
    const [today, yesterday] = buildTimeline([], [early, late], options);

    expect(today.sleepMs).toBe(4 * HOUR + 6.5 * HOUR);
    expect(yesterday.sleepMs).toBe(0);
  });

  it('attaches the awake gap to each fell-asleep row', () => {
    const [today, yesterday] = buildTimeline([], [nap, night], options);
    const start = (items: typeof today.items, id: string) =>
      items.find((i) => i.key === `sleep:${id}:start`);

    expect(start(today.items, 'nap')).toMatchObject({ awakeBeforeMs: 6 * HOUR });
    expect(start(yesterday.items, 'night')).toMatchObject({ awakeBeforeMs: null });
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
