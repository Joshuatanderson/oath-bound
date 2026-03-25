-- Simplify agents RLS: public reads, any authenticated user can insert

-- Drop existing policies
DROP POLICY IF EXISTS "Agents are readable based on visibility" ON public.agents;
DROP POLICY IF EXISTS "Verified users can insert own agents" ON public.agents;

-- SELECT: public agents readable by anyone, private only by owner
CREATE POLICY "Agents are readable based on visibility" ON public.agents
  FOR SELECT USING (
    visibility = 'public'
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = agents.user_id
        AND u.user_id = auth.uid()
    )
  );

-- INSERT: any authenticated user can insert their own agents
CREATE POLICY "Authenticated users can insert own agents" ON public.agents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT id FROM public.users WHERE user_id = auth.uid()
    )
  );
