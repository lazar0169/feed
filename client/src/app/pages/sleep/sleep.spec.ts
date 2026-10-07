import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Sleep } from './sleep';
import { SleepService } from '../../services/sleep.service';
import { AuthService } from '../../services/auth.service';
import { SleepSession } from '../../models/sleep-session.model';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('Sleep', () => {
  let fixture: ComponentFixture<Sleep>;
  let sleep: Record<string, ReturnType<typeof vi.fn> | unknown>;

  // Yesterday, so the list doesn't depend on what time the test runs.
  const midnight = new Date().setHours(0, 0, 0, 0);
  const first: SleepSession = {
    id: 'a',
    kind: 'nap',
    startAt: midnight - 14 * HOUR,
    endAt: midnight - 13 * HOUR,
  };
  const second: SleepSession = {
    id: 'b',
    kind: 'nap',
    startAt: midnight - 10 * HOUR,
    endAt: midnight - 9 * HOUR,
  };

  async function render(earliest: number | null): Promise<HTMLElement> {
    sleep = {
      sessions: signal([second, first]),
      activeSession: signal(null),
      isLoading: signal(false),
      getLastWakeAt: () => second.endAt,
      getWindowStart: () => midnight - 30 * DAY,
      getEarliestStart: vi.fn(async () => earliest),
      loadSessionsRange: vi.fn(async () => []),
    };

    TestBed.configureTestingModule({
      imports: [Sleep],
      providers: [
        { provide: SleepService, useValue: sleep },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'u' }) } },
      ],
    });
    fixture = TestBed.createComponent(Sleep);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const rows = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.day-items > *')).map((row) =>
      row.classList.contains('wake-gap')
        ? (row.textContent?.trim() ?? '')
        : (row.querySelector('.label')?.textContent?.trim() ?? ''),
    );

  it('lists sleep events newest first with the awake gap between sessions', async () => {
    const el = await render(null);
    expect(rows(el)).toEqual(['Woke up', 'Nap', 'Awake 3h 00m', 'Woke up', 'Nap']);
    expect(el.querySelector('.stat-badge')?.textContent).toContain('2h 00m');
  });

  it('offers older history only when there is some', async () => {
    expect((await render(midnight - 5 * DAY)).querySelector('.btn-load-more')).toBeNull();

    TestBed.resetTestingModule();
    const el = await render(midnight - 200 * DAY);
    (el.querySelector('.btn-load-more') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(sleep['loadSessionsRange']).toHaveBeenCalled();
  });
});
