"""
BantAI frozen Random Forest URL Model V4-B runtime feature extraction.

This module contains only the frozen V4-B inference feature pipeline.
It does not train, retune, or modify the Random Forest model.

User-facing mapping:
    internal label 0 -> SAFE URL signal
    internal label 1 -> SUSPICIOUS URL signal
"""

from __future__ import annotations

import ipaddress
import math
import re
from collections import Counter
from urllib.parse import parse_qsl, urlsplit

import tldextract


EXTRACT = tldextract.TLDExtract(
    suffix_list_urls=None
)

V4B_EXCLUDED_FEATURES = {
    "subdomain_length",
    "hostname_length",
    "path_length",
    "path_depth",
    "count_slash",
    "suspicious_keyword_count",
    "has_suspicious_keyword",
    "https_token_in_hostname",
    "http_token_in_path",
    "hostname_entropy",
    "count_dot",
    "num_subdomains",
    "digit_count",
    "digit_ratio",
}

SUSPICIOUS_WORDS = (
    "account", "auth", "banking", "claim", "confirm", "credential",
    "invoice", "login", "otp", "password", "payment", "prize",
    "recover", "reset", "reward", "secure", "signin", "support",
    "suspend", "unlock", "update", "verify", "verification", "wallet",
)

TOKEN_RE = re.compile(
    r"[A-Za-z0-9]+"
)


def entropy(text: str) -> float:
    if not text:
        return 0.0

    counts = Counter(text)
    total = len(text)

    return -sum(
        (count / total)
        * math.log2(
            count / total
        )
        for count in counts.values()
    )


def is_ip(hostname: str) -> int:
    try:
        ipaddress.ip_address(
            hostname.strip("[]")
        )
        return 1
    except ValueError:
        return 0


def extract_all_features(
    url: str,
) -> dict[str, float]:
    url = str(url).strip()
    target = (
        url
        if "://" in url
        else f"http://{url}"
    )

    parsed = urlsplit(
        target
    )

    scheme = parsed.scheme.lower()
    hostname = (
        parsed.hostname or ""
    ).lower()
    path = parsed.path or ""
    query = parsed.query or ""
    fragment = parsed.fragment or ""

    ext = EXTRACT(
        hostname
    )

    registered_domain = (
        ext.top_domain_under_public_suffix
        or hostname
    )

    subdomain = ext.subdomain or ""
    domain = ext.domain or ""
    suffix = ext.suffix or ""

    try:
        port = parsed.port
    except ValueError:
        port = None

    non_default_port = int(
        port is not None
        and not (
            (
                scheme == "http"
                and port == 80
            )
            or (
                scheme == "https"
                and port == 443
            )
        )
    )

    tokens = TOKEN_RE.findall(
        url.lower()
    )

    token_lengths = [
        len(token)
        for token in tokens
    ]

    digit_count = sum(
        character.isdigit()
        for character in url
    )

    letter_count = sum(
        character.isalpha()
        for character in url
    )

    special_count = sum(
        not character.isalnum()
        for character in url
    )

    host_digit_count = sum(
        character.isdigit()
        for character in hostname
    )

    host_letter_count = sum(
        character.isalpha()
        for character in hostname
    )

    url_length_denominator = max(
        len(url),
        1
    )

    host_length_denominator = max(
        len(hostname),
        1
    )

    suspicious_count = sum(
        url.lower().count(word)
        for word in SUSPICIOUS_WORDS
    )

    try:
        query_parameters = len(
            parse_qsl(
                query,
                keep_blank_values=True,
            )
        )
    except ValueError:
        query_parameters = (
            query.count("&")
            + (
                1
                if query
                else 0
            )
        )

    subdomain_count = len([
        part
        for part in subdomain.split(".")
        if part
    ])

    path_depth = len([
        part
        for part in path.split("/")
        if part
    ])

    return {
        "url_length":
            len(url),
        "hostname_length":
            len(hostname),
        "registered_domain_length":
            len(registered_domain),
        "subdomain_length":
            len(subdomain),
        "domain_length":
            len(domain),
        "tld_length":
            len(suffix),
        "path_length":
            len(path),
        "query_length":
            len(query),
        "fragment_length":
            len(fragment),
        "path_depth":
            path_depth,
        "query_param_count":
            query_parameters,
        "num_subdomains":
            subdomain_count,

        "uses_https":
            int(
                scheme == "https"
            ),
        "has_ip_address":
            is_ip(
                hostname
            ),
        "has_non_default_port":
            non_default_port,
        "has_punycode":
            int(
                "xn--" in hostname
            ),
        "has_at_symbol":
            int(
                "@" in url
            ),
        "has_encoded_char":
            int(
                "%" in url
            ),
        "double_slash_in_path":
            int(
                "//" in path
            ),

        "count_dot":
            url.count("."),
        "count_hyphen":
            url.count("-"),
        "count_underscore":
            url.count("_"),
        "count_slash":
            url.count("/"),
        "count_question":
            url.count("?"),
        "count_equal":
            url.count("="),
        "count_ampersand":
            url.count("&"),
        "count_percent":
            url.count("%"),
        "count_colon":
            url.count(":"),
        "count_semicolon":
            url.count(";"),
        "count_plus":
            url.count("+"),
        "count_tilde":
            url.count("~"),

        "digit_count":
            digit_count,
        "letter_count":
            letter_count,
        "special_count":
            special_count,
        "digit_ratio":
            digit_count
            / url_length_denominator,
        "letter_ratio":
            letter_count
            / url_length_denominator,
        "special_ratio":
            special_count
            / url_length_denominator,

        "hostname_digit_count":
            host_digit_count,
        "hostname_hyphen_count":
            hostname.count("-"),
        "hostname_digit_ratio":
            host_digit_count
            / host_length_denominator,
        "hostname_letter_ratio":
            host_letter_count
            / host_length_denominator,

        "url_entropy":
            entropy(
                url.lower()
            ),
        "hostname_entropy":
            entropy(
                hostname
            ),

        "token_count":
            len(tokens),
        "max_token_length":
            max(
                token_lengths,
                default=0
            ),
        "avg_token_length": (
            sum(token_lengths)
            / len(token_lengths)
            if token_lengths
            else 0
        ),

        "suspicious_keyword_count":
            suspicious_count,
        "has_suspicious_keyword":
            int(
                suspicious_count > 0
            ),
        "https_token_in_hostname":
            int(
                "https" in hostname
            ),
        "http_token_in_path":
            int(
                "http" in path.lower()
                or "https"
                in path.lower()
            ),
    }


def extract_v4b_features(
    url: str,
) -> dict[str, float]:
    features = extract_all_features(
        url
    )

    return {
        name:
            value
        for name, value
        in features.items()
        if name not in
        V4B_EXCLUDED_FEATURES
    }
