-- Allow public read access to agent files in storage (matches skills bucket pattern)
DROP POLICY IF EXISTS "Public read access for agents" ON storage.objects;
CREATE POLICY "Public read access for agents"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'agents');
