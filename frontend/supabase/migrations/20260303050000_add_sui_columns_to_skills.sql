ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS sui_digest text,
  ADD COLUMN IF NOT EXISTS sui_object_id text;
