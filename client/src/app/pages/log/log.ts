import { Component, OnInit, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FeedingService } from '../../services/feeding.service';
import { FeedingEntry } from '../../models/feeding-entry.model';
import { FeedingForm } from '../../components/feeding-form/feeding-form';
import { FeedingList } from '../../components/feeding-list/feeding-list';

interface DateGroup {
  date: string;
  entries: FeedingEntry[];
  totalFeedings: number;
  totalMilk: number;
  solidFeeds: number;
}

@Component({
  selector: 'app-log',
  imports: [CommonModule, FeedingForm, FeedingList],
  templateUrl: './log.html',
  styleUrl: './log.scss',
})
export class Log implements OnInit {
  private feedingService = inject(FeedingService);
  private destroyRef = inject(DestroyRef);

  private readonly PAGE_SIZE = 100;

  // The recent window comes live from entries$; older history is paged in on
  // demand. The two are disjoint by timestamp (window is >= windowStart,
  // older is < windowStart), so combining them never duplicates a row.
  private recentEntries = signal<FeedingEntry[]>([]);
  private olderEntries = signal<FeedingEntry[]>([]);
  private olderOffset = 0;

  protected editingEntry = signal<FeedingEntry | undefined>(undefined);
  protected hasMoreOlder = signal<boolean>(false);
  protected loadingOlder = signal<boolean>(false);

  protected dateGroups = computed<DateGroup[]>(() =>
    this.groupByDate([...this.recentEntries(), ...this.olderEntries()])
  );

  ngOnInit(): void {
    this.feedingService.entries$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(list => this.recentEntries.set(list));

    // Pull the first page of pre-window history so the log shows more than the
    // recent window; further pages load on demand via the "Load older" button.
    this.loadOlder();
  }

  protected async loadOlder(): Promise<void> {
    if (this.loadingOlder()) return;
    this.loadingOlder.set(true);
    const page = await this.feedingService.loadOlderEntries(this.olderOffset, this.PAGE_SIZE);
    if (page.length > 0) {
      this.olderEntries.set([...this.olderEntries(), ...page]);
      this.olderOffset += page.length;
    }
    this.hasMoreOlder.set(page.length === this.PAGE_SIZE);
    this.loadingOlder.set(false);
  }

  protected async onSubmit(formData: { date: string; time: string; amount: number; name?: string; spoons?: number; comment?: string }): Promise<void> {
    const editing = this.editingEntry();
    if (editing) {
      await this.feedingService.updateEntry(editing.id, formData);
      this.reconcileOlderAfterEdit(editing.id, formData);
    } else {
      // New entries are timestamped "now", so they land in the recent window
      // and surface through the entries$ subscription automatically.
      await this.feedingService.createEntry({ ...formData, type: 'milk' });
    }
    this.editingEntry.set(undefined);
  }

  protected onEdit(entry: FeedingEntry): void {
    this.editingEntry.set(entry);
  }

  protected onCancelEdit(): void {
    this.editingEntry.set(undefined);
  }

  protected async onDelete(id: string): Promise<void> {
    await this.feedingService.deleteEntry(id);
    // Recent-window rows drop via entries$; older rows we remove locally.
    const older = this.olderEntries();
    if (older.some(e => e.id === id)) {
      this.olderEntries.set(older.filter(e => e.id !== id));
    }
  }

  /**
   * Keep the older-history store consistent after an edit. Recent-window edits
   * flow through entries$, so this only handles rows in the older store —
   * including the rare case where an edit moves a row into the recent window.
   */
  private reconcileOlderAfterEdit(
    id: string,
    formData: { date: string; time: string; amount: number; name?: string; spoons?: number; comment?: string }
  ): void {
    const older = this.olderEntries();
    const idx = older.findIndex(e => e.id === id);
    if (idx === -1) return; // was a recent entry

    const merged: FeedingEntry = { ...older[idx], ...formData };
    merged.timestamp = new Date(`${merged.date}T${merged.time}`).getTime();

    if (merged.timestamp >= this.feedingService.getWindowStart()) {
      // Crossed into the recent window: drop it here and refresh the window.
      this.olderEntries.set(older.filter(e => e.id !== id));
      this.feedingService.reload();
    } else {
      const next = [...older];
      next[idx] = merged;
      this.olderEntries.set(next);
    }
  }

  private groupByDate(entries: FeedingEntry[]): DateGroup[] {
    const byDate = new Map<string, FeedingEntry[]>();
    for (const e of entries) {
      const arr = byDate.get(e.date);
      if (arr) {
        arr.push(e);
      } else {
        byDate.set(e.date, [e]);
      }
    }

    return Array.from(byDate.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, list]) => {
        const sorted = [...list].sort((a, b) => b.time.localeCompare(a.time));
        const milkEntries = sorted.filter(e => e.type !== 'solid');
        const solidEntries = sorted.filter(e => e.type === 'solid');
        return {
          date,
          entries: sorted,
          totalFeedings: sorted.length,
          totalMilk: milkEntries.reduce((sum, e) => sum + e.amount, 0),
          solidFeeds: solidEntries.length,
        };
      });
  }

  protected formatDate(dateString: string): string {
    // Create dates and normalize to local midnight for comparison
    const inputDate = new Date(dateString + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Normalize input date to midnight for fair comparison
    inputDate.setHours(0, 0, 0, 0);

    // Compare timestamps
    if (inputDate.getTime() === today.getTime()) {
      return 'Today';
    } else if (inputDate.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    } else {
      return inputDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    }
  }

  protected formatDateBadge(dateString: string): string {
    // Format date as DD.MM.YYYY
    const date = new Date(dateString + 'T00:00:00');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }
}
