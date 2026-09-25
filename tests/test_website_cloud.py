"""The opt-in website snapshot reaches the provider only after minimization."""

import unittest
from unittest.mock import patch

from backend.llm.schemas import LLMReview
from shared_platform.app.cloud import review_website_page
from shared_platform.app.website_fetch import WebsitePage


class WebsiteCloudTests(unittest.TestCase):
    def test_cloud_receives_origin_and_redacted_text_not_private_url(self) -> None:
        page = WebsitePage(
            origin="https://example.com",
            title="Welcome user@example.com to https://example.com/private-title?q=synthetic",
            visible_text=(
                "Contact user@example.com or open https://other.example/private?q=synthetic. "
                "This is an ordinary example page with a little more public text. "
            ) * 4,
            truncated=False,
        )
        result = LLMReview(
            assessment="NEEDS_CAUTION",
            confidence="LOW",
            indicators=[],
            reasoning_summary="The snapshot is too limited to verify the website.",
            recommended_action="Verify the address independently.",
        )
        with patch("shared_platform.app.cloud.GeminiProvider") as provider_type:
            provider = provider_type.return_value
            provider.available = True
            provider.review.return_value = result
            response = review_website_page(page)
        sent = provider.review.call_args.args[0]
        self.assertEqual("WEBSITE_PAGE", sent["analysis_type"])
        self.assertEqual("https://example.com", sent["url_origin"])
        self.assertNotIn("user@example.com", str(sent))
        self.assertNotIn("/private", str(sent))
        self.assertNotIn("/private-title", str(sent))
        self.assertNotIn("q=synthetic", str(sent))
        self.assertEqual("COMPLETE", response["status"])
        self.assertFalse(response["stored"])

    def test_provider_unavailable_never_returns_a_safe_verdict(self) -> None:
        page = WebsitePage("https://example.com", "Example", "Visible synthetic page text. " * 5, False)
        with patch("shared_platform.app.cloud.GeminiProvider") as provider_type:
            provider_type.return_value.available = False
            response = review_website_page(page)
        self.assertEqual("UNAVAILABLE", response["status"])
        self.assertIsNone(response["assessment"])
        self.assertFalse(response["stored"])


if __name__ == "__main__":
    unittest.main()
