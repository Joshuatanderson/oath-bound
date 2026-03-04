# storage
IPFS via pinata

## supabase
audits
──────────────────────────────
id            uuid        PK
skill_id      uuid        FK → skills.id
ipfs_cid      text        NOT NULL
report_hash   text        NOT NULL
audited_at    timestamptz
uploader      uuid        FK → users.id

## Chain
