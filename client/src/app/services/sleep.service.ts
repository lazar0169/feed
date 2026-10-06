import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SleepKind, SleepSession, SleepSessionInput } from '../models/sleep-session.model';
import { AuthService } from './auth.service';
import { TableSync } from './table-sync';

interface SleepSessionDb {
  id: string;
  user_id: string;
  kind: SleepKind | null;
  start_at: string;
  end_at: string | null;
  note: string | null;
}

/** Aggregated sleep for one local calendar day. */
export interface SleepDaySummary {
  totalMs: number; // asleep time clipped to the day
  naps: number;
  longestMs: number; // longest single session that touches the day
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable({
  providedIn: 'root',
})
export class SleepService {
  private authService = inject(AuthService);

  // Recent sessions, newest first. Signal-only (no BehaviorSubject) since all
  // consumers are signal-based.
  readonly sessions = signal<SleepSession[]>([]);
  readonly isLoading = signal<boolean>(false);

  /** The in-progress session, if the baby is currently asleep. */
  readonly activeSession = computed(() => this.sessions().find((s) => s.endAt === null) ?? null);

  // Only recent history is kept in memory; enough for the day navigator.
  private readonly RECENT_WINDOW_DAYS = 30;

  private readonly COLUMNS = 'id, kind, start_at, end_at, note';

  private sync = new TableSync(
    this.authService.getSupabaseClient(),
    'sleep_sessions',
    () => this.loadSessions(true),
    (id) => this.sessions().some((s) => s.id === id),
  );

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.loadSessions();
        this.sync.start(user.id);
      } else {
        this.sync.stop();
        this.sessions.set([]);
        this.isLoading.set(false);
      }
    });
  }

  /** A silent load (live sync) skips isLoading and keeps data on failure. */
  private async loadSessions(silent = false): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) return;

    if (!silent) this.isLoading.set(true);
    try {
      const since = new Date(this.getWindowStart()).toISOString();
      const { data, error } = await this.authService
        .getSupabaseClient()
        .from('sleep_sessions')
        .select(this.COLUMNS)
        .eq('user_id', user.id)
        // Also pick up an old session that was never stopped.
        .or(`start_at.gte.${since},end_at.is.null`)
        .order('start_at', { ascending: false });

      if (error) throw error;
      this.sessions.set((data || []).map((row) => this.mapRow(row as SleepSessionDb)));
    } catch (error) {
      console.error('Error loading sleep sessions:', error);
      if (!silent) this.sessions.set([]);
    } finally {
      if (!silent) this.isLoading.set(false);
    }
  }

  /** Start a session now. Returns null if one is already running or on error. */
  async startSleep(kind: SleepKind): Promise<SleepSession | null> {
    if (this.activeSession()) return null;
    const created = await this.createSession({ kind, startAt: Date.now(), endAt: null });
    if (!created) {
      // Most likely another device started one (unique index); resync.
      await this.loadSessions(true);
    }
    return created;
  }

  /** End the in-progress session now. */
  async stopSleep(): Promise<boolean> {
    const active = this.activeSession();
    if (!active) return false;
    // Guard the end_after_start check if stopped within the same millisecond.
    const endAt = Math.max(Date.now(), active.startAt + 1000);
    return this.updateSession(active.id, { ...active, endAt });
  }

  async createSession(input: SleepSessionInput): Promise<SleepSession | null> {
    const user = this.authService.currentUser();
    if (!user) return null;

    try {
      const { data, error } = await this.authService
        .getSupabaseClient()
        .from('sleep_sessions')
        .insert({ user_id: user.id, ...this.toDb(input) })
        .select(this.COLUMNS)
        .single();

      if (error) throw error;

      const session = this.mapRow(data as SleepSessionDb);
      this.sessions.update((list) => this.sort([...list, session]));
      return session;
    } catch (error) {
      console.error('Error creating sleep session:', error);
      return null;
    }
  }

  async updateSession(id: string, input: SleepSessionInput): Promise<boolean> {
    const user = this.authService.currentUser();
    if (!user) return false;

    try {
      const { error } = await this.authService
        .getSupabaseClient()
        .from('sleep_sessions')
        .update(this.toDb(input))
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      this.sessions.update((list) =>
        this.sort(list.map((s) => (s.id === id ? { ...input, id } : s))),
      );
      return true;
    } catch (error) {
      console.error('Error updating sleep session:', error);
      return false;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    const user = this.authService.currentUser();
    if (!user) return false;

    try {
      const { error } = await this.authService
        .getSupabaseClient()
        .from('sleep_sessions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      this.sessions.update((list) => list.filter((s) => s.id !== id));
      return true;
    } catch (error) {
      console.error('Error deleting sleep session:', error);
      return false;
    }
  }

  /**
   * Fetch sessions overlapping [from, to) for the Log's history (a night that
   * started before `from` still has its wake-up inside). Not added to
   * `sessions`. Returns [] on error.
   */
  async loadSessionsRange(from: number, to: number): Promise<SleepSession[]> {
    const user = this.authService.currentUser();
    if (!user || from >= to) return [];

    try {
      const { data, error } = await this.authService
        .getSupabaseClient()
        .from('sleep_sessions')
        .select(this.COLUMNS)
        .eq('user_id', user.id)
        .lt('start_at', new Date(to).toISOString())
        .gte('end_at', new Date(from).toISOString())
        .order('start_at', { ascending: false });

      if (error) throw error;
      return (data || []).map((row) => this.mapRow(row as SleepSessionDb));
    } catch (error) {
      console.error('Error loading sleep sessions range:', error);
      return [];
    }
  }

  /** Start of the user's oldest session, or null if none / on error. */
  async getEarliestStart(): Promise<number | null> {
    const user = this.authService.currentUser();
    if (!user) return null;

    const { data, error } = await this.authService
      .getSupabaseClient()
      .from('sleep_sessions')
      .select('start_at')
      .eq('user_id', user.id)
      .order('start_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) console.error('Error loading earliest sleep session:', error);
    return data?.start_at ? Date.parse(data.start_at) : null;
  }

  /**
   * First loaded session overlapping [startAt, endAt) — an open end counts as
   * "until now". Used to reject double-logged sleep before writing; `extra`
   * covers sessions held outside the window (the Log's older history).
   */
  findOverlap(
    startAt: number,
    endAt: number | null,
    excludeId?: string,
    extra: SleepSession[] = [],
  ): SleepSession | undefined {
    const now = Date.now();
    const end = endAt ?? now;
    return [...this.sessions(), ...extra].find(
      (s) => s.id !== excludeId && s.startAt < end && (s.endAt ?? now) > startAt,
    );
  }

  /** Sessions touching the local day starting at `dayStart`, oldest first. */
  getSessionsForDay(dayStart: number, now: number = Date.now()): SleepSession[] {
    const dayEnd = this.nextDayStart(dayStart);
    return this.sessions()
      .filter((s) => s.startAt < dayEnd && (s.endAt ?? now) > dayStart)
      .sort((a, b) => a.startAt - b.startAt);
  }

  getDaySummary(dayStart: number, now: number = Date.now()): SleepDaySummary {
    const dayEnd = this.nextDayStart(dayStart);
    let totalMs = 0;
    let naps = 0;
    let longestMs = 0;
    for (const s of this.getSessionsForDay(dayStart, now)) {
      const end = s.endAt ?? now;
      totalMs += Math.max(0, Math.min(end, dayEnd) - Math.max(s.startAt, dayStart));
      longestMs = Math.max(longestMs, end - s.startAt);
      if (s.kind === 'nap') naps++;
    }
    return { totalMs, naps, longestMs };
  }

  /** When the baby last woke up (null if asleep or no history). */
  getLastWakeAt(): number | null {
    if (this.activeSession()) return null;
    let last: number | null = null;
    for (const s of this.sessions()) {
      if (s.endAt !== null && (last === null || s.endAt > last)) last = s.endAt;
    }
    return last;
  }

  /** Local midnight for the given time. */
  startOfDay(ms: number): number {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /** Local midnight of the following day (DST-safe, unlike + DAY_MS). */
  nextDayStart(dayStart: number): number {
    const d = new Date(dayStart);
    d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  getWindowStart(): number {
    return Date.now() - this.RECENT_WINDOW_DAYS * DAY_MS;
  }

  private mapRow(row: SleepSessionDb): SleepSession {
    return {
      id: row.id,
      kind: row.kind === 'night' ? 'night' : 'nap',
      startAt: Date.parse(row.start_at),
      endAt: row.end_at ? Date.parse(row.end_at) : null,
      note: row.note ?? undefined,
    };
  }

  private toDb(input: SleepSessionInput) {
    return {
      kind: input.kind,
      start_at: new Date(input.startAt).toISOString(),
      end_at: input.endAt === null ? null : new Date(input.endAt).toISOString(),
      note: input.note?.trim() || null,
    };
  }

  private sort(list: SleepSession[]): SleepSession[] {
    return list.sort((a, b) => b.startAt - a.startAt);
  }
}
