import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { FeedingService } from '../../services/feeding.service';
import { SleepService } from '../../services/sleep.service';
import { AuthService } from '../../services/auth.service';
import { FeedingEntry } from '../../models/feeding-entry.model';
import { SleepSession, SleepSessionInput } from '../../models/sleep-session.model';
import { FeedingForm } from '../../components/feeding-form/feeding-form';
import { FeedingList } from '../../components/feeding-list/feeding-list';
import { SleepForm } from '../../components/sleep-form/sleep-form';
import { SleepEvent } from '../../components/sleep-event/sleep-event';
import { formatDuration } from '../../utils/duration';
import { LogFilter, buildTimeline } from '../../utils/timeline';

type FeedFormData = {
  date: string;
  time: string;
  amount: number;
  name?: string;
  spoons?: number;
  comment?: string;
};

@Component({
  selector: 'app-log',
  imports: [FeedingForm, FeedingList, SleepForm, SleepEvent],
  templateUrl: './log.html',
  styleUrl: './log.scss',
})
export class Log implements OnInit {
  private feedingService = inject(FeedingService);
  private sleepService = inject(SleepService);
  private authService = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  protected readonly PAGE_DAYS = 30;
  protected readonly formatDuration = formatDuration;

  protected filter = signal<LogFilter>('all');
  private now = signal(Date.now());

  // Events before this are hidden; "Load older" moves it back PAGE_DAYS.
  // Starts inside both services' in-memory windows, so nothing is fetched
  // until the user asks for older history.
  private historyStart = signal(this.daysAgo(this.PAGE_DAYS - 1));

  // Rows older than the services' windows. Live rows are passed to the
  // timeline first, so they win if a row is in both.
  private olderFeeds = signal<FeedingEntry[]>([]);
  private olderSleeps = signal<SleepSession[]>([]);
  private earliestAt = signal<number | null>(null);

  protected loadingOlder = signal(false);
  protected editingEntry = signal<FeedingEntry | undefined>(undefined);
  protected editingSession = signal<SleepSession | undefined>(undefined);
  protected sleepFormError = signal<string | null>(null);

  protected days = computed(() =>
    buildTimeline(
      [...this.feedingService.entries(), ...this.olderFeeds()],
      [...this.sleepService.sessions(), ...this.olderSleeps()],
      { since: this.historyStart(), now: this.now(), filter: this.filter() },
    ),
  );

  protected hasMoreOlder = computed(() => {
    const earliest = this.earliestAt();
    return earliest !== null && earliest < this.historyStart();
  });

  protected allowOpenEnd = computed(() => {
    const active = this.sleepService.activeSession();
    return !active || active.id === this.editingSession()?.id;
  });

  constructor() {
    effect(() => {
      if (this.authService.currentUser()) this.loadEarliest();
    });
  }

  ngOnInit(): void {
    // Keeps "sleeping now" day totals current.
    interval(60000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));
  }

  protected async loadOlder(): Promise<void> {
    if (this.loadingOlder()) return;
    this.loadingOlder.set(true);

    const to = this.historyStart();
    const fromDate = new Date(to);
    fromDate.setDate(fromDate.getDate() - this.PAGE_DAYS);
    const from = fromDate.getTime();

    // Only fetch what the services don't already hold in memory.
    const [feeds, sleeps] = await Promise.all([
      this.feedingService.loadEntriesRange(
        from,
        Math.min(to, this.feedingService.getWindowStart()),
      ),
      this.sleepService.loadSessionsRange(from, Math.min(to, this.sleepService.getWindowStart())),
    ]);
    this.olderFeeds.update((list) => [...list, ...feeds]);
    this.olderSleeps.update((list) => [...list, ...sleeps]);
    this.historyStart.set(from);
    this.loadingOlder.set(false);
  }

  // ---- Feeds ----

  protected onEditFeed(entry: FeedingEntry): void {
    this.editingEntry.set(entry);
  }

  protected closeFeedForm(): void {
    this.editingEntry.set(undefined);
  }

  protected async onFeedSubmit(formData: FeedFormData): Promise<void> {
    const editing = this.editingEntry();
    if (!editing) return;
    await this.feedingService.updateEntry(editing.id, formData);
    this.reconcileOlderFeed(editing.id, formData);
    this.editingEntry.set(undefined);
  }

  protected async onDeleteFeed(id: string): Promise<void> {
    await this.feedingService.deleteEntry(id);
    this.olderFeeds.update((list) => list.filter((e) => e.id !== id));
  }

  /**
   * Recent-window edits flow through the service; this only patches rows in
   * the older store, including the rare edit that moves one into the window.
   */
  private reconcileOlderFeed(id: string, formData: FeedFormData): void {
    const older = this.olderFeeds();
    const idx = older.findIndex((e) => e.id === id);
    if (idx === -1) return;

    const merged: FeedingEntry = { ...older[idx], ...formData };
    merged.timestamp = new Date(`${merged.date}T${merged.time}`).getTime();

    if (merged.timestamp >= this.feedingService.getWindowStart()) {
      this.olderFeeds.set(older.filter((e) => e.id !== id));
      this.feedingService.reload();
    } else {
      this.olderFeeds.set(older.map((e) => (e.id === id ? merged : e)));
    }
  }

  // ---- Sleep ----

  protected onEditSleep(session: SleepSession): void {
    this.sleepFormError.set(null);
    this.editingSession.set(session);
  }

  protected closeSleepForm(): void {
    this.editingSession.set(undefined);
    this.sleepFormError.set(null);
  }

  protected async onSleepSubmit(input: SleepSessionInput): Promise<void> {
    const editing = this.editingSession();
    if (!editing) return;

    const overlap = this.sleepService.findOverlap(
      input.startAt,
      input.endAt,
      editing.id,
      this.olderSleeps(),
    );
    if (overlap) {
      const end = overlap.endAt !== null ? this.formatClock(overlap.endAt) : 'now';
      const what = overlap.kind === 'night' ? 'night sleep' : 'nap';
      this.sleepFormError.set(`Overlaps with ${what} ${this.formatClock(overlap.startAt)}–${end}.`);
      return;
    }

    if (!(await this.sleepService.updateSession(editing.id, input))) {
      this.sleepFormError.set("Couldn't save. Please try again.");
      return;
    }
    this.olderSleeps.update((list) =>
      list.map((s) => (s.id === editing.id ? { ...input, id: editing.id } : s)),
    );
    this.closeSleepForm();
  }

  protected async onDeleteSleep(id: string): Promise<void> {
    await this.sleepService.deleteSession(id);
    this.olderSleeps.update((list) => list.filter((s) => s.id !== id));
  }

  // ---- Formatting ----

  protected formatDate(dateString: string): string {
    const date = new Date(`${dateString}T00:00:00`).getTime();
    if (date === this.daysAgo(0)) return 'Today';
    if (date === this.daysAgo(1)) return 'Yesterday';
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  protected formatDateBadge(dateString: string): string {
    const [year, month, day] = dateString.split('-');
    return `${day}.${month}.${year}`;
  }

  private formatClock(ms: number): string {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /** Local midnight `n` days before today. */
  private daysAgo(n: number): number {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.getTime();
  }

  private async loadEarliest(): Promise<void> {
    const results = await Promise.all([
      this.feedingService.getEarliestTimestamp(),
      this.sleepService.getEarliestStart(),
    ]);
    const known = results.filter((t): t is number => t !== null);
    this.earliestAt.set(known.length > 0 ? Math.min(...known) : null);
  }
}
