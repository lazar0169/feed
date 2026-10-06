import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { SleepService } from '../../services/sleep.service';
import { SleepKind, SleepSession, SleepSessionInput } from '../../models/sleep-session.model';
import { SleepForm } from '../../components/sleep-form/sleep-form';

/** A session in the day list, with the awake gap that preceded it. */
interface SleepRow {
  session: SleepSession;
  wakeBeforeMs: number | null;
}

@Component({
  selector: 'app-sleep',
  imports: [SleepForm],
  templateUrl: './sleep.html',
  styleUrl: './sleep.scss',
})
export class Sleep implements OnInit {
  private sleepService = inject(SleepService);
  private destroyRef = inject(DestroyRef);

  // Ticks so live durations (asleep for / awake for) stay fresh.
  protected now = signal(Date.now());
  protected selectedDay = signal(this.sleepService.startOfDay(Date.now()));

  protected isLoading = this.sleepService.isLoading;
  protected activeSession = this.sleepService.activeSession;
  protected startKind = signal<SleepKind>(this.guessKind());
  protected isBusy = signal(false);

  protected showFormModal = signal(false);
  protected editingSession = signal<SleepSession | undefined>(undefined);
  protected formError = signal<string | null>(null);

  protected isToday = computed(
    () => this.selectedDay() === this.sleepService.startOfDay(this.now())
  );
  protected canGoBack = computed(
    () => this.selectedDay() > this.sleepService.startOfDay(this.sleepService.getWindowStart())
  );

  protected summary = computed(() =>
    this.sleepService.getDaySummary(this.selectedDay(), this.now())
  );

  /** Newest first, each with the awake time since the previous session ended. */
  protected rows = computed<SleepRow[]>(() => {
    const sessions = this.sleepService.getSessionsForDay(this.selectedDay(), this.now());
    return sessions
      .map((session, i) => {
        const prevEnd = i > 0 ? sessions[i - 1].endAt : null;
        return {
          session,
          wakeBeforeMs: prevEnd !== null ? Math.max(0, session.startAt - prevEnd) : null
        };
      })
      .reverse();
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

  protected previousDay(): void {
    if (!this.canGoBack()) return;
    const d = new Date(this.selectedDay());
    d.setDate(d.getDate() - 1);
    this.selectedDay.set(d.getTime());
  }

  protected nextDay(): void {
    if (this.isToday()) return;
    this.selectedDay.set(this.sleepService.nextDayStart(this.selectedDay()));
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
    const overlap = this.sleepService.findOverlap(input.startAt, input.endAt, editing?.id);
    if (overlap) {
      const end = overlap.endAt !== null ? this.formatClock(overlap.endAt) : 'now';
      this.formError.set(
        `Overlaps with ${overlap.kind === 'night' ? 'night sleep' : 'nap'} ${this.formatClock(overlap.startAt)}–${end}.`
      );
      return;
    }

    const ok = editing
      ? await this.sleepService.updateSession(editing.id, input)
      : !!(await this.sleepService.createSession(input));

    if (ok) {
      this.closeFormModal();
      this.now.set(Date.now());
    } else {
      this.formError.set("Couldn't save. Please try again.");
    }
  }

  protected async onDelete(id: string): Promise<void> {
    await this.sleepService.deleteSession(id);
  }

  protected formatDuration(ms: number): string {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
  }

  protected formatClock(ms: number): string {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /** Clock time, prefixed with the weekday when it falls outside the selected day. */
  protected formatEdge(ms: number): string {
    const day = this.selectedDay();
    if (ms >= day && ms < this.sleepService.nextDayStart(day)) return this.formatClock(ms);
    const weekday = new Date(ms).toLocaleDateString(undefined, { weekday: 'short' });
    return `${weekday} ${this.formatClock(ms)}`;
  }

  protected dayLabel(): string {
    if (this.isToday()) return 'Today';
    const yesterday = new Date(this.sleepService.startOfDay(this.now()));
    yesterday.setDate(yesterday.getDate() - 1);
    if (this.selectedDay() === yesterday.getTime()) return 'Yesterday';
    return new Date(this.selectedDay()).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  }

  /** Evenings and early mornings default to night sleep. */
  private guessKind(): SleepKind {
    const hour = new Date().getHours();
    return hour >= 19 || hour < 6 ? 'night' : 'nap';
  }
}
