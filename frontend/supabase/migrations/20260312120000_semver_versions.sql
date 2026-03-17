-- Convert skills.version from integer to text semver

-- Step 1: Add a temporary text column
ALTER TABLE public.skills ADD COLUMN version_semver text;

-- Step 2: Migrate existing data: integer N -> "N.0.0"
UPDATE public.skills SET version_semver = version::text || '.0.0';

-- Step 3: Drop the old unique constraint
ALTER TABLE public.skills
  DROP CONSTRAINT skills_namespace_name_version_unique;

-- Step 4: Drop the old integer column
ALTER TABLE public.skills DROP COLUMN version;

-- Step 5: Rename new column
ALTER TABLE public.skills RENAME COLUMN version_semver TO version;

-- Step 6: Add NOT NULL and default
ALTER TABLE public.skills ALTER COLUMN version SET NOT NULL;
ALTER TABLE public.skills ALTER COLUMN version SET DEFAULT '0.1.0';

-- Step 7: Add CHECK constraint for semver format
ALTER TABLE public.skills
  ADD CONSTRAINT skills_version_semver_check
  CHECK (version ~ '^\d+\.\d+\.\d+$');

-- Step 8: Recreate unique constraint
ALTER TABLE public.skills
  ADD CONSTRAINT skills_namespace_name_version_unique UNIQUE (namespace, name, version);
