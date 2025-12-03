import { Component, OnInit, signal, computed, DestroyRef, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { FeedingService } from '../../services/feeding.service';
import { NotificationService } from '../../services/notification.service';
import { SettingsService } from '../../services/settings.service';
import { FeedingEntry } from '../../models/feeding-entry.model';
import { FeedingForm } from '../../components/feeding-form/feeding-form';
import { FeedingList } from '../../components/feeding-list/feeding-list';

@Component({
  selector: 'app-today',
  imports: [CommonModule, FeedingForm, FeedingList],
  templateUrl: './today.html',
  styleUrl: './today.scss',
})
export class Today implements OnInit {
  private feedingService = inject(FeedingService);
  private notificationService = inject(NotificationService);
  private settingsService = inject(SettingsService);
  private destroyRef = inject(DestroyRef);

  // Modern Angular signals for reactive state
  protected todayEntries = signal<FeedingEntry[]>([]);
  protected editingEntry = signal<FeedingEntry | undefined>(undefined);
  protected readonly todayDate = new Date().toISOString().split('T')[0];
  protected nextFeedCountdown = signal<string | null>(null);

  // Computed value automatically updates when todayEntries changes
  protected totalAmount = computed(() =>
    this.todayEntries().reduce((sum, entry) => sum + entry.amount, 0)
  );

  constructor() {
    // Update countdown whenever feeding entries or settings change
    effect(() => {
      this.todayEntries(); // trigger on entries change
      this.settingsService.settings(); // trigger on settings change
      this.updateCountdown();
    });
  }

  ngOnInit(): void {
    // Modern Angular: Subscribe with automatic cleanup
    this.feedingService.entries$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadTodayEntries();
      });

    this.loadTodayEntries();

    // Update countdown every minute
    interval(60000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updateCountdown();
      });
  }

  private loadTodayEntries(): void {
    this.todayEntries.set(this.feedingService.getTodayEntries());
  }

  protected async onSubmit(formData: { date: string; time: string; amount: number; comment?: string }): Promise<void> {
    const editing = this.editingEntry();
    if (editing) {
      await this.feedingService.updateEntry(editing.id, formData);
    } else {
      await this.feedingService.createEntry(formData);
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
  }

  private updateCountdown(): void {
    const timeUntilNext = this.notificationService.getTimeUntilNextNotification();

    if (timeUntilNext === null || !this.settingsService.isFeedingIntervalEnabled()) {
      this.nextFeedCountdown.set(null);
      return;
    }

    if (timeUntilNext <= 0) {
      this.nextFeedCountdown.set('Feeding time!');
      return;
    }

    // Convert milliseconds to hours and minutes
    const totalMinutes = Math.floor(timeUntilNext / 1000 / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      this.nextFeedCountdown.set(`${hours}h ${minutes}m`);
    } else {
      this.nextFeedCountdown.set(`${minutes}m`);
    }
  }
}
