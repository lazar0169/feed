import { Component, computed, effect, inject, signal } from '@angular/core';
import { FeedingService } from '../../services/feeding.service';
import { AuthService } from '../../services/auth.service';
import { FeedingEntry } from '../../models/feeding-entry.model';
import { FeedingForm } from '../../components/feeding-form/feeding-form';
import { FeedingList } from '../../components/feeding-list/feeding-list';
import { buildTimeline } from '../../utils/timeline';
import { formatDateBadge, formatDayLabel, localMidnightDaysAgo } from '../../utils/day-label';

type FeedFormData = {
  date: string;
  time: string;
  amount: number;
  name?: string;
  spoons?: number;
  comment?: string;
};

@Component({
  selector: 'app-feed',
  imports: [FeedingForm, FeedingList],
  templateUrl: './feed.html',
  styleUrl: './feed.scss',
})
export class Feed {
  private feedingService = inject(FeedingService);
  private authService = inject(AuthService);

  protected readonly PAGE_DAYS = 30;
  protected readonly formatDate = formatDayLabel;
  protected readonly formatDateBadge = formatDateBadge;

  // Entries before this are hidden; "Load older" moves it back PAGE_DAYS.
  // Starts inside the service's in-memory window, so nothing is fetched
  // until the user asks for older history.
  private historyStart = signal(localMidnightDaysAgo(this.PAGE_DAYS - 1));

  // Rows older than the service's window. Live rows are passed to the
  // timeline first, so they win if a row is in both.
  private olderFeeds = signal<FeedingEntry[]>([]);
  private earliestAt = signal<number | null>(null);

  protected loadingOlder = signal(false);
  protected editingEntry = signal<FeedingEntry | undefined>(undefined);

  protected days = computed(() =>
    buildTimeline([...this.feedingService.entries(), ...this.olderFeeds()], [], {
      since: this.historyStart(),
      now: Date.now(),
    }),
  );

  protected hasMoreOlder = computed(() => {
    const earliest = this.earliestAt();
    return earliest !== null && earliest < this.historyStart();
  });

  constructor() {
    effect(() => {
      if (this.authService.currentUser()) this.loadEarliest();
    });
  }

  protected async loadOlder(): Promise<void> {
    if (this.loadingOlder()) return;
    this.loadingOlder.set(true);

    const to = this.historyStart();
    const fromDate = new Date(to);
    fromDate.setDate(fromDate.getDate() - this.PAGE_DAYS);
    const from = fromDate.getTime();

    // Only fetch what the service doesn't already hold in memory.
    const feeds = await this.feedingService.loadEntriesRange(
      from,
      Math.min(to, this.feedingService.getWindowStart()),
    );
    this.olderFeeds.update((list) => [...list, ...feeds]);
    this.historyStart.set(from);
    this.loadingOlder.set(false);
  }

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

  private async loadEarliest(): Promise<void> {
    this.earliestAt.set(await this.feedingService.getEarliestTimestamp());
  }
}
