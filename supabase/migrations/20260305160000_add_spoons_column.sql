-- Add spoons column for measuring solid food by spoons (alternative to grams)
ALTER TABLE public.feeding_entries
ADD COLUMN IF NOT EXISTS spoons INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN public.feeding_entries.spoons IS 'Number of spoons eaten (only for type=solid, alternative to amount in grams)';
