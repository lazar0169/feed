-- Add notifications_enabled column to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT true;

-- Add comment to explain the column
COMMENT ON COLUMN public.user_settings.notifications_enabled IS
'Whether browser notifications are enabled. When false, countdown is still shown but no notifications are sent.';
