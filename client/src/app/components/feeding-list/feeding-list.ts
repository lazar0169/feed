import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeedingEntry } from '../../models/feeding-entry.model';

@Component({
  selector: 'app-feeding-list',
  imports: [CommonModule],
  templateUrl: './feeding-list.html',
  styleUrl: './feeding-list.scss',
})
export class FeedingList {
  @Input() entries: FeedingEntry[] = [];
  @Input() showDate = false;
  @Output() editEntry = new EventEmitter<FeedingEntry>();
  @Output() deleteEntry = new EventEmitter<string>();

  // currently selected / expanded entry (shows buttons)
  activeEntryId: string | null = null;

  onEntryClick(entryId: string): void {
    this.activeEntryId = this.activeEntryId === entryId ? null : entryId;
  }

  onEdit(entry: FeedingEntry): void {
    this.activeEntryId = null;
    this.editEntry.emit(entry);
  }

  onDelete(id: string): void {
    if (confirm('Are you sure you want to delete this entry?')) {
      this.activeEntryId = null;
      this.deleteEntry.emit(id);
    }
  }

  formatDate(dateString: string): string {
    // Format date as DD.MM.YYYY
    const date = new Date(dateString + 'T00:00:00');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }
}
