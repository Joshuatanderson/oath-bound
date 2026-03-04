-- Harden RLS policies:
-- 1. Audits: require auditor role for INSERT and UPDATE
-- 2. Skills: require approved identity verification (persona_hash) for INSERT
-- 3. Users: allow self-update, prevent role changes by non-service-role

BEGIN;

-- ============================================================
-- 1. AUDITS: gate INSERT on auditor role
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can insert own audits" ON public.audits;

CREATE POLICY "Auditors can insert own audits"
  ON public.audits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploader = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid()
        AND role = 'AUDITOR'
    )
  );

-- Gate UPDATE on auditor role + own audit
CREATE POLICY "Auditors can update own audits"
  ON public.audits
  FOR UPDATE
  TO authenticated
  USING (
    uploader = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid()
        AND role = 'AUDITOR'
    )
  )
  WITH CHECK (
    uploader = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid()
        AND role = 'AUDITOR'
    )
  );

-- ============================================================
-- 2. SKILLS: require approved persona verification for INSERT
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can insert their own skills" ON public.skills;

CREATE POLICY "Verified users can insert own skills"
  ON public.skills
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT id FROM public.users WHERE user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.identity_verifications iv
      JOIN public.users u ON u.id = iv.user_id
      WHERE u.user_id = auth.uid()
        AND iv.status = 'approved'
        AND iv.persona_hash IS NOT NULL
    )
  );

-- ============================================================
-- 3. USERS: allow self-update (display_name, etc.)
--    username_immutable trigger already prevents username changes.
--    New trigger prevents role changes by non-service-role.
-- ============================================================
CREATE POLICY "Users can update own record"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Prevent role changes except by service_role
CREATE OR REPLACE FUNCTION prevent_role_self_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_setting('role') != 'service_role' THEN
      RAISE EXCEPTION 'Only administrators can change user roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_role_change ON public.users;
CREATE TRIGGER trg_prevent_role_change
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_self_update();

COMMIT;
