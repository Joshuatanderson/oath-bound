# Skills standard

## Author
- wallet
- name
- company

## Legal ID
  <!--This is doing a lot of lifting. We want to ensure that we're not bound to a specific implementation of Persona. Also we want to ensure that this works properly across different jurisdictions where legal ID fields may be different. Unsure how complex this actually is to figure out what are the right ones across different jurisdictions. -->
 - sha256 (legal fields, skip persona internals)
 - 
  attestation_type: enum {SKILL, AUDIT, AUTHOR, PERSONA_ID}
  subject:      bytes32  // deterministic hash of the entity
  claim:        string   // what's being claimed
  content_hash: bytes32  // hash of content at time of claim
  ref:          bytes32  // evidence, prev version, etc. null if none
  uri:          string   // retrieval hint. null if none

## skill.md: 
---
name (required):	Yes	Max 64 characters. Lowercase letters, numbers, and hyphens only. Must not start or end with a hyphen.
description (required):	Yes	Max 1024 characters. Non-empty. Describes what the skill does and when to use it.
license (required): pull from SPDX. Apache-2.0 should be default. (more protective for consumers than MIT). Don't need all of them. 
  MIT, Apache-2.0, BSD-2-Clause, GPL-3.0-only, AGPL-3.0-only, ISC, Unlicense (public domain equivalent), BUSL-1.1 and proprietary, BSD-3-Clause, MPL-2.0. For launch, all will just be apache-2.0
compatibility(not required):	Max 500 characters. Indicates environment requirements (intended product, system packages, network access, etc.).
allowed-tools(not required):	Space-delimited list of pre-approved tools the skill may use. (Experimental)

Actual skill standard from anthropic below

skill-name/
├── SKILL.md          (required)
├── scripts/          (optional)
├── references/       (optional)
└── assets/           (optional)
