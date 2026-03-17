ALTER TABLE public.skills
  DROP CONSTRAINT skills_namespace_name_unique;

ALTER TABLE public.skills
  ADD CONSTRAINT skills_namespace_name_version_unique UNIQUE (namespace, name, version);
