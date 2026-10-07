import { Injectable, effect, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable } from 'rxjs';
import { FeedingEntry } from '../models/feeding-entry.model';
import { AuthService } from './auth.service';
import { TableSync } from './table-sync';

interface FeedingEntryDb extends FeedingEntry {
  user_id: string;
  created_at?: string;
  updated_at?: string;
}

// Default type for entries that don't have one (backwards compatibility)
const DEFAULT_FEEDING_TYPE = 'milk' as const;

@Injectable({
  providedIn: 'root'
})
export class FeedingService {
  private entriesSubject = new BehaviorSubject<FeedingEntry[]>([]);
  public entries$: Observable<FeedingEntry[]> = this.entriesSubject.asObservable();

  // Signal mirror of entries$ for zoneless-friendly reactive reads (computeds
  // that depend on this update the view without a manual subscription).
  public readonly entries = toSignal(this.entries$, { initialValue: [] as FeedingEntry[] });

  // Loading state signal
  public isLoading = signal<boolean>(false);

  // Only the most recent window of entries is kept in memory. This keeps the
  // startup fetch (and every consumer that scans the whole list) bounded as
  // history grows. Older entries are fetched on demand by the Feed page via
  // loadEntriesRange().
  private readonly RECENT_WINDOW_DAYS = 90;

  // Explicit column list instead of select('*') to avoid over-fetching.
  private readonly ENTRY_COLUMNS =
    'id, type, date, time, amount, name, spoons, comment, timestamp';

  private sync: TableSync;

  constructor(private authService: AuthService) {
    this.sync = new TableSync(
      authService.getSupabaseClient(),
      'feeding_entries',
      () => this.loadEntries(true),
      (id) => this.entriesSubject.value.some((e) => e.id === id),
    );

    // Modern Angular: Use effect to watch signal changes
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.loadEntries();
        this.sync.start(user.id);
      } else {
        this.sync.stop();
        this.entriesSubject.next([]);
        this.isLoading.set(false);
      }
    });
  }

  /**
   * Load all entries from Supabase for current user. A silent load (live
   * sync) leaves isLoading alone and keeps current entries on failure.
   */
  private async loadEntries(silent = false): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) return;

    if (!silent) this.isLoading.set(true);

    try {
      const supabase = this.authService.getSupabaseClient();
      const { data, error } = await supabase
        .from('feeding_entries')
        .select(this.ENTRY_COLUMNS)
        .eq('user_id', user.id)
        .gte('timestamp', this.getWindowStart())
        .order('timestamp', { ascending: false });

      if (error) throw error;

      this.entriesSubject.next((data || []).map(entry => this.mapRow(entry as FeedingEntryDb)));
    } catch (error) {
      console.error('Error loading entries:', error);
      if (!silent) this.entriesSubject.next([]);
    } finally {
      if (!silent) this.isLoading.set(false);
    }
  }

  /**
   * Fetch entries with timestamp in [from, to) for the Feed page's history. Not
   * added to entries$; the Feed page keeps them in its own store. Returns [] on error.
   */
  async loadEntriesRange(from: number, to: number): Promise<FeedingEntry[]> {
    const user = this.authService.currentUser();
    if (!user || from >= to) return [];

    try {
      const { data, error } = await this.authService
        .getSupabaseClient()
        .from('feeding_entries')
        .select(this.ENTRY_COLUMNS)
        .eq('user_id', user.id)
        .gte('timestamp', from)
        .lt('timestamp', to)
        .order('timestamp', { ascending: false });

      if (error) throw error;

      return (data || []).map((entry) => this.mapRow(entry as FeedingEntryDb));
    } catch (error) {
      console.error('Error loading entries range:', error);
      return [];
    }
  }

  /** Timestamp of the user's oldest entry, or null if none / on error. */
  async getEarliestTimestamp(): Promise<number | null> {
    const user = this.authService.currentUser();
    if (!user) return null;

    const { data, error } = await this.authService
      .getSupabaseClient()
      .from('feeding_entries')
      .select('timestamp')
      .eq('user_id', user.id)
      .order('timestamp', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) console.error('Error loading earliest entry:', error);
    return data?.timestamp ?? null;
  }

  /** Map a raw DB row to a FeedingEntry (null type defaults to milk). */
  private mapRow(entry: FeedingEntryDb): FeedingEntry {
    return {
      id: entry.id,
      type: entry.type || DEFAULT_FEEDING_TYPE,
      date: entry.date,
      time: entry.time,
      amount: entry.amount,
      name: entry.name,
      spoons: entry.spoons,
      comment: entry.comment,
      timestamp: entry.timestamp
    };
  }

  /**
   * Get all entries
   */
  getAllEntries(): FeedingEntry[] {
    return this.entriesSubject.value;
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
        type: entry.type,
        date: entry.date,
        time: entry.time,
        amount: entry.amount,
        name: entry.name,
        spoons: entry.spoons,
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

      const newEntry = this.mapRow(data as FeedingEntryDb);

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

      // The entry may live in the recent window (entries$) or only in the Feed page's
      // older-history store. When it isn't in memory we still perform the DB
      // write — the feeding form always submits the full editable field set.
      const base: FeedingEntry = index !== -1
        ? entries[index]
        : { id, type: DEFAULT_FEEDING_TYPE, date: '', time: '', amount: 0, timestamp: 0 };
      const updatedEntry: FeedingEntry = { ...base, ...updates, id };

      // Recalculate timestamp if date or time changed
      if (updates.date || updates.time) {
        updatedEntry.timestamp = this.createTimestamp(updatedEntry.date, updatedEntry.time);
      }

      const dbUpdates: Partial<FeedingEntryDb> = {
        date: updatedEntry.date,
        time: updatedEntry.time,
        amount: updatedEntry.amount,
        name: updatedEntry.name,
        spoons: updatedEntry.spoons,
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

      // Reflect in the recent window only when the entry belongs to it.
      if (index !== -1) {
        entries[index] = updatedEntry;
        this.entriesSubject.next([...entries]);
      }

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

      // Remove from the recent window if it lives there; older entries are
      // removed from the Feed page's own store by the caller.
      const entries = this.entriesSubject.value;
      const filteredEntries = entries.filter(entry => entry.id !== id);
      if (filteredEntries.length !== entries.length) {
        this.entriesSubject.next(filteredEntries);
      }

      return true;
    } catch (error) {
      console.error('Error deleting entry:', error);
      return false;
    }
  }

  /** Epoch-ms lower bound of the in-memory recent window. */
  getWindowStart(): number {
    return Date.now() - this.RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  }

  /** Re-fetch the recent window (e.g. after an edit crosses the boundary). */
  async reload(): Promise<void> {
    await this.loadEntries();
  }

  /**
   * Helper: Create timestamp from date and time strings
   */
  private createTimestamp(date: string, time: string): number {
    return new Date(`${date}T${time}`).getTime();
  }
}
