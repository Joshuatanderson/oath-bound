-- 1. Create licenses reference table
CREATE TABLE public.licenses (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  is_open_source boolean NOT NULL DEFAULT true
);

-- 2. Seed all 11 current enum values
INSERT INTO public.licenses (id, display_name, is_open_source) VALUES
  ('MIT',            'MIT License',                    true),
  ('APACHE-2.0',     'Apache License 2.0',             true),
  ('BSD-2-CLAUSE',   'BSD 2-Clause License',           true),
  ('BSD-3-CLAUSE',   'BSD 3-Clause License',           true),
  ('GPL-3.0-ONLY',   'GNU GPL v3.0',                   true),
  ('AGPL-3.0-ONLY',  'GNU AGPL v3.0',                  true),
  ('ISC',            'ISC License',                     true),
  ('UNLICENSE',      'The Unlicense',                   true),
  ('MPL-2.0',        'Mozilla Public License 2.0',      true),
  ('BUSL-1.1',       'Business Source License 1.1',     false),
  ('PROPRIETARY',    'Proprietary',                     false);

-- 3. RLS: publicly readable, no writes
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Licenses are publicly readable"
  ON public.licenses FOR SELECT TO anon, authenticated USING (true);

-- 4. Convert skills.license from enum to text
ALTER TABLE public.skills ADD COLUMN license_text text;
UPDATE public.skills SET license_text = license::text;
ALTER TABLE public.skills ALTER COLUMN license_text SET NOT NULL;
ALTER TABLE public.skills DROP COLUMN license;
ALTER TABLE public.skills RENAME COLUMN license_text TO license;

-- 5. FK from skills.license -> licenses.id
ALTER TABLE public.skills
  ADD CONSTRAINT skills_license_fkey
  FOREIGN KEY (license) REFERENCES public.licenses(id);

-- 6. Drop old enum
DROP TYPE IF EXISTS public.license_type;

-- 7. Add original_author column
ALTER TABLE public.skills ADD COLUMN original_author text;

-- 8. Trigger to enforce: original_author requires open-source license
CREATE OR REPLACE FUNCTION check_original_author_license()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.original_author IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.licenses
      WHERE id = NEW.license AND is_open_source = true
    ) THEN
      RAISE EXCEPTION 'original_author can only be set for open-source licenses';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_original_author
  BEFORE INSERT OR UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION check_original_author_license();
