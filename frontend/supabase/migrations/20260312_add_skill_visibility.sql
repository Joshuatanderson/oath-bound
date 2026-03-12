-- Add visibility column to skills
ALTER TABLE public.skills
  ADD COLUMN visibility text NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'private'));

-- Drop existing public-read policy
DROP POLICY IF EXISTS "Skills are publicly readable" ON public.skills;

-- New SELECT policy: public skills readable by anyone, private skills only by owner
CREATE POLICY "Skills are readable based on visibility" ON public.skills
  FOR SELECT USING (
    visibility = 'public'
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = skills.user_id
        AND u.user_id = auth.uid()
    )
  );
