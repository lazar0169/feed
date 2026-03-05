import { Component, EventEmitter, Input, Output, AfterViewChecked, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeedingEntry } from '../../models/feeding-entry.model';

@Component({
  selector: 'app-feeding-list',
  imports: [CommonModule],
  templateUrl: './feeding-list.html',
  styleUrl: './feeding-list.scss',
})
export class FeedingList implements AfterViewChecked {
  @Input() entries: FeedingEntry[] = [];
  @Input() showDate = false;
  @Output() editEntry = new EventEmitter<FeedingEntry>();
  @Output() deleteEntry = new EventEmitter<string>();
  @ViewChildren('foodNameChip') foodNameChips!: QueryList<ElementRef<HTMLDivElement>>;

  // currently selected / expanded entry (shows buttons)
  activeEntryId: string | null = null;

  ngAfterViewChecked(): void {
    this.checkOverflow();
  }

  private checkOverflow(): void {
    if (!this.foodNameChips) return;

    this.foodNameChips.forEach(chipRef => {
      const chip = chipRef.nativeElement;
      const wrapper = chip.querySelector('.food-name-wrapper') as HTMLElement;
      const text = chip.querySelector('.food-name-text') as HTMLElement;
      if (wrapper && text) {
        const overflowAmount = text.scrollWidth - wrapper.clientWidth;
        const isOverflowing = overflowAmount > 0;
        chip.classList.toggle('is-overflowing', isOverflowing);
        if (isOverflowing) {
          // Add 8px buffer to ensure full text is visible
          text.style.setProperty('--marquee-offset', `-${overflowAmount + 8}px`);
        }
      }
    });
  }

  onEntryClick(entryId: string): void {
    this.activeEntryId = this.activeEntryId === entryId ? null : entryId;
    // Re-check overflow after click since container size may change
    setTimeout(() => this.checkOverflow(), 200);
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
