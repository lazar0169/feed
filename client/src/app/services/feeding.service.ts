import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FeedingEntry } from '../models/feeding-entry.model';
import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root'
})
export class FeedingService {
  private readonly STORAGE_KEY = 'feeding_entries';
  private entriesSubject = new BehaviorSubject<FeedingEntry[]>([]);
  public entries$: Observable<FeedingEntry[]> = this.entriesSubject.asObservable();

  constructor(private storageService: StorageService) {
    this.loadEntries();
  }

  /**
   * Load all entries from localStorage
   */
  private loadEntries(): void {
    const entries = this.storageService.getItem<FeedingEntry[]>(this.STORAGE_KEY) || [];
    this.entriesSubject.next(entries);
  }

  /**
   * Save entries to localStorage
   */
  private saveEntries(entries: FeedingEntry[]): void {
    this.storageService.setItem(this.STORAGE_KEY, entries);
    this.entriesSubject.next(entries);
  }

  /**
   * Get all entries
   */
  getAllEntries(): FeedingEntry[] {
    return this.entriesSubject.value;
  }

  /**
   * Get entries for a specific date
   */
  getEntriesByDate(date: string): FeedingEntry[] {
    return this.entriesSubject.value
      .filter(entry => entry.date === date)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get entries for today
   */
  getTodayEntries(): FeedingEntry[] {
    const today = this.getTodayDate();
    return this.getEntriesByDate(today);
  }

  /**
   * Get entry by ID
   */
  getEntryById(id: string): FeedingEntry | undefined {
    return this.entriesSubject.value.find(entry => entry.id === id);
  }

  /**
   * Create a new entry
   */
  createEntry(entry: Omit<FeedingEntry, 'id' | 'timestamp'>): FeedingEntry {
    const newEntry: FeedingEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: this.createTimestamp(entry.date, entry.time)
    };

    const entries = [...this.entriesSubject.value, newEntry];
    this.saveEntries(entries);
    return newEntry;
  }

  /**
   * Update an existing entry
   */
  updateEntry(id: string, updates: Partial<Omit<FeedingEntry, 'id'>>): boolean {
    const entries = this.entriesSubject.value;
    const index = entries.findIndex(entry => entry.id === id);

    if (index === -1) {
      return false;
    }

    const updatedEntry = { ...entries[index], ...updates };

    // Recalculate timestamp if date or time changed
    if (updates.date || updates.time) {
      updatedEntry.timestamp = this.createTimestamp(updatedEntry.date, updatedEntry.time);
    }

    entries[index] = updatedEntry;
    this.saveEntries([...entries]);
    return true;
  }

  /**
   * Delete an entry
   */
  deleteEntry(id: string): boolean {
    const entries = this.entriesSubject.value;
    const filteredEntries = entries.filter(entry => entry.id !== id);

    if (filteredEntries.length === entries.length) {
      return false; // Entry not found
    }

    this.saveEntries(filteredEntries);
    return true;
  }

  /**
   * Get unique dates that have entries (sorted descending)
   */
  getUniqueDates(): string[] {
    const dates = new Set(this.entriesSubject.value.map(entry => entry.date));
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }

  /**
   * Get statistics for a date range
   */
  getStatistics(startDate?: string, endDate?: string): {
    totalFeedings: number;
    totalAmount: number;
    averageAmount: number;
    averageFeedingsPerDay: number;
  } {
    let entries = this.entriesSubject.value;

    if (startDate) {
      entries = entries.filter(entry => entry.date >= startDate);
    }
    if (endDate) {
      entries = entries.filter(entry => entry.date <= endDate);
    }

    const totalFeedings = entries.length;
    const totalAmount = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const averageAmount = totalFeedings > 0 ? totalAmount / totalFeedings : 0;

    const uniqueDates = new Set(entries.map(entry => entry.date));
    const averageFeedingsPerDay = uniqueDates.size > 0 ? totalFeedings / uniqueDates.size : 0;

    return {
      totalFeedings,
      totalAmount,
      averageAmount: Math.round(averageAmount * 10) / 10,
      averageFeedingsPerDay: Math.round(averageFeedingsPerDay * 10) / 10
    };
  }

  /**
   * Helper: Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Helper: Get today's date in YYYY-MM-DD format
   */
  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Helper: Create timestamp from date and time strings
   */
  private createTimestamp(date: string, time: string): number {
    return new Date(`${date}T${time}`).getTime();
  }
}
