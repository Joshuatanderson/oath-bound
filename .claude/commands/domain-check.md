# Domain availability and pricing checker

Check domain availability via RDAP and registration pricing via Porkbun's free API. No API keys required.

## Usage

The user provides a list of domain names (in the argument, in conversation, or as a file). Run the checker script and present the results.

## How to execute

Run the domain checker script located at `$PROJECT_DIR/scripts/domain_check.py`. This script uses only Python standard library (no pip installs needed).

### For a list of domains:
```bash
python3 "$PROJECT_DIR/scripts/domain_check.py" domain1.com domain2.io domain3.dev
```

### For JSON output (useful for further processing):
```bash
python3 "$PROJECT_DIR/scripts/domain_check.py" --json domain1.com domain2.io
```

### From a file (one domain per line):
```bash
cat domains.txt | python3 "$PROJECT_DIR/scripts/domain_check.py" --stdin
```

## What it checks

1. **Availability**: Queries RDAP (the ICANN-mandated successor to WHOIS). A 404 response means the domain is available. A successful response means it's taken.
2. **Pricing**: Fetches Porkbun's full TLD price list (free, no auth). Returns registration, renewal, and transfer prices.
3. **WHOIS data** (for taken domains): Registrar name, creation date, expiration date, nameservers, and domain status codes.

## APIs used

| API | Purpose | Auth | Rate limit | Cost |
|-----|---------|------|------------|------|
| RDAP via rdap.org | Availability + WHOIS | None | 10 req/10s | Free |
| Porkbun pricing | TLD pricing | None | Reasonable | Free |

## Interpreting results

- **AVAILABLE**: RDAP returned 404 — the domain is not registered. Price shown is Porkbun's standard registration price.
- **TAKEN**: RDAP returned domain data. Shows registrar and expiration date.
- **UNKNOWN**: RDAP couldn't be reached or returned an unexpected response (common for some ccTLDs that don't support RDAP).

## Important notes

- RDAP coverage is excellent for gTLDs (.com, .net, .org, .io, .dev, etc.) but spotty for some ccTLDs.
- Prices are from Porkbun specifically — other registrars may charge differently.
- The script rate-limits RDAP queries to ~1/second to respect rdap.org's limits.
- Premium domains may cost more than the standard TLD price shown.
- A domain showing as "available" via RDAP should be confirmed at a registrar before purchasing — there's a small window where results could be stale.

## After presenting results

Summarize the findings in a clear table format. For available domains, highlight the best options based on price. For taken domains, note when they expire in case the user wants to watch them.

$ARGUMENTS
