import { Injectable, effect, signal } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FeedingEntry } from '../models/feeding-entry.model';
import { AuthService } from './auth.service';

interface FeedingEntryDb extends FeedingEntry {
  user_id: string;
  created_at?: string;
  updated_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FeedingService {
  private entriesSubject = new BehaviorSubject<FeedingEntry[]>([]);
  public entries$: Observable<FeedingEntry[]> = this.entriesSubject.asObservable();

  // Loading state signal
  public isLoading = signal<boolean>(false);

  constructor(private authService: AuthService) {
    // Modern Angular: Use effect to watch signal changes
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.loadEntries();
      } else {
        this.entriesSubject.next([]);
        this.isLoading.set(false);
      }
    });
  }

  /**
   * Load all entries from Supabase for current user
   */
  private async loadEntries(): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) return;

    this.isLoading.set(true);

    try {
      const supabase = this.authService.getSupabaseClient();
      const { data, error } = await supabase
        .from('feeding_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false });

      if (error) throw error;

      const entries: FeedingEntry[] = (data || []).map((entry: FeedingEntryDb) => ({
        id: entry.id,
        date: entry.date,
        time: entry.time,
        amount: entry.amount,
        comment: entry.comment,
        timestamp: entry.timestamp
      }));

      this.entriesSubject.next(entries);
    } catch (error) {
      console.error('Error loading entries:', error);
      this.entriesSubject.next([]);
    } finally {
      this.isLoading.set(false);
    }
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
      .sort((a, b) => {
        // Sort by time (HH:MM) in descending order (latest time first)
        return b.time.localeCompare(a.time);
      });
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
  async createEntry(entry: Omit<FeedingEntry, 'id' | 'timestamp'>): Promise<FeedingEntry | null> {
    const user = this.authService.currentUser();
    if (!user) return null;

    try {
      const timestamp = this.createTimestamp(entry.date, entry.time);
      const supabase = this.authService.getSupabaseClient();

      const dbEntry: Partial<FeedingEntryDb> = {
        user_id: user.id,
        date: entry.date,
        time: entry.time,
        amount: entry.amount,
        comment: entry.comment,
        timestamp,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('feeding_entries')
        .insert(dbEntry)
        .select()
        .single();

      if (error) throw error;

      const newEntry: FeedingEntry = {
        id: data.id,
        date: data.date,
        time: data.time,
        amount: data.amount,
        comment: data.comment,
        timestamp: data.timestamp
      };

      // Update local state
      const entries = [...this.entriesSubject.value, newEntry];
      this.entriesSubject.next(entries);

      return newEntry;
    } catch (error) {
      console.error('Error creating entry:', error);
      return null;
    }
  }

  /**
   * Update an existing entry
   */
  async updateEntry(id: string, updates: Partial<Omit<FeedingEntry, 'id'>>): Promise<boolean> {
    const user = this.authService.currentUser();
    if (!user) return false;

    try {
      const supabase = this.authService.getSupabaseClient();
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

      const dbUpdates: Partial<FeedingEntryDb> = {
        date: updatedEntry.date,
        time: updatedEntry.time,
        amount: updatedEntry.amount,
        comment: updatedEntry.comment,
        timestamp: updatedEntry.timestamp,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('feeding_entries')
        .update(dbUpdates)
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      // Update local state
      entries[index] = updatedEntry;
      this.entriesSubject.next([...entries]);

      return true;
    } catch (error) {
      console.error('Error updating entry:', error);
      return false;
    }
  }

  /**
   * Delete an entry
   */
  async deleteEntry(id: string): Promise<boolean> {
    const user = this.authService.currentUser();
    if (!user) return false;

    try {
      const supabase = this.authService.getSupabaseClient();

      const { error } = await supabase
        .from('feeding_entries')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      // Update local state
      const entries = this.entriesSubject.value;
      const filteredEntries = entries.filter(entry => entry.id !== id);

      if (filteredEntries.length === entries.length) {
        return false; // Entry not found
      }

      this.entriesSubject.next(filteredEntries);
      return true;
    } catch (error) {
      console.error('Error deleting entry:', error);
      return false;
    }
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
