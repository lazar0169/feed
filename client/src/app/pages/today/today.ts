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
  protected showFormModal = signal<boolean>(false);

  // Computed value automatically updates when todayEntries changes
  protected totalAmount = computed(() =>
    this.todayEntries().reduce((sum, entry) => sum + entry.amount, 0)
  );

  // Computed: determine the label based on countdown state
  protected feedingStatusLabel = computed(() => {
    const countdown = this.nextFeedCountdown();
    if (!countdown) return null;

    const timeUntil = this.notificationService.getTimeUntilNextNotification();
    if (timeUntil === null) return null;

    const totalMinutes = Math.floor(timeUntil / 1000 / 60);

    if (totalMinutes >= -10 && totalMinutes <= 10) {
      return 'Status';
    } else if (totalMinutes < -10) {
      return 'Feeding overdue';
    } else {
      return 'Next feed in';
    }
  });

  // Computed: determine the icon based on countdown state
  protected feedingStatusIcon = computed(() => {
    const countdown = this.nextFeedCountdown();
    if (!countdown) return 'fa-clock';

    const timeUntil = this.notificationService.getTimeUntilNextNotification();
    if (timeUntil === null) return 'fa-clock';

    const totalMinutes = Math.floor(timeUntil / 1000 / 60);

    if (totalMinutes >= -10 && totalMinutes <= 10) {
      return 'fa-bell';
    } else if (totalMinutes < -10) {
      return 'fa-exclamation-triangle';
    } else {
      return 'fa-clock';
    }
  });

  // Computed: determine CSS class for styling
  protected feedingStatusClass = computed(() => {
    const countdown = this.nextFeedCountdown();
    if (!countdown) return '';

    const timeUntil = this.notificationService.getTimeUntilNextNotification();
    if (timeUntil === null) return '';

    const totalMinutes = Math.floor(timeUntil / 1000 / 60);

    if (totalMinutes >= -10 && totalMinutes <= 10) {
      return 'feeding-time';
    } else if (totalMinutes < -10) {
      return 'overdue';
    } else {
      return '';
    }
  });

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

  protected openFormModal(): void {
    this.showFormModal.set(true);
  }

  protected closeFormModal(): void {
    this.showFormModal.set(false);
    this.editingEntry.set(undefined);
  }

  protected async onSubmit(formData: { date: string; time: string; amount: number; comment?: string }): Promise<void> {
    const editing = this.editingEntry();
    if (editing) {
      await this.feedingService.updateEntry(editing.id, formData);
    } else {
      await this.feedingService.createEntry(formData);
    }
    this.editingEntry.set(undefined);
    this.closeFormModal();
  }

  protected onEdit(entry: FeedingEntry): void {
    this.editingEntry.set(entry);
    this.openFormModal();
  }

  protected onCancelEdit(): void {
    this.closeFormModal();
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

    // Convert milliseconds to total minutes
    const totalMinutes = Math.floor(timeUntilNext / 1000 / 60);

    // Within 10 minutes window (10 min before to 10 min after)
    if (totalMinutes >= -10 && totalMinutes <= 10) {
      this.nextFeedCountdown.set('FEEDING TIME');
      return;
    }

    // Overdue (more than 10 minutes past feeding time)
    if (totalMinutes < -10) {
      const overdueMinutes = Math.abs(totalMinutes);
      const hours = Math.floor(overdueMinutes / 60);
      const minutes = overdueMinutes % 60;

      if (hours > 0) {
        this.nextFeedCountdown.set(`${hours}h ${minutes}m`);
      } else {
        this.nextFeedCountdown.set(`${minutes}m`);
      }
      return;
    }

    // Future feeding (more than 10 minutes away)
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      this.nextFeedCountdown.set(`${hours}h ${minutes}m`);
    } else {
      this.nextFeedCountdown.set(`${minutes}m`);
    }
  }
}
