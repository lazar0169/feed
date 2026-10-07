import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Feed } from './feed';
import { FeedingService } from '../../services/feeding.service';
import { AuthService } from '../../services/auth.service';
import { FeedingEntry } from '../../models/feeding-entry.model';
import { localDateKey } from '../../utils/timeline';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('Feed', () => {
  let fixture: ComponentFixture<Feed>;
  let feeding: Record<string, ReturnType<typeof vi.fn> | unknown>;

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
    feeding = {
      entries: signal([feedAt(midnight - 1 * HOUR, 'late'), feedAt(midnight - 4 * HOUR, 'early')]),
      getWindowStart: () => midnight - 90 * DAY,
      getEarliestTimestamp: vi.fn(async () => earliest),
      loadEntriesRange: vi.fn(async () => []),
    };

    TestBed.configureTestingModule({
      imports: [Feed],
      providers: [
        { provide: FeedingService, useValue: feeding },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'u' }) } },
      ],
    });
    fixture = TestBed.createComponent(Feed);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists feeds grouped by day with the milk total', async () => {
    const el = await render(null);
    expect(el.querySelectorAll('.day-items > app-feeding-list')).toHaveLength(2);
    expect(el.querySelector('.stat-badge')?.textContent).toContain('200 ml');
  });

  it('offers older history only when there is some', async () => {
    expect((await render(midnight - 5 * DAY)).querySelector('.btn-load-more')).toBeNull();

    TestBed.resetTestingModule();
    const el = await render(midnight - 200 * DAY);
    (el.querySelector('.btn-load-more') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(feeding['loadEntriesRange']).toHaveBeenCalled();
  });
});
