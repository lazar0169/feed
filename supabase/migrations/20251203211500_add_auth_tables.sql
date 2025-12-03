-- Create profiles table for username/email mapping
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Grant permissions on profiles
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- Create feeding_entries table (or rename feedin_logs)
CREATE TABLE IF NOT EXISTS public.feeding_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  amount INTEGER NOT NULL,
  comment TEXT,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on feeding_entries
ALTER TABLE public.feeding_entries ENABLE ROW LEVEL SECURITY;

-- Feeding entries policies
CREATE POLICY "Users can read own entries"
  ON public.feeding_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own entries"
  ON public.feeding_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own entries"
  ON public.feeding_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own entries"
  ON public.feeding_entries FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS feeding_entries_user_timestamp_idx
  ON public.feeding_entries(user_id, timestamp DESC);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feeding_entries TO authenticated;

-- If you want to migrate data from feedin_logs to feeding_entries:
-- (Uncomment if you have existing data to migrate)
/*
INSERT INTO public.feeding_entries (date, time, amount, comment, timestamp, created_at)
SELECT
  date::TEXT,
  time::TEXT,
  amount::INTEGER,
  comment,
  EXTRACT(EPOCH FROM (date + time))::BIGINT * 1000,
  created_at
FROM public.feedin_logs;
*/
