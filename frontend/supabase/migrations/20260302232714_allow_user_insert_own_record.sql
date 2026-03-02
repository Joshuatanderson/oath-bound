-- Allow authenticated users to insert their own row into the users table
CREATE POLICY "Users can insert their own record"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow users to read their own record
CREATE POLICY "Users can read their own record"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
