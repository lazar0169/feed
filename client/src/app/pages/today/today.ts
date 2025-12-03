import { Component, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  // Modern Angular signals for reactive state
  protected todayEntries = signal<FeedingEntry[]>([]);
  protected editingEntry = signal<FeedingEntry | undefined>(undefined);
  protected readonly todayDate = new Date().toISOString().split('T')[0];

  // Computed value automatically updates when todayEntries changes
  protected totalAmount = computed(() =>
    this.todayEntries().reduce((sum, entry) => sum + entry.amount, 0)
  );

  constructor(private feedingService: FeedingService) {
    // Effect runs whenever entries$ emits
    effect(() => {
      this.feedingService.entries$.subscribe(() => {
        this.loadTodayEntries();
      });
    });
  }

  ngOnInit(): void {
    this.loadTodayEntries();
  }

  private loadTodayEntries(): void {
    this.todayEntries.set(this.feedingService.getTodayEntries());
  }

  protected onSubmit(formData: { date: string; time: string; amount: number; comment?: string }): void {
    const editing = this.editingEntry();
    if (editing) {
      this.feedingService.updateEntry(editing.id, formData);
    } else {
      this.feedingService.createEntry(formData);
    }
    this.editingEntry.set(undefined);
  }

  protected onEdit(entry: FeedingEntry): void {
    this.editingEntry.set(entry);
  }

  protected onCancelEdit(): void {
    this.editingEntry.set(undefined);
  }

  protected onDelete(id: string): void {
    this.feedingService.deleteEntry(id);
  }
}
