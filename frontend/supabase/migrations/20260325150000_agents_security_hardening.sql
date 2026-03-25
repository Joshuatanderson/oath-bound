-- Security hardening for agents table:
-- 1. Re-add identity verification requirement for INSERT
-- 2. Add DELETE policy for owners
-- 3. Add namespace format CHECK constraint

-- 1. Replace the permissive INSERT policy with one requiring identity verification
DROP POLICY IF EXISTS "Authenticated users can insert own agents" ON public.agents;
DROP POLICY IF EXISTS "Verified users can insert own agents" ON public.agents;

CREATE POLICY "Verified users can insert own agents"
  ON public.agents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM public.users WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.identity_verifications iv
      JOIN public.users u ON u.id = iv.user_id
      WHERE u.user_id = auth.uid()
        AND iv.status = 'approved'
        AND iv.persona_hash IS NOT NULL
    )
  );

-- 2. Add DELETE policy for owners (no UPDATE — versions are immutable, publish a new one)
CREATE POLICY "Owners can delete own agents"
  ON public.agents
  FOR DELETE
  TO authenticated
  USING (
    user_id IN (SELECT id FROM public.users WHERE user_id = auth.uid())
  );

-- 3. Namespace format constraint — matches username rules (lowercase alphanum + hyphens)
ALTER TABLE public.agents
  ADD CONSTRAINT agents_namespace_format
  CHECK (
    char_length(namespace) BETWEEN 1 AND 64
    AND namespace ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  );

-- 4. Content hash must be valid SHA-256 hex
ALTER TABLE public.agents
  ADD CONSTRAINT agents_content_hash_format
  CHECK (content_hash ~ '^[a-f0-9]{64}$');
