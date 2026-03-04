---
name: domain-check
description: Check domain name availability and pricing. Use when evaluating domain names for a new project, product, or company. Searches multiple TLDs and reports availability status.
license: MIT
---

# Domain Availability Checker

Check if domain names are available and get pricing estimates.

## When to use

- Brainstorming names for a new project or product
- Checking if a preferred domain is taken before committing to a name
- Comparing availability across TLDs (.com, .io, .dev, etc.)

## How to check

Use the `whois` command to check domain registration status:

```bash
whois example.com | grep -i "no match\|not found\|available"
```

### Batch checking

For multiple domains, check each one:

```bash
for domain in example.com example.io example.dev; do
  echo "--- $domain ---"
  whois "$domain" 2>/dev/null | grep -iE "registrar:|creation date:|no match|not found" | head -3
  echo ""
done
```

## Interpreting results

- **"No match"** or **"NOT FOUND"**: Domain is likely available
- **"Registrar:"** line present: Domain is registered
- **"Creation Date:"** shows when it was first registered
- **"Registry Expiry Date:"** shows when registration expires

## Common TLDs to check

| TLD | Best for |
|-----|----------|
| `.com` | Default choice, highest recognition |
| `.io` | Tech/developer products |
| `.dev` | Developer tools (requires HTTPS) |
| `.ai` | AI/ML products |
| `.app` | Applications (requires HTTPS) |
| `.co` | Startups, shorter alternative to .com |

## Tips

- Always check `.com` first — it's still the most trusted
- If `.com` is taken, check if it's parked or actively used
- Consider trademark conflicts, not just availability
- Shorter names are more valuable but harder to find
