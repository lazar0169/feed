import { Component, OnInit, signal, computed, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FeedingService } from '../../services/feeding.service';
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
  private destroyRef = inject(DestroyRef);

  // Modern Angular signals for reactive state
  protected todayEntries = signal<FeedingEntry[]>([]);
  protected editingEntry = signal<FeedingEntry | undefined>(undefined);
  protected readonly todayDate = new Date().toISOString().split('T')[0];

  // Computed value automatically updates when todayEntries changes
  protected totalAmount = computed(() =>
    this.todayEntries().reduce((sum, entry) => sum + entry.amount, 0)
  );

  ngOnInit(): void {
    // Modern Angular: Subscribe with automatic cleanup
    this.feedingService.entries$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadTodayEntries();
      });

    this.loadTodayEntries();
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
}
