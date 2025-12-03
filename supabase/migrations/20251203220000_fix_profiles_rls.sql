-- Allow anyone to read profiles for login (username -> email lookup)
-- This is needed so unauthenticated users can look up their email from username during login
CREATE POLICY "Anyone can read profiles for login"
  ON public.profiles FOR SELECT
  USING (true);
