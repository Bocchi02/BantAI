"""Synthetic tests for the explicit, SSRF-bounded website page fetcher."""

import unittest
from unittest.mock import patch

from shared_platform.app.website_fetch import (
    InvalidWebsiteAddress,
    WebsiteFetchError,
    _normal_url,
    _public_address,
    fetch_website,
)


class _Response:
    def __init__(self, status=200, body=b"", content_type="text/html"):
        self.status = status
        self.body = body
        self.content_type = content_type

    def getheader(self, name, default=""):
        return {"Content-Type": self.content_type}.get(name, default)

    def read(self, maximum):
        return self.body[:maximum]


class _Connection:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def request(self, *args, **kwargs):
        self.calls.append((args, kwargs))

    def getresponse(self):
        return self.response

    def close(self):
        pass


class WebsiteFetchTests(unittest.TestCase):
    def test_invalid_private_and_ambiguous_targets_are_rejected_before_dns(self):
        for address in (
            "http://127.0.0.1/",
            "http://localhost/",
            "https://metadata.google.internal/",
            "https://example.com:8443/",
            "https://user:pass@example.com/",
            "https://@example.com/",
            "file:///etc/passwd",
            "https://example.com\\@localhost/",
            "https://example.com/\x7fprivate",
        ):
            with self.subTest(address=address), self.assertRaises(InvalidWebsiteAddress):
                _normal_url(address)

    def test_dns_rejects_any_private_answer(self):
        answers = [
            (2, 1, 6, "", ("93.184.215.14", 443)),
            (2, 1, 6, "", ("10.0.0.4", 443)),
        ]
        with patch("shared_platform.app.website_fetch.socket.getaddrinfo", return_value=answers):
            with self.assertRaises(WebsiteFetchError):
                _public_address("example.com", 443)

    def test_fetches_only_the_exact_page_and_returns_origin(self):
        response = _Response(body=(
            b"<html><head><title>Example page</title><script>ignore me</script></head>"
            b"<body><h1>Welcome</h1><p>This is a public example page with enough "
            b"readable information to test the single-page content check. "
            b"It does not ask for a password or payment.</p></body></html>"
        ))
        connection = _Connection(response)
        with patch("shared_platform.app.website_fetch._public_address", return_value="93.184.215.14"), patch(
            "shared_platform.app.website_fetch._PinnedHTTPSConnection", return_value=connection
        ) as constructor:
            page = fetch_website("https://example.com/private/path?token=synthetic#section")
        constructor.assert_called_once_with("example.com", "93.184.215.14", 443)
        self.assertEqual("https://example.com", page.origin)
        self.assertEqual("Example page", page.title)
        self.assertIn("Welcome", page.visible_text)
        self.assertNotIn("ignore me", page.visible_text)
        self.assertEqual("/private/path?token=synthetic", connection.calls[0][0][1])
        self.assertEqual("identity", connection.calls[0][1]["headers"]["Accept-Encoding"])

    def test_redirect_is_not_followed(self):
        connection = _Connection(_Response(status=302))
        with patch("shared_platform.app.website_fetch._public_address", return_value="93.184.215.14"), patch(
            "shared_platform.app.website_fetch._PinnedHTTPSConnection", return_value=connection
        ):
            with self.assertRaisesRegex(WebsiteFetchError, "redirects"):
                fetch_website("https://example.com/")
        self.assertEqual(1, len(connection.calls))

    def test_unsupported_or_empty_content_never_gets_a_verdict(self):
        for response in (
            _Response(body=b"%PDF", content_type="application/pdf"),
            _Response(body=b"<html><body>tiny</body></html>"),
        ):
            with self.subTest(response=response.content_type), patch(
                "shared_platform.app.website_fetch._public_address", return_value="93.184.215.14"
            ), patch("shared_platform.app.website_fetch._PinnedHTTPSConnection", return_value=_Connection(response)):
                with self.assertRaises(WebsiteFetchError):
                    fetch_website("https://example.com/")

    def test_oversized_page_is_not_sent_for_review(self):
        response = _Response(body=b"a" * 262_145, content_type="text/plain")
        with patch("shared_platform.app.website_fetch._public_address", return_value="93.184.215.14"), patch(
            "shared_platform.app.website_fetch._PinnedHTTPSConnection", return_value=_Connection(response)
        ):
            with self.assertRaisesRegex(WebsiteFetchError, "too large"):
                fetch_website("https://example.com/")


if __name__ == "__main__":
    unittest.main()
