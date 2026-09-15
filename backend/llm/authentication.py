"""Allowlisted, privacy-minimized observations from webmail sender details."""
import re


def minimize_authentication(value, provider):
    if not isinstance(value, dict) or provider not in {"gmail", "outlook", "yahoo"}:
        return {}
    if value.get("source") not in {"SENDER_DETAILS", "MESSAGE_HEADERS"}:
        return {}
    result = {"source": value["source"], "provider": provider}
    for key in ("mailed_by", "signed_by", "spf_domain", "dkim_domain", "dmarc_domain"):
        domain = str(value.get(key) or "").strip().lower().rstrip(".")
        if len(domain) <= 253 and re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?", domain):
            result[key] = domain
    for key in ("spf", "dkim", "dmarc"):
        status = str(value.get(key) or "").lower()
        if status in {"pass", "fail", "softfail", "neutral", "none", "temperror", "permerror"}:
            result[key] = status
    return result if len(result) > 2 else {}
