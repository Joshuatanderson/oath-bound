# Codebase Audit Issues

Results from parallel grug-refactor, red-team security, and simplicity/correctness reviews.

---

## Critical Bugs

### Issue 1: Downloads endpoint is unauthenticated and uses admin client
**File:** `frontend/app/api/downloads/route.ts`
**Severity:** Critical

The downloads POST endpoint has zero authentication. It uses `getAdminClient()` (service-role, bypasses RLS) to insert records. Anyone can POST arbitrary download counts for any skill or agent ID, inflating download rankings.

**Fix:** Add auth or IP-based rate limiting. Stop using admin client; add an INSERT RLS policy instead.

---

### ~~Issue 2: Agents POST missing identity verification~~ ✅
**File:** `frontend/app/api/agents/route.ts` (lines 246-280)
**Severity:** Critical
**Status:** Fixed in 1caa7ba — extracted shared `identityVerifiedGate()` utility, added to agents POST.

---

### ~~Issue 3: PII logging in verify endpoint~~ ✅
**File:** `frontend/app/api/verify/route.ts` (line 85)
**Severity:** Critical
**Status:** Fixed in 1caa7ba — removed full Persona response logging.

---

### Issue 4: `readEntries` browser API only reads first batch
**File:** `frontend/app/submit/page.tsx` (lines 152-155, 166-170)
**Severity:** High

`FileSystemDirectoryReader.readEntries()` does not guarantee all entries in one call. The code calls it once, so directories with many files silently drop entries during skill upload.

**Fix:** Loop until an empty batch is returned.

---

### Issue 5: No-op ternary in content-hash
**File:** `frontend/lib/content-hash.ts` (line 34)
**Severity:** Low

```js
.update(typeof f.content === "string" ? f.content : f.content)
```

Both branches are identical. Not broken, but confusing.

**Fix:** Replace with `.update(f.content)`.

---

### Issue 6: Remove bogus `i` and `npm` packages
**File:** `frontend/package.json`
**Severity:** Low

`"i": "^0.3.7"` and `"npm": "^11.11.0"` are accidental installs. The `i` package is a dummy inflection library; `npm` should not be a dependency.

**Fix:** `bun remove i npm`

---

## Security Hardening

### Issue 7: Session state files world-readable in /tmp
**File:** `cli/verify.ts` (lines 23-25)
**Severity:** High

Session state written to `/tmp/oathbound-{sessionId}.json` with no restrictive file permissions. Path is predictable. Any local user can read verified skill hashes and directory paths, or modify the file to mark malicious skills as verified (TOCTOU).

**Fix:** Write with mode `0o600`. Consider moving to `~/.oathbound/sessions/`.

---

### Issue 8: Error messages leak internal details
**Files:** `skills/route.ts`, `agents/route.ts`, `audits/route.ts`
**Severity:** Medium

Raw Supabase and Pinata error messages are returned in HTTP responses:
- `"Storage upload failed: ${uploadError.message}"`
- `"Query failed: ${error.message}"`
- `"IPFS upload failed: ${pinataError}"`

These could reveal database schema, storage bucket names, or infrastructure details.

**Fix:** Log detailed errors server-side; return generic error messages to clients.

---

### Issue 9: Chain failure doesn't block identity verification
**File:** `frontend/app/api/verify/route.ts` (lines 144-156)
**Severity:** Medium

If on-chain attestation fails, the code logs but continues, saving `status: "approved"` to DB without chain proof. This undermines the chain-of-trust model.

**Fix:** Either block on chain failure (return 500) or add a `chain_attested` boolean column to track this.

---

### Issue 10: TOCTOU race on version conflict check
**Files:** `skills/route.ts`, `agents/route.ts`
**Severity:** Medium

Version conflict checking is check-then-act. Between the check and insert, a concurrent request could insert the same version. The UNIQUE constraint prevents corruption, but the error surfaces as a 500 instead of a proper 409 Conflict.

**Fix:** Catch Postgres error code `23505` in the insert handler, return 409.

---

## Code Deduplication

### Issue 11: Extract shared API utilities
**Files:** `frontend/app/api/skills/route.ts`, `frontend/app/api/agents/route.ts`
**Severity:** Medium

These three functions are identical in both route files:
- `escapeIlike()` (skills lines 18-23, agents lines 16-21)
- `getClientFromRequest()` (skills lines 168-182, agents lines 230-244)
- Verified-author ternary (skills lines 143-145, agents lines 170-178)

**Fix:** Extract to `frontend/lib/api-utils.ts`.

---

### Issue 12: Duplicated bypass handler in submit page
**File:** `frontend/app/submit/page.tsx` (lines 344-379)
**Severity:** Low

Identical fetch/then/catch/finally chain for bypass password appears twice -- once in `onKeyDown` (lines 348-359) and once in `onClick` (lines 365-379).

**Fix:** Extract a single `handleBypass()` function.

---

### Issue 13: Dead else branch in submit page
**File:** `frontend/app/submit/page.tsx` (lines 680-694)
**Severity:** Low

Step 2 is only reachable when `verified === true` (gated at line 545). The `!verified` else branch rendering a disabled button can never execute.

**Fix:** Remove the dead branch.

---

### Issue 14: 9 identical `.catch()` blocks in CLI
**File:** `cli/cli.ts` (lines 550-611)
**Severity:** Low

Every subcommand has the same 3-line catch handler:
```js
await someCommand().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : 'Unknown error';
  fail('Label', msg);
});
```

Repeated 9 times with only the label string varying.

**Fix:** Extract `runCommand(label, fn)` helper.

---

### Issue 15: `agentToMeta()` exists but not used in agents POST
**Files:** `frontend/lib/agent-validator.ts` (lines 139-162), `frontend/app/api/agents/route.ts` (lines 329-349)
**Severity:** Low

The route rebuilds meta inline with the exact same field-by-field conditional assignments that `agentToMeta()` already implements.

**Fix:** Use `agentToMeta()` instead of reimplementing.

---

### Issue 16: CLI constants duplicated
**Files:** `cli/cli.ts` (lines 38-39), `cli/auth.ts` (lines 12-13)
**Severity:** Low

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are hardcoded identically in two files.

**Fix:** Extract to `cli/constants.ts`.

---

### Issue 17: `verify.ts` repeated warn/deny branching
**File:** `cli/verify.ts` (lines 480-506)
**Severity:** Low

The pattern `if (enforcement === 'warn') { warnSkill(...) } else { denySkill(...) }` appears 3 times. Also, line 488 uses `skillDir!` non-null assertion after a guard that calls `process.exit` but TypeScript can't prove exhaustiveness.

**Fix:** Extract `enforceSkill(name, reason, enforcement)` helper. Restructure early returns to eliminate the `!` assertion.

---

## Nice-to-Have Improvements

### Issue 18: Skills GET has no query limit
**File:** `frontend/app/api/skills/route.ts` (lines 36-55)
**Severity:** Medium

No `.limit()` on the initial query -- loads ALL public skills into memory for JS-side deduplication. Agents route has `.limit(1000)`.

**Fix:** Add `.limit(1000)` to match agents.

---

### Issue 19: 16 useState calls in submit page
**File:** `frontend/app/submit/page.tsx`
**Severity:** Low

16 separate `useState` hooks for form fields, submit state, and bypass state. Adding a new field requires updating both `goToReview()` and `reset()`.

**Fix:** Consolidate into 3-4 grouped state objects.

---

### Issue 20: Supabase clients not memoized
**Files:** `frontend/lib/supabase.client.ts`, `frontend/lib/supabase.admin.ts`
**Severity:** Low

Both `getBrowserClient()` and `getAdminClient()` create new client instances on every call.

**Fix:** Module-level singleton pattern.

---

### ~~Issue 21: `shadcn` in wrong dependency category~~ ✅
**File:** `frontend/package.json`
**Severity:** Low
**Status:** Fixed in 8d24c4c

Moved `shadcn` from `dependencies` to `devDependencies`.

---

### ~~Issue 22: `expires_at!` non-null assertion in CLI auth~~ ✅
**File:** `cli/auth.ts` (line 195)
**Severity:** Low
**Status:** Fixed in fae0c79 — replaced `!` with `?? Math.floor(Date.now() / 1000) + 3600`.

---

## Noted for Future (Out of Scope)

- **Shared modules between cli/ and frontend/**: `semver.ts`, `content-hash.ts`, `parseFrontmatter` are duplicated across both. Requires build pipeline changes.
- **Full GET/POST handler deduplication**: Skills and agents routes share ~90% of GET logic and significant POST boilerplate. Large refactor.
- **Rate limiting infrastructure**: No rate limiting on any endpoint. Needs Upstash/Redis.
- **CLI auth token flow**: Tokens sent as URL params to localhost. Should use auth code exchange pattern.
- **Atomic publish pipeline**: Storage -> chain -> DB is non-atomic. Orphaned on-chain attestations possible if DB insert fails.
- **`proxy.ts` middleware**: Defines auth middleware but no `middleware.ts` wires it up. May be intentionally unused.
- **Recursive skills dir search** in `cli/verify.ts`: Searches 5 levels deep, could traverse unexpected dirs.
