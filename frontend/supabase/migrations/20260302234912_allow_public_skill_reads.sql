-- Allow anyone (including unauthenticated users) to browse skills
CREATE POLICY "Skills are publicly readable"
  ON public.skills
  FOR SELECT
  TO anon, authenticated
  USING (true);
