-- Add hash column for identity verification (stores SHA-256 of identity fields, not raw PII)
alter table public.identity_verifications
  add column persona_hash text;
