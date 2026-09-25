"""Bounded, one-page retrieval for an explicitly requested website check.

This is separate from the extension's address-bar detector. DNS answers are
checked before a connection is pinned to one public IP; redirects and page
subresources are never followed.
"""

from __future__ import annotations

import http.client
import ipaddress
import re
import socket
import ssl
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urlsplit, urlunsplit


MAX_URL_LENGTH = 2048
MAX_RESPONSE_BYTES = 262_144
MAX_VISIBLE_CHARS = 12_000
FETCH_TIMEOUT_SECONDS = 5
_HOST_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_CHARSET = re.compile(r"charset\s*=\s*['\"]?([a-z0-9_-]+)", re.IGNORECASE)
_SKIP_TAGS = {"script", "style", "template", "noscript", "svg", "iframe"}


class WebsiteFetchError(ValueError):
    """Safe, user-facing retrieval failure without reflecting the URL."""


class InvalidWebsiteAddress(WebsiteFetchError):
    """Rejected input before DNS or any network activity."""


@dataclass(frozen=True)
class WebsitePage:
    origin: str
    title: str
    visible_text: str
    truncated: bool


class _VisibleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title_parts: list[str] = []
        self.skipped: list[str] = []
        self.in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.skipped:
            self.skipped.append(tag)
        elif tag in _SKIP_TAGS:
            self.skipped.append(tag)
        elif tag == "title":
            self.in_title = True

    def handle_endtag(self, tag: str) -> None:
        if self.skipped:
            self.skipped.pop()
        elif tag == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.skipped:
            return
        if self.in_title:
            self.title_parts.append(data)
        elif data.strip():
            self.parts.append(data)


def _normal_url(value: str) -> tuple[str, str, int, str, str]:
    supplied = value.strip()
    if not supplied or len(supplied) > MAX_URL_LENGTH or any(ord(char) <= 32 or ord(char) == 127 for char in supplied):
        raise InvalidWebsiteAddress("Enter a valid website address up to 2,048 characters.")
    if "\\" in supplied:
        raise InvalidWebsiteAddress("Enter a standard HTTP or HTTPS website address.")
    if "://" not in supplied:
        supplied = f"https://{supplied}"
    try:
        parsed = urlsplit(supplied)
        port = parsed.port
        hostname = parsed.hostname
    except ValueError as exc:
        raise InvalidWebsiteAddress("Enter a valid website address.") from exc
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"} or not hostname or parsed.username is not None or parsed.password is not None:
        raise InvalidWebsiteAddress("Only public HTTP or HTTPS website addresses are supported.")
    expected_port = 443 if scheme == "https" else 80
    if port not in {None, expected_port}:
        raise InvalidWebsiteAddress("Only standard website ports are supported.")
    try:
        host = hostname.rstrip(".").encode("idna").decode("ascii").lower()
    except UnicodeError as exc:
        raise InvalidWebsiteAddress("Enter a valid public website hostname.") from exc
    if (
        len(host) > 253
        or "." not in host
        or any(not _HOST_LABEL.fullmatch(label) for label in host.split("."))
        or host.endswith((".local", ".localhost", ".internal", ".test", ".invalid", ".onion"))
    ):
        raise InvalidWebsiteAddress("Enter a public website hostname.")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise InvalidWebsiteAddress("Direct IP addresses are not supported.")
    path = parsed.path or "/"
    target = urlunsplit(("", "", path, parsed.query, ""))
    origin = f"{scheme}://{host}"
    return scheme, host, expected_port, target, origin


def _public_address(host: str, port: int) -> str:
    try:
        answers = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        addresses = list(dict.fromkeys(answer[4][0] for answer in answers))
    except (OSError, UnicodeError) as exc:
        raise WebsiteFetchError("This website could not be reached right now.") from exc
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise WebsiteFetchError("This page could not be retrieved as a public website.")
    return addresses[0]


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host: str, address: str, port: int) -> None:
        super().__init__(host, port=port, timeout=FETCH_TIMEOUT_SECONDS)
        self._pinned_address = address

    def connect(self) -> None:
        self.sock = socket.create_connection((self._pinned_address, self.port), self.timeout)


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, address: str, port: int) -> None:
        super().__init__(host, port=port, timeout=FETCH_TIMEOUT_SECONDS, context=ssl.create_default_context())
        self._pinned_address = address

    def connect(self) -> None:
        sock = socket.create_connection((self._pinned_address, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def fetch_website(value: str) -> WebsitePage:
    """Fetch exactly one public page without redirects, cookies, or subresources."""

    scheme, host, port, target, origin = _normal_url(value)
    address = _public_address(host, port)
    connection = (
        _PinnedHTTPSConnection(host, address, port)
        if scheme == "https" else _PinnedHTTPConnection(host, address, port)
    )
    try:
        connection.request(
            "GET",
            target,
            headers={
                "Host": host,
                "User-Agent": "Signalam-Website-Check/1.1",
                "Accept": "text/html, text/plain;q=0.9",
                "Accept-Encoding": "identity",
                "Connection": "close",
            },
        )
        response = connection.getresponse()
        if 300 <= response.status < 400:
            raise WebsiteFetchError("This page redirects elsewhere, so its content was not checked.")
        if response.status != 200:
            raise WebsiteFetchError("This page could not be retrieved for a content check.")
        content_type = response.getheader("Content-Type", "").lower()
        media_type = content_type.split(";", 1)[0].strip()
        if media_type not in {"text/html", "text/plain"}:
            raise WebsiteFetchError("This page does not provide readable HTML or plain text.")
        if response.getheader("Content-Encoding", "identity").lower() != "identity":
            raise WebsiteFetchError("This page uses an unsupported content encoding.")
        length = response.getheader("Content-Length", "")
        if length.isdigit() and int(length) > MAX_RESPONSE_BYTES:
            raise WebsiteFetchError("This page is too large for a private, bounded content check.")
        body = response.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            raise WebsiteFetchError("This page is too large for a private, bounded content check.")
    except WebsiteFetchError:
        raise
    except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
        raise WebsiteFetchError("This website could not be reached right now.") from exc
    finally:
        connection.close()

    match = _CHARSET.search(content_type)
    charset = match.group(1) if match else "utf-8"
    try:
        decoded = body.decode(charset, errors="replace")
    except LookupError:
        decoded = body.decode("utf-8", errors="replace")
    if media_type == "text/html":
        parser = _VisibleText()
        parser.feed(decoded)
        title = " ".join(" ".join(parser.title_parts).split())[:200]
        visible = " ".join(" ".join(parser.parts).split())
    else:
        title = ""
        visible = " ".join(decoded.split())
    if len(visible) < 80:
        raise WebsiteFetchError("There was not enough readable page text to assess. This can happen with sign-in or JavaScript-only pages.")
    return WebsitePage(origin=origin, title=title, visible_text=visible[:MAX_VISIBLE_CHARS], truncated=len(visible) > MAX_VISIBLE_CHARS)
