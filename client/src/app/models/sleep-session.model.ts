export type SleepKind = 'nap' | 'night';

export interface SleepSession {
  id: string;
  kind: SleepKind;
  startAt: number; // epoch ms
  endAt: number | null; // epoch ms; null while still asleep
  note?: string;
}

/** Fields the user can set when creating/editing a session. */
export type SleepSessionInput = Omit<SleepSession, 'id'>;
