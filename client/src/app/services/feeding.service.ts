import { Injectable, effect, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable } from 'rxjs';
import { FeedingEntry } from '../models/feeding-entry.model';
import { AuthService } from './auth.service';

interface FeedingEntryDb extends FeedingEntry {
  user_id: string;
  created_at?: string;
  updated_at?: string;
}

/** One day's aggregated feeding totals (for the intake trend chart). */
export interface DailyTotal {
  date: string; // YYYY-MM-DD
  label: string; // short axis label, e.g. "5/8"
  weekday: string; // e.g. "Mon"
  milkMl: number;
  solidsGrams: number;
  solidsSpoons: number;
  solidFeeds: number;
  feeds: number;
}

/** Spacing between consecutive feeds over some range. */
export interface IntervalStats {
  averageMs: number;
  longestGapMs: number;
  longestGapStart: number; // timestamp of the feed before the longest gap
}

/** One metric compared against the previous week. */
export interface WeekMetric {
  current: number;
  previous: number;
  delta: number;
}

export interface WeekComparison {
  feedsPerDay: WeekMetric;
  milkPerDay: WeekMetric;
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
  // history grows. Older entries are fetched on demand by the Log page via
  // fetchEntriesRange(). 90 days keeps the 7-day and 30-day stats exact.
  private readonly RECENT_WINDOW_DAYS = 90;

  // Page size for on-demand paging of older (pre-window) history in the Log.
  private readonly OLDER_PAGE_SIZE = 100;

  // Explicit column list instead of select('*') to avoid over-fetching.
  private readonly ENTRY_COLUMNS =
    'id, type, date, time, amount, name, spoons, comment, timestamp';

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
        .select(this.ENTRY_COLUMNS)
        .eq('user_id', user.id)
        .gte('timestamp', this.getWindowStart())
        .order('timestamp', { ascending: false });

      if (error) throw error;

      this.entriesSubject.next((data || []).map(entry => this.mapRow(entry as FeedingEntryDb)));
    } catch (error) {
      console.error('Error loading entries:', error);
      this.entriesSubject.next([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Fetch a page of OLDER entries — those before the in-memory recent window.
   * These are deliberately NOT added to entries$; the Log page keeps its own
   * paginated store. The strict timestamp boundary (window is >= windowStart,
   * older is < windowStart) guarantees no overlap with entries$. Returns []
   * on error.
   */
  async loadOlderEntries(offset: number, pageSize: number = this.OLDER_PAGE_SIZE): Promise<FeedingEntry[]> {
    const user = this.authService.currentUser();
    if (!user) return [];

    try {
      const supabase = this.authService.getSupabaseClient();
      const { data, error } = await supabase
        .from('feeding_entries')
        .select(this.ENTRY_COLUMNS)
        .eq('user_id', user.id)
        .lt('timestamp', this.getWindowStart())
        .order('timestamp', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;

      return (data || []).map(entry => this.mapRow(entry as FeedingEntryDb));
    } catch (error) {
      console.error('Error loading older entries:', error);
      return [];
    }
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

      // The entry may live in the recent window (entries$) or only in the Log's
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
      // removed from the Log's own store by the caller.
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
    // Milk specific
    milkFeedings: number;
    totalMilk: number;
    averageMilk: number;
    // Solids specific
    solidFeedings: number;
    totalSolidsGrams: number;
    totalSolidsSpoons: number;
  } {
    let entries = this.entriesSubject.value;

    if (startDate) {
      entries = entries.filter(entry => entry.date >= startDate);
    }
    if (endDate) {
      entries = entries.filter(entry => entry.date <= endDate);
    }

    const milkEntries = entries.filter(e => e.type !== 'solid');
    const solidEntries = entries.filter(e => e.type === 'solid');

    const totalFeedings = entries.length;
    const totalAmount = milkEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const averageAmount = milkEntries.length > 0 ? totalAmount / milkEntries.length : 0;

    const uniqueDates = new Set(entries.map(entry => entry.date));
    const averageFeedingsPerDay = uniqueDates.size > 0 ? totalFeedings / uniqueDates.size : 0;

    // Milk stats
    const milkFeedings = milkEntries.length;
    const totalMilk = totalAmount;
    const averageMilk = averageAmount;

    // Solids stats
    const solidFeedings = solidEntries.length;
    const totalSolidsGrams = solidEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const totalSolidsSpoons = solidEntries.reduce((sum, entry) => sum + (entry.spoons || 0), 0);

    return {
      totalFeedings,
      totalAmount,
      averageAmount: Math.round(averageAmount * 10) / 10,
      averageFeedingsPerDay: Math.round(averageFeedingsPerDay * 10) / 10,
      milkFeedings,
      totalMilk,
      averageMilk: Math.round(averageMilk * 10) / 10,
      solidFeedings,
      totalSolidsGrams,
      totalSolidsSpoons
    };
  }

  /** Epoch-ms lower bound of the in-memory recent window. */
  getWindowStart(): number {
    return Date.now() - this.RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  }

  /** Recent-window lower bound as YYYY-MM-DD (for date-string filters). */
  getWindowStartDate(): string {
    return new Date(this.getWindowStart()).toISOString().split('T')[0];
  }

  /** Number of days the in-memory window (and window-scoped stats) cover. */
  getWindowDays(): number {
    return this.RECENT_WINDOW_DAYS;
  }

  /** Re-fetch the recent window (e.g. after an edit crosses the boundary). */
  async reload(): Promise<void> {
    await this.loadEntries();
  }

  // ---- Insights / analytics (all computed from the in-memory window) ----
  // Each is a single linear pass; kept separate for testability. Cheap enough
  // to re-run on every entries$ emission for a ≤90-day window.

  /**
   * Per-day aggregated totals for the last `days` days (oldest → newest),
   * including days with no feeds. Drives the intake trend chart.
   */
  getDailyTotals(days: number): DailyTotal[] {
    const byDate = new Map<string, { milkMl: number; solidsGrams: number; solidsSpoons: number; solidFeeds: number; feeds: number }>();
    for (const e of this.entriesSubject.value) {
      let acc = byDate.get(e.date);
      if (!acc) {
        acc = { milkMl: 0, solidsGrams: 0, solidsSpoons: 0, solidFeeds: 0, feeds: 0 };
        byDate.set(e.date, acc);
      }
      // null/absent type is normalized to milk on load, so !== 'solid' is safe.
      if (e.type === 'solid') {
        acc.solidsGrams += e.amount || 0;
        acc.solidsSpoons += e.spoons || 0;
        acc.solidFeeds++;
      } else {
        acc.milkMl += e.amount || 0;
      }
      acc.feeds++;
    }

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result: DailyTotal[] = [];
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() - (days - 1));
    for (let i = 0; i < days; i++) {
      const date = this.toLocalDateStr(cursor);
      const acc = byDate.get(date);
      const solidsGrams = acc?.solidsGrams || 0;
      const solidsSpoons = acc?.solidsSpoons || 0;
      result.push({
        date,
        label: `${cursor.getDate()}/${cursor.getMonth() + 1}`,
        weekday: weekdays[cursor.getDay()],
        milkMl: acc?.milkMl || 0,
        solidsGrams,
        solidsSpoons,
        solidFeeds: acc?.solidFeeds || 0,
        feeds: acc?.feeds || 0
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  /** Feeds bucketed by hour of day (0..23) across the window. */
  getHourlyCounts(): number[] {
    const counts = new Array(24).fill(0);
    for (const e of this.entriesSubject.value) {
      const h = parseInt((e.time || '').slice(0, 2), 10);
      if (!isNaN(h) && h >= 0 && h < 24) counts[h]++;
    }
    return counts;
  }

  /**
   * Spacing between consecutive feeds over the last `days` days (all feed types
   * — a solid still resets the clock). Null when fewer than two feeds in range.
   */
  getIntervalStats(days: number = 7): IntervalStats | null {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const ts = this.entriesSubject.value
      .map(e => e.timestamp)
      .filter(t => typeof t === 'number' && !isNaN(t) && t >= since)
      .sort((a, b) => a - b);
    if (ts.length < 2) return null;

    let total = 0;
    let longestGapMs = 0;
    let longestGapStart = ts[0];
    for (let i = 1; i < ts.length; i++) {
      const gap = ts[i] - ts[i - 1];
      total += gap;
      if (gap > longestGapMs) {
        longestGapMs = gap;
        longestGapStart = ts[i - 1];
      }
    }
    return { averageMs: total / (ts.length - 1), longestGapMs, longestGapStart };
  }

  /**
   * Compares the last 7 days against the 7 days before that: average feeds/day
   * and average milk (ml)/day, with the signed delta between the two weeks.
   */
  getWeekComparison(): WeekComparison {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const thisWeekStart = now - 7 * day;
    const lastWeekStart = now - 14 * day;

    let curFeeds = 0;
    let prevFeeds = 0;
    let curMilk = 0;
    let prevMilk = 0;
    for (const e of this.entriesSubject.value) {
      const isMilk = e.type !== 'solid';
      if (e.timestamp >= thisWeekStart) {
        curFeeds++;
        if (isMilk) curMilk += e.amount || 0;
      } else if (e.timestamp >= lastWeekStart) {
        prevFeeds++;
        if (isMilk) prevMilk += e.amount || 0;
      }
    }

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const feedsCur = round1(curFeeds / 7);
    const feedsPrev = round1(prevFeeds / 7);
    const milkCur = Math.round(curMilk / 7);
    const milkPrev = Math.round(prevMilk / 7);

    return {
      feedsPerDay: { current: feedsCur, previous: feedsPrev, delta: round1(feedsCur - feedsPrev) },
      milkPerDay: { current: milkCur, previous: milkPrev, delta: milkCur - milkPrev }
    };
  }

  /** Local YYYY-MM-DD (matches how entry dates are stored by the form). */
  private toLocalDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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
