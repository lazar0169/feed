-- Wake-window reminder: minutes after waking to notify. NULL means disabled.
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS wake_window_minutes INTEGER
  CHECK (wake_window_minutes IS NULL OR wake_window_minutes BETWEEN 15 AND 600);

COMMENT ON COLUMN public.user_settings.wake_window_minutes IS 'Wake-window reminder in minutes; NULL = disabled';

-- Live sync between devices: publish feeding/sleep changes over Supabase
-- Realtime (RLS still applies to what each subscriber receives).
-- ADD TABLE fails if the table is already published, hence the guard.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['feeding_entries', 'sleep_sessions'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
