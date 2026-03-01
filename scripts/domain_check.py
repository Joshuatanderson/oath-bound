#!/usr/bin/env python3
"""
Domain availability and pricing checker.

Uses two free APIs:
- RDAP (Registration Data Access Protocol) for availability/WHOIS data
- Porkbun pricing API for registration/renewal costs

Usage:
    python3 domain_check.py example.com coolstartup.io my-app.dev
    echo "example.com\ncoolstartup.io" | python3 domain_check.py --stdin
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.error
from typing import Optional


RDAP_BOOTSTRAP_URL = "https://rdap.org/domain/"
PORKBUN_PRICING_URL = "https://api.porkbun.com/api/json/v3/pricing/get"

# RDAP rate limit: 10 requests per 10 seconds via rdap.org
RDAP_DELAY = 1.1  # seconds between requests to stay well under limit


def fetch_json(url: str, method: str = "GET", data: Optional[bytes] = None,
               timeout: int = 15) -> tuple[Optional[dict], int]:
    """Fetch JSON from a URL. Returns (parsed_json, http_status)."""
    req = urllib.request.Request(url, method=method, data=data)
    req.add_header("Accept", "application/rdap+json, application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body), resp.status
    except urllib.error.HTTPError as e:
        return None, e.code
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        print(f"  [error] {url}: {e}", file=sys.stderr)
        return None, 0


def get_tld(domain: str) -> str:
    """Extract TLD from domain name (e.g., 'foo.co.uk' -> 'co.uk')."""
    parts = domain.lower().strip(".").split(".")
    if len(parts) < 2:
        return parts[-1]
    # Check for compound TLDs (co.uk, com.au, org.mx, etc.)
    compound = ".".join(parts[-2:])
    # Common compound TLD prefixes
    compound_prefixes = {
        "co", "com", "net", "org", "ac", "gov", "edu", "mil",
        "gen", "nom", "id", "in", "web"
    }
    if parts[-2] in compound_prefixes and len(parts) > 2:
        return compound
    return parts[-1]


def fetch_porkbun_pricing() -> dict:
    """Fetch full TLD pricing from Porkbun. Returns {tld: {registration, renewal, transfer}}."""
    data, status = fetch_json(PORKBUN_PRICING_URL, method="POST", data=b"{}")
    if data and data.get("status") == "SUCCESS":
        return data.get("pricing", {})
    print(f"  [warn] Porkbun pricing fetch failed (HTTP {status})", file=sys.stderr)
    return {}


def check_rdap(domain: str) -> dict:
    """
    Query RDAP for a domain. Returns a dict with:
    - available: True/False/None (None = couldn't determine)
    - status: list of domain status codes
    - registrar: registrar name
    - created: creation date
    - expires: expiration date
    - nameservers: list of nameservers
    """
    result = {
        "available": None,
        "status": [],
        "registrar": None,
        "created": None,
        "expires": None,
        "nameservers": [],
    }

    url = RDAP_BOOTSTRAP_URL + domain.lower()
    data, http_status = fetch_json(url)

    if http_status == 404:
        result["available"] = True
        return result

    if data is None:
        # Network error or unexpected status
        if http_status == 0:
            result["available"] = None  # couldn't reach server
        return result

    # Domain exists - it's taken
    result["available"] = False
    result["status"] = data.get("status", [])

    # Extract registrar name
    for entity in data.get("entities", []):
        if "registrar" in entity.get("roles", []):
            vcard = entity.get("vcardArray", [None, []])
            if len(vcard) > 1:
                for field in vcard[1]:
                    if field[0] == "fn":
                        result["registrar"] = field[3]
                        break

    # Extract dates from events
    for event in data.get("events", []):
        action = event.get("eventAction", "")
        date = event.get("eventDate", "")
        if action == "registration":
            result["created"] = date[:10] if date else None
        elif action == "expiration":
            result["expires"] = date[:10] if date else None

    # Extract nameservers
    for ns in data.get("nameservers", []):
        name = ns.get("ldhName", "")
        if name:
            result["nameservers"].append(name.lower())

    return result


def format_price(price_str: Optional[str]) -> str:
    """Format a price string nicely."""
    if price_str is None:
        return "N/A"
    try:
        return f"${float(price_str):.2f}"
    except (ValueError, TypeError):
        return price_str


def check_domains(domains: list[str]) -> list[dict]:
    """Check availability and pricing for a list of domains."""
    # Fetch Porkbun pricing once (covers all TLDs)
    print("Fetching TLD pricing from Porkbun...", file=sys.stderr)
    pricing = fetch_porkbun_pricing()
    tld_count = len(pricing)
    print(f"  Loaded pricing for {tld_count} TLDs", file=sys.stderr)

    results = []

    for i, domain in enumerate(domains):
        domain = domain.lower().strip()
        if not domain or "." not in domain:
            print(f"  [skip] Invalid domain: {domain}", file=sys.stderr)
            continue

        print(f"\nChecking {domain}... ({i+1}/{len(domains)})", file=sys.stderr)

        # Rate limiting for RDAP
        if i > 0:
            time.sleep(RDAP_DELAY)

        # RDAP lookup
        rdap = check_rdap(domain)

        # Get pricing for this TLD
        tld = get_tld(domain)
        tld_pricing = pricing.get(tld, {})

        result = {
            "domain": domain,
            "available": rdap["available"],
            "registration_price": tld_pricing.get("registration"),
            "renewal_price": tld_pricing.get("renewal"),
            "transfer_price": tld_pricing.get("transfer"),
            "coupons": tld_pricing.get("coupons", []),
            "registrar": rdap["registrar"],
            "created": rdap["created"],
            "expires": rdap["expires"],
            "status": rdap["status"],
            "nameservers": rdap["nameservers"],
            "tld": tld,
            "tld_pricing_available": bool(tld_pricing),
        }
        results.append(result)

    return results


def print_summary(results: list[dict]) -> None:
    """Print a human-readable summary table."""
    if not results:
        print("No results.")
        return

    # Header
    print("\n" + "=" * 80)
    print(f"{'DOMAIN':<30} {'STATUS':<12} {'REG PRICE':<12} {'RENEWAL':<12}")
    print("=" * 80)

    available = []
    taken = []
    unknown = []

    for r in results:
        if r["available"] is True:
            status = "AVAILABLE"
            available.append(r)
        elif r["available"] is False:
            status = "TAKEN"
            taken.append(r)
        else:
            status = "UNKNOWN"
            unknown.append(r)

        reg = format_price(r["registration_price"])
        ren = format_price(r["renewal_price"])

        print(f"{r['domain']:<30} {status:<12} {reg:<12} {ren:<12}")

    print("-" * 80)

    # Summary
    print(f"\nTotal: {len(results)} domains checked")
    print(f"  Available: {len(available)}")
    print(f"  Taken:     {len(taken)}")
    if unknown:
        print(f"  Unknown:   {len(unknown)}")

    # Detail on available domains
    if available:
        print("\n--- Available Domains ---")
        for r in available:
            reg = format_price(r["registration_price"])
            ren = format_price(r["renewal_price"])
            coupon_note = ""
            if r["coupons"]:
                coupon_note = f" (coupons available: {r['coupons']})"
            if r["tld_pricing_available"]:
                print(f"  {r['domain']}: register {reg}/yr, renew {ren}/yr{coupon_note}")
            else:
                print(f"  {r['domain']}: pricing not available for .{r['tld']} TLD")

    # Detail on taken domains
    if taken:
        print("\n--- Taken Domains ---")
        for r in taken:
            registrar = r["registrar"] or "unknown registrar"
            expires = r["expires"] or "unknown"
            print(f"  {r['domain']}: {registrar}, expires {expires}")


def print_json(results: list[dict]) -> None:
    """Print results as JSON."""
    print(json.dumps(results, indent=2))


def main():
    parser = argparse.ArgumentParser(
        description="Check domain availability and pricing via RDAP + Porkbun"
    )
    parser.add_argument("domains", nargs="*", help="Domain names to check")
    parser.add_argument("--stdin", action="store_true",
                        help="Read domains from stdin (one per line)")
    parser.add_argument("--json", action="store_true",
                        help="Output results as JSON")

    args = parser.parse_args()

    domains = list(args.domains)
    if args.stdin:
        for line in sys.stdin:
            line = line.strip()
            if line and not line.startswith("#"):
                domains.append(line)

    if not domains:
        parser.print_help()
        sys.exit(1)

    results = check_domains(domains)

    if args.json:
        print_json(results)
    else:
        print_summary(results)


if __name__ == "__main__":
    main()
