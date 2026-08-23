from __future__ import annotations

import ast
import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def read_web_interface() -> str:
    app_root = ROOT / "web" / "app"
    paths = sorted((*app_root.rglob("*.js"), *app_root.rglob("*.jsx")))
    return "\n".join(path.read_text(encoding="utf-8") for path in paths)


class ProjectInvariantTests(unittest.TestCase):
    def test_web_interface_uses_javascript_and_separate_route_views(self) -> None:
        web_root = ROOT / "web"
        typescript_sources = [
            path
            for pattern in ("*.ts", "*.tsx")
            for path in web_root.rglob(pattern)
            if not any(part in {"node_modules", "dist", ".next"} for part in path.parts)
        ]
        self.assertEqual(typescript_sources, [])

        view_root = web_root / "app" / "views"
        expected_views = {
            "LandingView.jsx",
            "AuthView.jsx",
            "DashboardView.jsx",
            "ActivityView.jsx",
            "MessageReviewView.jsx",
            "UrlReportsView.jsx",
            "EmailReportsView.jsx",
            "DevicesView.jsx",
            "ProfileView.jsx",
            "AdminOverviewView.jsx",
            "AdminUrlReportsView.jsx",
            "AdminEmailReportsView.jsx",
            "TrainingDataView.jsx",
            "UsersView.jsx",
        }
        self.assertEqual({path.name for path in view_root.glob("*.jsx")}, expected_views)

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
        web_app = read_web_interface()

        self.assertIn("def require_detection_access", server)
        self.assertEqual(server.count("Depends(require_detection_access)"), 5)
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

    def test_url_feedback_requires_explicit_confirmation_in_web_and_extension(self) -> None:
        popup = read("extension/popup/popup.js")
        popup_html = read("extension/popup/popup.html")
        server = read("backend/server.py")
        platform = read("shared_platform/app/main.py")
        web_app = read_web_interface()

        self.assertIn('id="reviewForm"', popup_html)
        self.assertIn('id="reviewSubmit" class="review-submit" type="submit" disabled', popup_html)
        self.assertNotRegex(popup_html, r'name="review(?:Verdict|Classification)"[^>]*\schecked')
        submit_handler = popup[
            popup.index('elements.reviewForm.addEventListener("submit"') :
            popup.index('elements.pairingForm.addEventListener("submit"')
        ]
        self.assertIn('/companion/url-feedback', submit_handler)
        self.assertIn('url: review.url', submit_handler)
        self.assertIn('confirmed: true', submit_handler)
        self.assertIn('BantAI Companion is unavailable', submit_handler)
        self.assertIn('feedbackErrorMessage(problem)', submit_handler)
        self.assertNotIn('/companion/url-feedback', popup[:popup.index('elements.reviewForm.addEventListener("submit"')])
        self.assertIn('confirmed: Literal[True]', server)
        self.assertIn('/api/v1/url-reports/from-device-activity', platform)
        self.assertIn('confirmed: true', web_app)
        self.assertNotIn('onClick={() => void submit("CORRECT")}', web_app)

    def test_email_training_reports_keep_bodies_encrypted_and_out_of_admin_responses(self) -> None:
        platform = read("shared_platform/app/main.py")
        schemas = read("shared_platform/app/schemas.py")
        web_app = read_web_interface()

        self.assertIn('confirmed: Literal[True]', schemas)
        self.assertIn('body_ciphertext=encrypt_text(body)', platform)
        self.assertNotIn('decrypt_text(report.body_ciphertext)', platform)
        self.assertNotIn('decrypt_text(candidate.body_ciphertext)', platform)
        self.assertIn('"body_included": bool(report.body_ciphertext)', platform)
        self.assertIn('/api/v1/admin/email-reports', platform)
        export_endpoint = platform[
            platform.index('@app.get("/api/v1/admin/training-data/export.csv")') :
            platform.index('@app.get("/api/v1/admin/url-reports")')
        ]
        self.assertIn('Depends(admin_user)', export_endpoint)
        self.assertIn('candidate_type: Literal["URL", "EMAIL"]', export_endpoint)
        self.assertIn('bantai-url-training-data', export_endpoint)
        self.assertIn('bantai-email-training-manifest', export_endpoint)
        self.assertIn('RESTRICTED_TRAINING_PROCESS_ONLY', export_endpoint)
        self.assertNotIn('decrypt_text(candidate.body_ciphertext)', export_endpoint)
        self.assertNotIn('body_fingerprint', export_endpoint)
        self.assertIn('Submit encrypted report', web_app)
        self.assertNotIn('body_ciphertext:', web_app)
        self.assertNotIn('body_fingerprint:', web_app)

    def test_extension_email_feedback_is_explicit_and_uses_the_current_opened_email(self) -> None:
        server = read("backend/server.py")
        platform = read("shared_platform/app/main.py")
        worker = read("extension/background/service-worker.js")
        popup = read("extension/popup/popup.js")
        popup_html = read("extension/popup/popup.html")
        gmail = read("extension/content/gmail-extractor.js")

        self.assertIn('id="emailReviewForm"', popup_html)
        self.assertIn('id="emailReviewConsent" type="checkbox"', popup_html)
        self.assertIn('id="emailReviewSubmit" class="review-submit" type="submit" disabled', popup_html)
        self.assertNotRegex(popup_html, r'name="emailReview(?:Verdict|Classification)"[^>]*\schecked')
        submit_handler = popup[
            popup.index('elements.emailReviewForm.addEventListener("submit"') :
            popup.index('elements.pairingForm.addEventListener("submit"')
        ]
        self.assertIn('BANTAI_SUBMIT_EMAIL_FEEDBACK', submit_handler)
        self.assertIn('confirmed: true', submit_handler)
        self.assertIn('emailReviewConsent.checked', submit_handler)
        self.assertNotIn('body:', submit_handler)
        self.assertIn('async function extractCurrentEmailForFeedback', worker)
        self.assertIn('buildEmailFingerprint(', worker)
        self.assertIn('/companion/email-feedback', worker)
        self.assertIn('body:\n              payload.body', worker)
        self.assertIn('BANTAI_GMAIL_GET_OPEN_EMAIL', gmail)
        self.assertIn('/companion/email-feedback', server)
        self.assertIn('/api/v1/email-reports/from-device-activity', platform)

    def test_dashboard_does_not_show_the_help_improve_card(self) -> None:
        dashboard = read("web/app/views/DashboardView.jsx")
        self.assertNotIn("DetectionFeedbackCard", dashboard)
        self.assertNotIn("HELP IMPROVE BANTAI", dashboard)

    def test_pasted_message_review_is_explicit_cloud_only_and_not_persisted(self) -> None:
        cloud = read("shared_platform/app/cloud.py")
        platform = read("shared_platform/app/main.py")
        schemas = read("shared_platform/app/schemas.py")
        web_app = read("web/app/views/MessageReviewView.jsx")

        self.assertIn('PASTED_MESSAGE_MODEL = "gemini-3.5-flash-lite"', cloud)
        self.assertIn('redact_text(message)', cloud)
        self.assertIn('fallback_model=""', cloud)
        endpoint = platform[
            platform.index('@app.post("/api/v1/message-review")') :
            platform.index('@app.post("/api/v1/cloud-review/url")')
        ]
        self.assertIn('Depends(csrf_protected)', endpoint)
        self.assertNotIn('db:', endpoint)
        self.assertNotIn('encrypt_text', endpoint)
        self.assertIn('confirmed: Literal[True]', schemas)
        page = web_app
        self.assertIn('type="checkbox"', page)
        self.assertIn('confirmed: true', page)
        self.assertIn('Analyze pasted text', page)
        self.assertIn('not a final BantAI email result', page)
        self.assertNotIn('localStorage', page)
        self.assertNotIn('sessionStorage', page)

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
