-- Store on-chain attestation for identity verifications
alter table public.identity_verifications
  add column sui_digest text,
  add column sui_object_id text;
