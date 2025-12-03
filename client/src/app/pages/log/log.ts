import { Component, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeedingService } from '../../services/feeding.service';
import { FeedingEntry } from '../../models/feeding-entry.model';
import { FeedingForm } from '../../components/feeding-form/feeding-form';
import { FeedingList } from '../../components/feeding-list/feeding-list';

interface DateGroup {
  date: string;
  entries: FeedingEntry[];
}

@Component({
  selector: 'app-log',
  imports: [CommonModule, FeedingForm, FeedingList],
  templateUrl: './log.html',
  styleUrl: './log.scss',
})
export class Log implements OnInit {
  // Modern Angular signals for reactive state
  protected dateGroups = signal<DateGroup[]>([]);
  protected editingEntry = signal<FeedingEntry | undefined>(undefined);

  constructor(private feedingService: FeedingService) {
    // Effect runs whenever entries$ emits
    effect(() => {
      this.feedingService.entries$.subscribe(() => {
        this.loadEntries();
      });
    });
  }

  ngOnInit(): void {
    this.loadEntries();
  }

  private loadEntries(): void {
    const uniqueDates = this.feedingService.getUniqueDates();
    this.dateGroups.set(uniqueDates.map(date => ({
      date,
      entries: this.feedingService.getEntriesByDate(date)
    })));
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
}
