-- Add type column for distinguishing between milk and solid food
-- Default to 'milk' for backwards compatibility with existing entries
ALTER TABLE public.feeding_entries
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'milk';

-- Add name column for solid food names (nullable, only used for solid entries)
ALTER TABLE public.feeding_entries
ADD COLUMN IF NOT EXISTS name TEXT;

-- Add a comment for documentation
COMMENT ON COLUMN public.feeding_entries.type IS 'Type of feeding: milk or solid';
COMMENT ON COLUMN public.feeding_entries.name IS 'Name of solid food (only for type=solid)';
