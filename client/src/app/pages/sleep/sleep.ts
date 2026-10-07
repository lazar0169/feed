import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { SleepService } from '../../services/sleep.service';
import { AuthService } from '../../services/auth.service';
import { SleepKind, SleepSession, SleepSessionInput } from '../../models/sleep-session.model';
import { SleepForm } from '../../components/sleep-form/sleep-form';
import { SleepEvent } from '../../components/sleep-event/sleep-event';
import { formatDuration } from '../../utils/duration';
import { buildTimeline } from '../../utils/timeline';
import { formatDateBadge, formatDayLabel, localMidnightDaysAgo } from '../../utils/day-label';

@Component({
  selector: 'app-sleep',
  imports: [SleepForm, SleepEvent],
  templateUrl: './sleep.html',
  styleUrl: './sleep.scss',
})
export class Sleep implements OnInit {
  private sleepService = inject(SleepService);
  private authService = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  protected readonly PAGE_DAYS = 30;
  protected readonly formatDuration = formatDuration;
  protected readonly formatDate = formatDayLabel;
  protected readonly formatDateBadge = formatDateBadge;

  // Ticks so live durations (asleep for / awake for, day totals) stay fresh.
  protected now = signal(Date.now());

  protected isLoading = this.sleepService.isLoading;
  protected activeSession = this.sleepService.activeSession;
  protected startKind = signal<SleepKind>(this.guessKind());
  protected isBusy = signal(false);

  protected showFormModal = signal(false);
  protected editingSession = signal<SleepSession | undefined>(undefined);
  protected formError = signal<string | null>(null);

  // Events before this are hidden; "Load older" moves it back PAGE_DAYS.
  // Starts inside the service's in-memory window, so nothing is fetched
  // until the user asks for older history.
  private historyStart = signal(localMidnightDaysAgo(this.PAGE_DAYS - 1));

  // Sessions older than the service's window. Live sessions are passed to the
  // timeline first, so they win if a session is in both.
  private olderSleeps = signal<SleepSession[]>([]);
  private earliestAt = signal<number | null>(null);
  protected loadingOlder = signal(false);

  protected days = computed(() =>
    buildTimeline([], [...this.sleepService.sessions(), ...this.olderSleeps()], {
      since: this.historyStart(),
      now: this.now(),
    }),
  );

  protected hasMoreOlder = computed(() => {
    const earliest = this.earliestAt();
    return earliest !== null && earliest < this.historyStart();
  });

  /** Live "asleep for" / "awake for" duration; null when there's no history. */
  protected statusMs = computed(() => {
    const now = this.now();
    const active = this.activeSession();
    if (active) return now - active.startAt;
    this.sleepService.sessions(); // re-run when sessions change
    const lastWake = this.sleepService.getLastWakeAt();
    return lastWake !== null ? now - lastWake : null;
  });

  /** End may be left open unless a different session is already in progress. */
  protected allowOpenEnd = computed(() => {
    const active = this.activeSession();
    return !active || active.id === this.editingSession()?.id;
  });

  constructor() {
    effect(() => {
      if (this.authService.currentUser()) this.loadEarliest();
    });
  }

  ngOnInit(): void {
    interval(30000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));
  }

  protected async toggleSleep(): Promise<void> {
    if (this.isBusy()) return;
    this.isBusy.set(true);
    try {
      if (this.activeSession()) {
        await this.sleepService.stopSleep();
        this.startKind.set(this.guessKind());
      } else {
        await this.sleepService.startSleep(this.startKind());
      }
      this.now.set(Date.now());
    } finally {
      this.isBusy.set(false);
    }
  }

  protected async loadOlder(): Promise<void> {
    if (this.loadingOlder()) return;
    this.loadingOlder.set(true);

    const to = this.historyStart();
    const fromDate = new Date(to);
    fromDate.setDate(fromDate.getDate() - this.PAGE_DAYS);
    const from = fromDate.getTime();

    // Only fetch what the service doesn't already hold in memory.
    const sleeps = await this.sleepService.loadSessionsRange(
      from,
      Math.min(to, this.sleepService.getWindowStart()),
    );
    this.olderSleeps.update((list) => [...list, ...sleeps]);
    this.historyStart.set(from);
    this.loadingOlder.set(false);
  }

  protected openAdd(): void {
    this.editingSession.set(undefined);
    this.formError.set(null);
    this.showFormModal.set(true);
  }

  protected onEdit(session: SleepSession): void {
    this.editingSession.set(session);
    this.formError.set(null);
    this.showFormModal.set(true);
  }

  protected closeFormModal(): void {
    this.showFormModal.set(false);
    this.editingSession.set(undefined);
    this.formError.set(null);
  }

  protected async onSubmit(input: SleepSessionInput): Promise<void> {
    const editing = this.editingSession();
    const overlap = this.sleepService.findOverlap(
      input.startAt,
      input.endAt,
      editing?.id,
      this.olderSleeps(),
    );
    if (overlap) {
      const end = overlap.endAt !== null ? this.formatClock(overlap.endAt) : 'now';
      const what = overlap.kind === 'night' ? 'night sleep' : 'nap';
      this.formError.set(`Overlaps with ${what} ${this.formatClock(overlap.startAt)}–${end}.`);
      return;
    }

    const ok = editing
      ? await this.sleepService.updateSession(editing.id, input)
      : !!(await this.sleepService.createSession(input));

    if (!ok) {
      this.formError.set("Couldn't save. Please try again.");
      return;
    }
    if (editing) {
      this.olderSleeps.update((list) =>
        list.map((s) => (s.id === editing.id ? { ...input, id: editing.id } : s)),
      );
    }
    this.closeFormModal();
    this.now.set(Date.now());
  }

  /** SleepEvent has already asked for confirmation. */
  protected async onDelete(id: string): Promise<void> {
    await this.sleepService.deleteSession(id);
    this.olderSleeps.update((list) => list.filter((s) => s.id !== id));
  }

  protected formatClock(ms: number): string {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  private async loadEarliest(): Promise<void> {
    this.earliestAt.set(await this.sleepService.getEarliestStart());
  }

  /** Evenings and early mornings default to night sleep. */
  private guessKind(): SleepKind {
    const hour = new Date().getHours();
    return hour >= 19 || hour < 6 ? 'night' : 'nap';
  }
}
