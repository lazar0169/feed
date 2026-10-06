import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Log } from './log';
import { FeedingService } from '../../services/feeding.service';
import { SleepService } from '../../services/sleep.service';
import { AuthService } from '../../services/auth.service';
import { FeedingEntry } from '../../models/feeding-entry.model';
import { SleepSession } from '../../models/sleep-session.model';
import { localDateKey } from '../../utils/timeline';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('Log', () => {
  let fixture: ComponentFixture<Log>;
  let feeding: Record<string, ReturnType<typeof vi.fn> | unknown>;
  let sleep: Record<string, ReturnType<typeof vi.fn> | unknown>;

  // Times relative to today's local midnight so "Today"/history math holds.
  const midnight = new Date().setHours(0, 0, 0, 0);
  const feedAt = (ms: number, id: string): FeedingEntry => ({
    id,
    type: 'milk',
    date: localDateKey(ms),
    time: new Date(ms).toTimeString().slice(0, 5),
    amount: 100,
    timestamp: ms,
  });

  async function render(earliest: number | null): Promise<HTMLElement> {
    const nap: SleepSession = {
      id: 'nap',
      kind: 'nap',
      startAt: midnight - 3 * HOUR,
      endAt: midnight - 2 * HOUR,
    };
    feeding = {
      entries: signal([feedAt(midnight - 1 * HOUR, 'late'), feedAt(midnight - 4 * HOUR, 'early')]),
      getWindowStart: () => midnight - 90 * DAY,
      getEarliestTimestamp: vi.fn(async () => earliest),
      loadEntriesRange: vi.fn(async () => []),
    };
    sleep = {
      sessions: signal([nap]),
      activeSession: signal(null),
      getWindowStart: () => midnight - 30 * DAY,
      getEarliestStart: vi.fn(async () => null),
      loadSessionsRange: vi.fn(async () => []),
    };

    TestBed.configureTestingModule({
      imports: [Log],
      providers: [
        { provide: FeedingService, useValue: feeding },
        { provide: SleepService, useValue: sleep },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'u' }) } },
      ],
    });
    fixture = TestBed.createComponent(Log);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const rowTypes = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.day-items > *')).map((row) =>
      row.tagName === 'APP-FEEDING-LIST'
        ? 'feed'
        : (row.querySelector('.label')?.textContent?.trim() ?? ''),
    );

  it('interleaves feeds and sleep events newest first', async () => {
    const el = await render(null);
    expect(rowTypes(el)).toEqual(['feed', 'Woke up', 'Nap', 'feed']);
  });

  it('filters to sleep only', async () => {
    const el = await render(null);
    (el.querySelectorAll('.filter-chips button')[2] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(rowTypes(el)).toEqual(['Woke up', 'Nap']);
  });

  it('offers older history only when there is some, and loads both kinds', async () => {
    expect((await render(midnight - 5 * DAY)).querySelector('.btn-load-more')).toBeNull();

    TestBed.resetTestingModule();
    const el = await render(midnight - 200 * DAY);
    (el.querySelector('.btn-load-more') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(feeding['loadEntriesRange']).toHaveBeenCalled();
    expect(sleep['loadSessionsRange']).toHaveBeenCalled();
  });
});
