-- Sleep tracking: one row per sleep session (nap or night sleep).
-- Uses real timestamps (not date/time text like feeding_entries) because
-- sleep routinely crosses midnight. end_at NULL means "still asleep".
CREATE TABLE IF NOT EXISTS public.sleep_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'nap' CHECK (kind IN ('nap', 'night')),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT sleep_sessions_end_after_start CHECK (end_at IS NULL OR end_at > start_at)
);

-- Enable RLS on sleep_sessions
ALTER TABLE public.sleep_sessions ENABLE ROW LEVEL SECURITY;

-- Sleep sessions policies
CREATE POLICY "Users can read own sleep sessions"
  ON public.sleep_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sleep sessions"
  ON public.sleep_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sleep sessions"
  ON public.sleep_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sleep sessions"
  ON public.sleep_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sleep_sessions TO authenticated;

-- Create index for performance
CREATE INDEX IF NOT EXISTS sleep_sessions_user_start_idx
  ON public.sleep_sessions(user_id, start_at DESC);

-- At most one in-progress session per user (guards against two devices
-- both pressing "start sleep").
CREATE UNIQUE INDEX IF NOT EXISTS sleep_sessions_one_active_per_user_idx
  ON public.sleep_sessions(user_id)
  WHERE end_at IS NULL;

-- Keep updated_at fresh (function created in 20251204000000_add_user_settings.sql)
DROP TRIGGER IF EXISTS update_sleep_sessions_updated_at ON public.sleep_sessions;
CREATE TRIGGER update_sleep_sessions_updated_at
  BEFORE UPDATE ON public.sleep_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON COLUMN public.sleep_sessions.kind IS 'nap or night';
COMMENT ON COLUMN public.sleep_sessions.end_at IS 'NULL while the session is in progress';
