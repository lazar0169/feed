import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { User } from '@supabase/supabase-js';
import { SleepService } from './sleep.service';
import { AuthService } from './auth.service';
import { SleepSession } from '../models/sleep-session.model';

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).getTime();

/** Chainable stand-in for a Supabase query: awaiting it yields `listResult`, .single() yields `singleResult`. */
function fakeQuery(listResult: unknown, singleResult: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'or', 'order', 'insert', 'update', 'delete']) {
    q[m] = vi.fn(() => q);
  }
  q['single'] = vi.fn(async () => singleResult);
  q['then'] = (resolve: (v: unknown) => unknown) => Promise.resolve(listResult).then(resolve);
  return q;
}

describe('SleepService', () => {
  let service: SleepService;
  let currentUser: ReturnType<typeof signal<User | null>>;
  let query: ReturnType<typeof fakeQuery>;

  const night: SleepSession = { id: 'n', kind: 'night', startAt: at(5, 21), endAt: at(6, 6) };
  const nap: SleepSession = { id: 'a', kind: 'nap', startAt: at(6, 13), endAt: at(6, 14, 30) };

  beforeEach(() => {
    currentUser = signal<User | null>(null);
    query = fakeQuery({ data: [], error: null }, { data: null, error: null });
    const channel = { on: () => channel, subscribe: () => channel };
    const client = { from: vi.fn(() => query), channel: () => channel, removeChannel: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser, getSupabaseClient: () => client } },
      ],
    });
    service = TestBed.inject(SleepService);
  });

  describe('findOverlap', () => {
    beforeEach(() => service.sessions.set([nap, night]));

    it('treats back-to-back sessions as not overlapping', () => {
      expect(service.findOverlap(at(6, 14, 30), at(6, 15))).toBeUndefined();
      expect(service.findOverlap(at(6, 12), at(6, 13))).toBeUndefined();
    });

    it('detects a partial overlap', () => {
      expect(service.findOverlap(at(6, 14), at(6, 15))?.id).toBe('a');
    });

    it('ignores the session being edited', () => {
      expect(service.findOverlap(at(6, 13, 15), at(6, 14), 'a')).toBeUndefined();
    });

    it('treats an open end as running until now', () => {
      expect(service.findOverlap(at(6, 5), null)?.id).toBeDefined();
    });
  });

  it('reports the active session and no wake time while asleep', () => {
    service.sessions.set([{ id: 'x', kind: 'nap', startAt: at(6, 15), endAt: null }, nap]);
    expect(service.activeSession()?.id).toBe('x');
    expect(service.getLastWakeAt()).toBeNull();

    service.sessions.set([nap, night]);
    expect(service.activeSession()).toBeNull();
    expect(service.getLastWakeAt()).toBe(at(6, 14, 30));
  });

  it('refuses to start a second session', async () => {
    service.sessions.set([{ id: 'x', kind: 'nap', startAt: at(6, 15), endAt: null }]);
    expect(await service.startSleep('nap')).toBeNull();
    expect(query['insert']).not.toHaveBeenCalled();
  });

  it('createSession writes ISO timestamps and inserts newest first', async () => {
    currentUser.set({ id: 'user-1' } as User);
    TestBed.tick();
    expect(service.isLoading()).toBe(true);
    // Seeding before the login load settles would get overwritten by it.
    await vi.waitFor(() => expect(service.isLoading()).toBe(false));

    service.sessions.set([night]);
    (query['single'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        id: 'new',
        kind: 'nap',
        start_at: new Date(at(6, 13)).toISOString(),
        end_at: new Date(at(6, 14)).toISOString(),
        note: null,
      },
      error: null,
    });

    await service.createSession({ kind: 'nap', startAt: at(6, 13), endAt: at(6, 14), note: '  ' });

    expect(query['insert']).toHaveBeenCalledWith({
      user_id: 'user-1',
      kind: 'nap',
      start_at: new Date(at(6, 13)).toISOString(),
      end_at: new Date(at(6, 14)).toISOString(),
      note: null,
    });
    expect(service.sessions().map((s) => s.id)).toEqual(['new', 'n']);
  });
});
