import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

/**
 * Keeps a service's in-memory rows in step with other devices: on any
 * Realtime change to the user's rows, or when the app returns to the
 * foreground, it calls `resync` (debounced). Resyncing instead of patching
 * keeps the window/ordering logic in one place, in the owning service.
 */
export class TableSync {
  private channel: RealtimeChannel | null = null;
  private userId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private client: SupabaseClient,
    private table: string,
    private resync: () => void,
    private isKnownId: (id: string) => boolean,
  ) {
    // Realtime drops while a phone is locked, so catch up on return.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.userId) this.schedule();
    });
  }

  start(userId: string): void {
    if (this.userId === userId && this.channel) return;
    this.stop();
    this.userId = userId;
    this.channel = this.client
      .channel(`${this.table}:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: this.table, filter: `user_id=eq.${userId}` },
        () => this.schedule(),
      )
      // Realtime can't filter DELETE events (and the old row carries only the
      // primary key under RLS), so match deletes by id instead.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: this.table },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id && this.isKnownId(id)) this.schedule();
        },
      )
      .subscribe();
  }

  stop(): void {
    this.userId = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.channel) {
      this.client.removeChannel(this.channel);
      this.channel = null;
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.resync();
    }, 300);
  }
}
