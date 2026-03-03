-- Delete duplicates, keeping the most recent row per (namespace, name)
DELETE FROM skills
WHERE id NOT IN (
  SELECT DISTINCT ON (namespace, name) id
  FROM skills
  ORDER BY namespace, name, created_at DESC
);

ALTER TABLE skills
  ADD CONSTRAINT skills_namespace_name_unique UNIQUE (namespace, name);
