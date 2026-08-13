from __future__ import annotations

import ast
import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class ProjectInvariantTests(unittest.TestCase):
    def test_frozen_model_constants_are_unchanged(self) -> None:
        server = read("backend/server.py")
        self.assertRegex(server, r"EMAIL_THRESHOLD\s*=\s*0\.05\b")
        self.assertRegex(server, r"EMAIL_MAX_LENGTH\s*=\s*256\b")
        self.assertRegex(server, r"URL_THRESHOLD\s*=\s*0\.6800401751682739\b")

    def test_url_detector_uses_address_bar_url_only(self) -> None:
        worker = read("extension/background/service-worker.js")
        self.assertIn("url:\n                currentUrl", worker)
        self.assertIn("current_url:\n                currentUrl", worker)
        self.assertNotIn("payload.links", worker)
        self.assertNotIn("document.querySelectorAll(\"a", worker)
        server = read("backend/server.py")
        self.assertIn('"CURRENT_ADDRESS_BAR_URL_ONLY"', server)

    def test_email_detector_provider_scope_is_unchanged(self) -> None:
        server = read("backend/server.py")
        for provider in ("gmail", "outlook", "yahoo"):
            self.assertIn(f'"{provider}"', server)
        manifest = json.loads(read("extension/manifest.json"))
        hosts = set(manifest["host_permissions"])
        self.assertIn("https://mail.google.com/*", hosts)
        self.assertIn("https://mail.yahoo.com/*", hosts)
        self.assertIn("https://outlook.live.com/*", hosts)

    def test_no_embedded_email_link_analysis_is_reintroduced(self) -> None:
        sources = [
            read("backend/server.py"),
            read("extension/background/service-worker.js"),
            read("extension/content/gmail-extractor.js"),
            read("extension/content/outlook-extractor.js"),
            read("extension/content/yahoo-extractor.js"),
        ]
        combined = "\n".join(sources)
        for prohibited in ("extractEmailLinks", "score_email_links", "payload.links"):
            self.assertNotIn(prohibited, combined)

    def test_raw_email_body_is_not_logged(self) -> None:
        for path in (ROOT / "backend").rglob("*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                function_name = ""
                if isinstance(node.func, ast.Name):
                    function_name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    function_name = node.func.attr
                if function_name not in {"print", "debug", "info", "warning", "error", "exception"}:
                    continue
                rendered = " ".join(ast.unparse(arg) for arg in node.args)
                self.assertNotRegex(rendered, r"\b(?:request|payload)\.body\b")

        for relative in (
            "extension/background/service-worker.js",
            "extension/content/gmail-extractor.js",
            "extension/content/outlook-extractor.js",
            "extension/content/yahoo-extractor.js",
        ):
            source = read(relative)
            self.assertIsNone(
                re.search(
                    r"console\.(?:log|info|warn|error|debug)\s*\([^;]{0,800}(?:payload|result)\.body",
                    source,
                    flags=re.DOTALL,
                )
            )

    def test_no_api_key_appears_in_extension_source(self) -> None:
        extension_source = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (ROOT / "extension").rglob("*")
            if path.is_file()
        )
        self.assertNotIn("GEMINI_API_KEY", extension_source)
        self.assertNotRegex(extension_source, r"AIza[0-9A-Za-z_-]{20,}")

    def test_cloud_reviews_are_always_on_without_toggles(self) -> None:
        worker = read("extension/background/service-worker.js")
        popup = read("extension/popup/popup.js")
        popup_html = read("extension/popup/popup.html")
        for removed in (
            "bantai_cloud_ai_review_enabled",
            "bantai_cloud_url_review_enabled",
            "cloudReviewToggle",
            "cloudUrlReviewToggle",
        ):
            self.assertNotIn(removed, worker)
            self.assertNotIn(removed, popup)
            self.assertNotIn(removed, popup_html)
        self.assertIn("fetchHybridEmail(\n        payload,\n        currentUrl,\n        true", worker)

    def test_url_cloud_review_is_always_on_origin_only_and_local_first(self) -> None:
        worker = read("extension/background/service-worker.js")
        server = read("backend/server.py")
        redaction = read("backend/llm/redaction.py")
        popup = read("extension/popup/popup.js")
        popup_html = read("extension/popup/popup.html")
        self.assertNotIn("bantai_cloud_url_review_enabled", worker)
        self.assertNotIn("bantai_cloud_url_review_enabled", popup)
        self.assertNotIn("cloudUrlReviewToggle", popup_html)
        self.assertIn("BANTAI_GET_CAPABILITIES", worker)
        self.assertIn("result.signal", worker)
        self.assertIn('"SUSPICIOUS"', worker)
        self.assertIn("result.final_result", worker)
        self.assertLess(
            worker.index("fetchUrlAnalysis(\n        currentUrl,\n        false"),
            worker.index("fetchUrlAnalysis(\n          currentUrl,\n          true"),
        )
        self.assertIn("cloud_ai_review: bool = False", server)
        self.assertIn("minimize_url_to_origin", redaction)
        self.assertIn("Only the website origin is being reviewed", worker)

    def test_url_ai_cannot_replace_raw_rf_signal(self) -> None:
        server = read("backend/server.py")
        popup = read("extension/popup/popup.js")
        self.assertIn("signal=\n            signal", server)
        self.assertIn("result.signal", popup)
        self.assertIn("fuse_url_signals", server)

    def test_url_cloud_result_is_fused_without_a_standalone_review_row(self) -> None:
        popup = read("extension/popup/popup.js")
        popup_html = read("extension/popup/popup.html")
        for removed in (
            "websiteAiReviewStatus",
            "websiteAiReviewMessage",
            "Cloud URL review",
            "conciseCloudUrlReviewMessage",
        ):
            self.assertNotIn(removed, popup)
            self.assertNotIn(removed, popup_html)
        self.assertIn("result.final_result", popup)
        self.assertIn("result.message", popup)
        self.assertIn('id="websiteModelSignal"', popup_html)

    def test_email_cloud_result_is_fused_without_a_standalone_ai_card(self) -> None:
        popup = read("extension/popup/popup.js")
        popup_html = read("extension/popup/popup.html")
        for removed in (
            "aiReviewCard",
            "aiReviewStatus",
            "aiReviewMessage",
            "AI REVIEW",
            "Additional context",
        ):
            self.assertNotIn(removed, popup)
            self.assertNotIn(removed, popup_html)
        self.assertIn("state?.fusion?.message", popup)
        self.assertIn('id="emailDecisionMessage"', popup_html)
        self.assertIn('id="emailModelSignal"', popup_html)

    def test_popup_shows_each_fused_decision_only_once(self) -> None:
        popup = read("extension/popup/popup.js")
        popup_html = read("extension/popup/popup.html")
        popup_css = read("extension/popup/popup.css")
        for removed in (
            "guidanceCard",
            "guidanceTitle",
            "guidanceMessage",
            "renderGuidance",
        ):
            self.assertNotIn(removed, popup)
            self.assertNotIn(removed, popup_html)
        self.assertNotIn(".guidance", popup_css)
        self.assertEqual(popup_html.count('id="websiteStatus"'), 1)
        self.assertEqual(popup_html.count('id="websiteMessage"'), 1)
        self.assertEqual(popup_html.count('id="emailFinalStatus"'), 1)
        self.assertEqual(popup_html.count('id="emailDecisionMessage"'), 1)

    def test_backend_env_is_auto_loaded_without_overriding_os_values(self) -> None:
        server = read("backend/server.py")
        requirements = read("backend/requirements.txt")
        self.assertIn("load_dotenv", server)
        self.assertIn('parent / ".env"', server)
        self.assertIn("override=False", server)
        self.assertIn("python-dotenv", requirements)

    def test_manual_popup_does_not_schedule_auto_close(self) -> None:
        popup = read("extension/popup/popup.js")
        initialize = popup[popup.index("async function initialize()") :]
        self.assertLess(initialize.index("configureAutoClose()"), initialize.index("BANTAI_REFRESH_ACTIVE_TAB"))
        self.assertEqual(popup.count("window.close()"), 1)
        auto_close = popup[
            popup.index("async function configureAutoClose()") :
            popup.index("chrome.storage.onChanged.addListener")
        ]
        self.assertIn("STORAGE_KEYS.autoPopup", auto_close)

    def test_detection_is_hidden_and_blocked_until_pairing_is_authenticated(self) -> None:
        server = read("backend/server.py")
        companion = read("backend/companion.py")
        worker = read("extension/background/service-worker.js")
        popup = read("extension/popup/popup.js")
        popup_html = read("extension/popup/popup.html")
        web_app = read("web/app/BantAIApp.tsx")

        self.assertIn("def require_detection_access", server)
        self.assertEqual(server.count("Depends(require_detection_access)"), 3)
        self.assertIn("def access_status", companion)
        self.assertIn('"detection_enabled": authenticated', companion)
        self.assertIn("async function checkDetectionAccess", worker)
        self.assertIn("async function clearDetectionState", worker)
        self.assertIn('"BANTAI_PAIRING_CHANGED"', worker)
        self.assertIn("new PairingRequiredError", worker)
        self.assertIn('id="detectionContent" class="detection-content hidden"', popup_html)
        self.assertIn("function setDetectionVisibility", popup)
        initialize = popup[popup.index("async function initialize()") :]
        self.assertLess(initialize.index("loadPairingState()"), initialize.index("loadStoredState()"))
        self.assertIn("Detection details remain hidden until pairing is verified.", web_app)
        self.assertIn("status && !status.extension.connected", web_app)

    def test_automatic_email_popup_waits_for_complete_cloud_result(self) -> None:
        worker = read("extension/background/service-worker.js")
        function = worker[worker.index("async function analyzeOpenedEmail") : worker.index("async function openFiveSecondPopup")]
        cloud_result = function.index("const cloudResult")
        popup_open = function.index("await openFiveSecondPopup")
        self.assertIn("/analyze-hybrid-email", worker)
        self.assertNotIn("await openFiveSecondPopup", function[:cloud_result])
        self.assertGreater(popup_open, cloud_result)
        self.assertIn("cloudReviewIsComplete", function[cloud_result:popup_open])
        self.assertIn("AUTO_POPUP_DURATION_MS =\n  5000", worker)

    def test_automatic_url_popup_waits_for_complete_cloud_result(self) -> None:
        worker = read("extension/background/service-worker.js")
        function = worker[worker.index("async function scanCurrentTabUrl") : worker.index("async function fetchHybridEmail")]
        cloud_result = function.index("const cloudResult")
        popup_open = function.index("await openFiveSecondPopup")
        self.assertNotIn("openFiveSecondPopup", function[:cloud_result])
        self.assertGreater(popup_open, cloud_result)
        self.assertIn("cloudReviewIsComplete", function[cloud_result:popup_open])

    def test_automatic_popup_is_not_reopened_by_focus_or_same_result(self) -> None:
        worker = read("extension/background/service-worker.js")
        popup = worker[worker.index("async function openFiveSecondPopup") : worker.index("async function injectProviderScript")]
        focus = worker[worker.index("chrome.windows.onFocusChanged") : worker.index("chrome.runtime.onMessage")]
        self.assertIn("automaticPopupStates", popup)
        self.assertIn("fingerprint_hash", popup)
        self.assertIn("storedPopup?.deadline", popup)
        self.assertIn('"window_focused",\n        false', focus)


if __name__ == "__main__":
    unittest.main()
