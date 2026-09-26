from __future__ import annotations

import ast
import json
import os
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
    def test_account_email_uses_gmail_smtp_only(self) -> None:
        mailer = read("shared_platform/app/account_mail.py")
        config = read("shared_platform/app/config.py")
        platform = read("shared_platform/app/main.py")
        privacy = read("web/app/views/PrivacyPolicyView.jsx")
        for relative in (
            ".env.example",
            "shared_platform/.env.example",
            "docker-compose.local.yml",
            "docker-compose.yml",
            "shared_platform/README.md",
        ):
            self.assertNotIn("RESEND_API_KEY", read(relative))
            self.assertNotIn("RESEND_FROM", read(relative))
        self.assertIn('smtplib.SMTP_SSL("smtp.gmail.com", 465', mailer)
        self.assertIn("ssl.create_default_context()", mailer)
        self.assertIn("gmail_smtp_app_password", config)
        self.assertIn("from .account_mail import MailDeliveryError, send_account_email", platform)
        self.assertIn("if not settings.email_delivery_ready:", platform)
        self.assertIn("Google processes", privacy)
        self.assertNotIn("resend_mail", platform)
        self.assertNotIn("api.resend.com", mailer)

    def test_remote_stack_keeps_detector_and_database_private(self) -> None:
        compose = read("docker-compose.yml")
        dockerfile = read("backend/Dockerfile")
        web_dockerfile = read("web/Dockerfile")
        dockerignore = read(".dockerignore")
        caddy = read("deploy/Caddyfile")

        self.assertIn("gateway:", compose)
        self.assertIn("web:", compose)
        self.assertIn("detector:", compose)
        self.assertIn("image: signalam-web:1.1.0", compose)
        self.assertIn("image: signalam-detector:1.1.0", compose)
        self.assertNotIn('"3000:3000"', compose)
        self.assertNotIn('"8000:8000"', compose)
        self.assertNotIn('"8080:8080"', compose)
        self.assertIn('"80:80"', compose)
        self.assertIn('"443:443"', compose)
        self.assertIn('BANTAI_REMOTE_SERVER_MODE: "true"', compose)
        self.assertIn("BANTAI_INTERNAL_API_KEY", compose)
        self.assertIn("internal: true", compose)
        self.assertIn("restart: unless-stopped", compose)
        self.assertIn("condition: service_healthy", compose)
        self.assertIn("model.safetensors.index.json", dockerfile)
        self.assertIn("calibration.json", dockerfile)
        self.assertIn("bantai_rf_grouped_v1.0.0.joblib", dockerfile)
        self.assertIn("https://download.pytorch.org/whl/cpu", dockerfile)
        self.assertNotIn("\ntorch\n", read("backend/requirements-detector.txt"))
        self.assertIn('"--no-access-log"', dockerfile)
        self.assertIn("request_body", caddy)
        self.assertIn("reverse_proxy platform:8080", caddy)
        self.assertIn("reverse_proxy web:3000", caddy)
        self.assertIn("BANTAI_WEB_DOMAIN", caddy)
        self.assertIn("BANTAI_ROOT_DOMAIN", caddy)
        self.assertIn('CMD ["node", "server.js"]', web_dockerfile)
        self.assertIn("/app/.next/standalone", web_dockerfile)
        self.assertIn("optimizer.pt", dockerignore)
        self.assertNotIn("!models/url_random_forest_v4b", dockerignore)

    def test_web_interface_uses_javascript_and_separate_route_views(self) -> None:
        web_root = ROOT / "web"
        generated_directories = {"node_modules", "dist", ".next", ".pnpm-store", ".vinext", ".wrangler"}
        typescript_sources = []
        for directory, subdirectories, filenames in os.walk(web_root):
            # Prune generated trees before descending. Filtering after Path.rglob
            # still traverses deeply nested package-manager layouts.
            subdirectories[:] = [
                name for name in subdirectories if name not in generated_directories
            ]
            for filename in filenames:
                path = Path(directory) / filename
                if path.suffix in {".ts", ".tsx"} and path.name != "next-env.d.ts":
                    typescript_sources.append(path)
        self.assertEqual(typescript_sources, [])

        view_root = web_root / "app" / "views"
        expected_views = {
            "LandingView.jsx",
            "AuthView.jsx",
            "AuthLayout.jsx",
            "RegisterView.jsx",
            "VerificationPendingView.jsx",
            "VerifyEmailView.jsx",
            "ForgotPasswordView.jsx",
            "ResetPasswordView.jsx",
            "DashboardView.jsx",
            "ActivityView.jsx",
            "MessageReviewView.jsx",
            "WebsiteCheckView.jsx",
            "PrivacyPolicyView.jsx",
            "UrlReportsView.jsx",
            "EmailReportsView.jsx",
            "DevicesView.jsx",
            "ProfileView.jsx",
            "AdminOverviewView.jsx",
            "AdminUrlReportsView.jsx",
            "AdminEmailReportsView.jsx",
            "TrainingDataView.jsx",
            "UsersView.jsx",
            "HelpView.jsx",
        }
        self.assertEqual({path.name for path in view_root.glob("*.jsx")}, expected_views)

    def test_admin_overview_uses_the_platform_dashboard_route(self) -> None:
        admin_overview = read("web/app/views/AdminOverviewView.jsx")
        platform = read("shared_platform/app/main.py")

        self.assertIn("/admin/dashboard?days=${days}", admin_overview)
        self.assertIn("Server models", admin_overview)
        self.assertIn("Cloud AI", admin_overview)
        self.assertIn('"service": {', platform)
        self.assertNotIn("/admin/overview?days=${days}", admin_overview)
        self.assertIn('@app.get("/api/v1/admin/dashboard")', platform)

    def test_devices_view_matches_the_platform_device_contract(self) -> None:
        devices_view = read("web/app/views/DevicesView.jsx")
        platform = read("shared_platform/app/main.py")

        self.assertIn("Array.isArray(data?.items)", devices_view)
        self.assertIn("setDevices(data.items)", devices_view)
        self.assertIn('api("/pairing", { method: "POST" })', devices_view)
        self.assertIn('api(`/devices/${deviceId}`, { method: "DELETE" })', devices_view)
        self.assertIn("device.label", devices_view)
        self.assertIn("device.last_seen_at", devices_view)
        self.assertNotIn("devices/pairing-codes", devices_view)
        self.assertNotIn("last_active_at", devices_view)
        self.assertIn('@app.get("/api/v1/devices")', platform)
        self.assertIn('@app.post("/api/v1/pairing"', platform)
        self.assertIn('@app.delete("/api/v1/devices/{device_id}"', platform)

    def test_training_data_view_normalizes_all_inventory_sections(self) -> None:
        training_view = read("web/app/views/TrainingDataView.jsx")
        platform = read("shared_platform/app/main.py")

        self.assertIn("function normalizeTrainingData(value)", training_view)
        self.assertIn("urls: collectionData(automatic.urls)", training_view)
        self.assertIn("emails: collectionData(automatic.emails)", training_view)
        self.assertIn("setData(normalizeTrainingData(response))", training_view)
        self.assertIn('"automatic_samples": {', platform)
        self.assertIn('"urls": {', platform)
        self.assertIn('"emails": {', platform)

    def test_extension_uses_plain_language_for_result_explanations(self) -> None:
        popup = read("extension/popup/popup.js")
        popup_html = read("extension/popup/popup.html")

        self.assertIn("function simpleWebsiteMessage(result)", popup)
        self.assertIn("function simpleEmailMessage(state, result)", popup)
        self.assertIn("simpleWebsiteMessage(finalResult)", popup)
        self.assertIn("simpleEmailMessage(state, fusionResult)", popup)
        self.assertIn("cloudReview.body_context_sent_to_provider === true", popup)
        self.assertIn("cloudReview.sender_context_sent_to_provider === true", popup)
        self.assertIn("cloudReview.subject_context_sent_to_provider === true", popup)
        self.assertIn("cloudReview.reasoning_summary", popup)
        self.assertIn('const inboundTransferNotice = category === "PAYMENT_REQUEST"', popup)
        self.assertIn('evidence.includes("transfer from:")', popup)
        self.assertNotIn("result.message || detector.message", popup)
        self.assertIn("This does not guarantee", popup)
        self.assertIn("Address only", popup_html)
        self.assertIn("It does not guarantee", popup_html)

    def test_extension_details_use_installed_detector_thresholds(self) -> None:
        popup = read("extension/popup/popup.js")

        self.assertIn('latestServerHealth?.url_detector', popup)
        self.assertIn('latestServerHealth?.email_detector', popup)
        self.assertIn('result.decision_threshold ?? result.threshold', popup)
        self.assertIn('function thresholdPercentage(value)', popup)
        self.assertIn('(value * 100).toFixed(4)', popup)
        self.assertIn('elements.websiteThreshold.title =', popup)
        self.assertIn('elements.emailThreshold.title =', popup)

    def test_frozen_model_constants_are_unchanged(self) -> None:
        server = read("backend/server.py")
        email_model = read("backend/email_model.py")
        calibration = json.loads(
            read(
                "models/email_text_xlmr_v2/"
                "full_taglish_xlmr_512_headtail_seed13/calibration.json"
            )
        )
        self.assertIn('"max_length": 512', email_model)
        self.assertIn('"truncation_strategy": "subject_head_tail"', email_model)
        self.assertIn("logits / contract.temperature", email_model)
        self.assertEqual(calibration["temperature"], 2.2198894341340183)
        self.assertEqual(calibration["suspicious_threshold"], 0.6923658179915227)
        self.assertRegex(server, r"URL_THRESHOLD\s*=\s*0\.547\b")

    def test_legacy_email_checkpoint_and_threshold_are_not_active(self) -> None:
        active_files = (
            "backend/server.py",
            "backend/Dockerfile",
            "backend/START_BANTAI_V1_1.ps1",
            "companion/app.py",
            "docker-compose.yml",
            "scripts/ENABLE_BANTAI_COMPANION_STARTUP.ps1",
            ".env.example",
        )
        for relative in active_files:
            with self.subTest(relative=relative):
                active_source = read(relative)
                self.assertNotIn("checkpoint-15666", active_source)
                self.assertNotRegex(
                    active_source,
                    r"\b0[.]378459(?:06615257263)?\b",
                )

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

    def test_extension_console_diagnostics_are_fixed_non_sensitive_events(self) -> None:
        """Console diagnostics must never carry message, identity, URL, or credential values."""

        sensitive_argument = re.compile(
            r"\b(?:page_url|location\.(?:href|search)|token|credential|"
            r"(?:result|payload|message|error)\s*\.)",
            flags=re.IGNORECASE,
        )
        call = re.compile(
            r"console\.(?:log|info|debug|warn|error)\s*\((.{0,1400}?)\)",
            flags=re.DOTALL,
        )
        for path in (ROOT / "extension").rglob("*.js"):
            source = path.read_text(encoding="utf-8")
            for match in call.finditer(source):
                self.assertIsNone(
                    sensitive_argument.search(match.group(1)),
                    f"Sensitive console argument in {path.relative_to(ROOT)}",
                )

    def test_no_api_key_appears_in_extension_source(self) -> None:
        extension_source = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (ROOT / "extension").rglob("*")
            if path.is_file()
        )
        self.assertNotIn("GEMINI_API_KEY", extension_source)
        self.assertNotRegex(extension_source, r"AIza[0-9A-Za-z_-]{20,}")

    def test_cloud_reviews_follow_email_always_and_url_warning_only_rules(self) -> None:
        worker = read("extension/background/service-worker.js")
        server = read("backend/server.py")
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
        self.assertIn("fetchHybridEmail(\n        payload,\n        currentUrl,\n        clientEventId", worker)
        self.assertIn('"/detections/email"', worker)
        hybrid = server[server.index("def analyze_hybrid_email("):]
        self.assertIn("if (\n        request.cloud_ai_review\n    )", hybrid)
        self.assertNotIn('email_model.signal == "SUSPICIOUS"', hybrid)
        self.assertIn("Cloud URL Review was not needed because the local URL model did not warn.", server)

    def test_url_cloud_review_is_always_on_origin_only_and_server_orchestrated(self) -> None:
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
        remote_scan = worker[
            worker.index("async function performCurrentTabUrlScan") :
            worker.index("async function scanCurrentTabUrl")
        ]
        self.assertEqual(1, remote_scan.count("await fetchUrlAnalysis("))
        self.assertIn("fetchUrlAnalysis(currentUrl, clientEventId)", remote_scan)
        self.assertIn('"/detections/url"', worker)
        self.assertIn("cloud_ai_review: bool = False", server)
        self.assertIn("minimize_url_to_origin", redaction)
        gateway = read("shared_platform/app/detector_gateway.py")
        self.assertIn('payload={"url": url, "cloud_ai_review": True}', gateway)

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
        self.assertIn("simpleWebsiteMessage(finalResult)", popup)
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
        self.assertIn("state?.fusion?.final_result", popup)
        self.assertIn("simpleEmailMessage(state, fusionResult)", popup)
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
        platform = read("shared_platform/app/main.py")
        dependencies = read("shared_platform/app/dependencies.py")
        worker = read("extension/background/service-worker.js")
        popup = read("extension/popup/popup.js")
        popup_html = read("extension/popup/popup.html")
        web_app = read_web_interface()

        self.assertIn("def require_detection_access", server)
        self.assertIn("REMOTE_SERVER_MODE", server)
        self.assertIn('alias="X-BantAI-Internal-Key"', server)
        self.assertIn("def current_device", dependencies)
        self.assertIn('@app.post("/api/v1/extension/pair")', platform)
        self.assertIn('@app.get("/api/v1/extension/status")', platform)
        self.assertIn("async function checkDetectionAccess", worker)
        self.assertIn("async function clearDetectionState", worker)
        self.assertIn('"BANTAI_PAIR_EXTENSION"', worker)
        self.assertIn('accessLevel: "TRUSTED_CONTEXTS"', worker)
        self.assertIn("Authorization: `Bearer ${token}`", worker)
        self.assertIn("new PairingRequiredError", worker)
        self.assertIn('id="detectionContent" class="detection-content hidden"', popup_html)
        self.assertIn("function setDetectionVisibility", popup)
        initialize = popup[popup.index("async function initialize()") :]
        self.assertLess(initialize.index("loadPairingState()"), initialize.index("loadStoredState()"))
        self.assertIn("Signing in alone does not activate detection.", web_app)
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
        self.assertIn('BANTAI_SUBMIT_URL_FEEDBACK', submit_handler)
        self.assertIn('url: review.url', submit_handler)
        self.assertIn('confirmed: true', submit_handler)
        self.assertIn('Signalam could not submit feedback', submit_handler)
        self.assertNotIn('/companion/url-feedback', popup)
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
        self.assertIn('signalam-url-training-data', export_endpoint)
        self.assertIn('signalam-email-training-manifest', export_endpoint)
        self.assertIn('RESTRICTED_TRAINING_PROCESS_ONLY', export_endpoint)
        self.assertNotIn('decrypt_text(candidate.body_ciphertext)', export_endpoint)
        self.assertNotIn('body_fingerprint', export_endpoint)
        self.assertIn('Submit encrypted report', web_app)
        self.assertNotIn('body_ciphertext:', web_app)
        self.assertNotIn('body_fingerprint:', web_app)

    def test_automatic_training_collection_requires_opt_in_and_keeps_sensitive_content_encrypted(self) -> None:
        models = read("shared_platform/app/models.py")
        schemas = read("shared_platform/app/schemas.py")
        platform = read("shared_platform/app/main.py")
        worker = read("extension/background/service-worker.js")
        profile = read("web/app/views/ProfileView.jsx")
        training = read("web/app/views/TrainingDataView.jsx")

        self.assertIn("training_collection_enabled", models)
        self.assertIn('class AutomaticTrainingSample', models)
        self.assertIn('body_ciphertext: Mapped[str | None]', models)
        self.assertIn('automatic_sample_decided_at', models)
        self.assertIn('automatic_sample_selected', models)
        self.assertIn('class TrainingConsentUpdateRequest', schemas)
        self.assertIn('if self.enabled and not self.confirmed', schemas)
        self.assertIn('@app.patch("/api/v1/training-consent")', platform)
        self.assertIn('body_ciphertext=encrypt_text(body)', platform)
        auto_view = platform[
            platform.index("def automatic_training_sample_view") :
            platform.index("def persist_url_activity_feedback")
        ]
        self.assertNotIn("decrypt_text(sample.body_ciphertext)", auto_view)
        sample_method = platform[
            platform.index("def _automatic_sample(") :
            platform.index("def _record_remote_detection(")
        ]
        self.assertIn('event.automatic_sample_decided_at is not None', sample_method)
        self.assertIn('secrets.randbelow(100) < AUTOMATIC_SAMPLE_RATE_PERCENT', sample_method)
        self.assertIn('current.user.training_collection_enabled', sample_method)
        self.assertIn('current.user.training_consent_version == TRAINING_CONSENT_VERSION', sample_method)
        self.assertIn('url_ciphertext=encrypt_text(complete_url)', sample_method)
        self.assertIn('body_ciphertext=encrypt_text(body)', sample_method)
        self.assertNotIn("outbox", sample_method.lower())
        self.assertIn('_automatic_sample(event=event, current=current, raw=raw, db=db)', platform)
        self.assertIn('if (result.automatic_collection)', worker)
        self.assertIn('if (hybridResult.automatic_collection)', worker)
        self.assertNotIn('/training-samples', worker)
        self.assertIn('I agree to automatic random training-data collection.', profile)
        self.assertIn('type="checkbox"', profile)
        self.assertIn('required', profile)
        self.assertIn('Stop collection and delete samples', profile)
        self.assertIn('Automatic URL samples', training)
        self.assertIn('Automatic email samples', training)
        self.assertIn('/admin/training-data/automatic-export.csv', training)
        self.assertIn('Export URL samples', training)
        self.assertIn('Export email samples', training)
        self.assertIn('Administrators cannot open, retrieve, or export', training)
        automatic_export = platform[
            platform.index('@app.get("/api/v1/admin/training-data/automatic-export.csv")') :
            platform.index('@app.get("/api/v1/admin/url-reports")')
        ]
        self.assertIn('Depends(admin_user)', automatic_export)
        self.assertIn('sample_type: Literal["URL", "EMAIL"]', automatic_export)
        self.assertIn('decrypt_text(sample.url_ciphertext)', automatic_export)
        self.assertNotIn('decrypt_text(sample.body_ciphertext)', automatic_export)
        self.assertIn('RESTRICTED_TRAINING_PROCESS_ONLY', automatic_export)

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
        self.assertIn('/email-reports/from-device-activity', worker)
        self.assertIn('await authenticatedFetch(', worker)
        feedback_function = worker[
            worker.index("async function submitCurrentEmailFeedback") :
            worker.index("async function submitCurrentUrlFeedback")
        ]
        initial_report = feedback_function[
            feedback_function.index("const reportPayload =") :
            feedback_function.index("let response =")
        ]
        self.assertIn('client_event_id:\n      clientEventId', initial_report)
        self.assertNotIn('body:', initial_report)
        self.assertIn('response.status === 428', feedback_function)
        self.assertIn('body: payload.body', feedback_function)
        self.assertIn('BANTAI_GMAIL_GET_OPEN_EMAIL', gmail)
        self.assertNotIn('/companion/email-feedback', worker)
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
        self.assertIn('not a final Signalam email result', page)
        self.assertNotIn('localStorage', page)
        self.assertNotIn('sessionStorage', page)

    def test_dashboard_activity_explanations_use_device_scoped_memory_only_full_context(self) -> None:
        platform = read("shared_platform/app/main.py")
        transient = read("shared_platform/app/transient_context.py")
        cloud = read("shared_platform/app/cloud.py")
        prompt = read("backend/llm/prompt_builder.py")
        models = read("shared_platform/app/models.py")
        dashboard = read("web/app/views/DashboardView.jsx")
        modal = read("web/app/components/DetectionDetailsModal.jsx")

        web_endpoint = platform[
            platform.index('@app.post("/api/v1/activities/{activity_id}/explanation")') :
            platform.index('@app.post("/api/v1/detections/{detection_id}/explanation")')
        ]
        device_endpoint = platform[
            platform.index('@app.post("/api/v1/detections/{detection_id}/explanation")') :
            platform.index('@app.post("/api/v1/cloud-review/activity-explanation")')
        ]
        explanation_helper = platform[
            platform.index("def _explain_completed_event(") :
            platform.index('@app.post("/api/v1/activities/{activity_id}/explanation")')
        ]
        self.assertIn('Depends(csrf_protected)', web_endpoint)
        self.assertIn('ActivityEvent.user_id == current.user.id', web_endpoint)
        self.assertIn('transient_detections.get(current.user.id, event.device_id, event.id)', web_endpoint)
        self.assertIn('Depends(current_device)', device_endpoint)
        self.assertIn('ActivityEvent.device_id == current.device.id', device_endpoint)
        self.assertIn('transient_detections.get(current.user.id, current.device.id, event.id)', device_endpoint)
        self.assertIn('"url_origin": decrypt_text(event.origin_encrypted)', explanation_helper)
        self.assertNotIn('"full_url":', explanation_helper)
        self.assertIn('"email_body": context.get("body", "")', explanation_helper)
        self.assertIn('"WEBSITE_ORIGIN_ONLY"', explanation_helper)
        self.assertIn('"EMAIL_PROVIDER_SENDER_SUBJECT_ONLY"', explanation_helper)
        self.assertIn('"context_status": "AVAILABLE" if full_context_available else "EXPIRED_OR_UNAVAILABLE"', explanation_helper)
        self.assertIn('redact_text(str(payload.get("sender")', cloud)
        self.assertIn('redact_text(str(payload.get("subject")', cloud)
        self.assertIn('redact_text(str(payload.get("email_body")', cloud)
        self.assertIn('"stored": False', cloud)
        self.assertIn('recorded final outcome is authoritative', prompt)
        self.assertIn('Tagalog or Taglish language is never suspicious by itself', prompt)
        self.assertIn('class TransientDetectionStore', transient)
        self.assertIn('deepcopy', transient)
        self.assertIn('monotonic()', transient)
        self.assertIn('body_context_sent_to_provider', cloud)
        self.assertNotIn('body_ciphertext', models[models.index('class ActivityEvent') : models.index('class AutomaticTrainingSample')])
        self.assertIn('More details', dashboard)
        self.assertIn('/activities/${item.id}/explanation', dashboard)
        self.assertNotIn('/companion/', dashboard)
        self.assertIn('const retryDetails = useCallback', dashboard)
        self.assertIn('refreshed.last_email', dashboard)
        self.assertIn('role="dialog"', modal)
        self.assertIn('aria-modal="true"', modal)
        self.assertIn('website origin', modal)
        self.assertIn('Paths, queries, fragments, and page content were not shared.', modal)
        self.assertIn('email provider, sender, subject, and message body', modal)
        self.assertIn('transient email body had expired or was unavailable on this server worker', modal)
        self.assertIn('Email body included', modal)
        self.assertIn('not added to dashboard history or stored by this feature', modal)

    def test_remote_gateway_remembers_email_context_under_the_persisted_detection_id(self) -> None:
        server = read("backend/server.py")
        platform = read("shared_platform/app/main.py")
        endpoint = platform[
            platform.index('@app.post("/api/v1/detections/email")') :
            platform.index("def event_view(")
        ]

        self.assertIn("if not REMOTE_SERVER_MODE:", server)
        self.assertIn('result = detector_gateway.analyze_email(', endpoint)
        self.assertIn('"analysis_id": event.client_event_id', endpoint)
        self.assertIn('"detection_id": event.id', endpoint)
        self.assertIn('transient_detections.put(', endpoint)
        self.assertIn('{"event_type": "EMAIL", **raw, "sender_authentication": payload.sender_authentication, "response": response}', endpoint)

    def test_automatic_email_popup_waits_for_complete_cloud_result(self) -> None:
        worker = read("extension/background/service-worker.js")
        function = worker[worker.index("async function analyzeOpenedEmail") : worker.index("async function extractCurrentEmailForFeedback")]
        hybrid_request = function.index("hybridResult =")
        completed_state = function.index("const completedState")
        popup_open = function.index("await openFiveSecondPopup")
        self.assertIn('"/detections/email"', worker)
        self.assertEqual(1, function.count("await fetchHybridEmail("))
        self.assertNotIn("localResult", function)
        self.assertNotIn("currentUrl,\n        false", function)
        self.assertNotIn("await openFiveSecondPopup", function[:hybrid_request])
        self.assertGreater(completed_state, hybrid_request)
        self.assertGreater(popup_open, completed_state)
        self.assertIn("hybrid_ready:\n            true", function[completed_state:popup_open])
        self.assertIn("cloudReviewIsComplete", function[hybrid_request:popup_open])
        self.assertNotIn("submitCompanionActivity", function)
        self.assertIn("AUTO_POPUP_DURATION_MS =\n  5000", worker)

    def test_automatic_url_popup_waits_for_complete_cloud_result(self) -> None:
        worker = read("extension/background/service-worker.js")
        function = worker[worker.index("async function performCurrentTabUrlScan") : worker.index("async function scanCurrentTabUrl")]
        server_result = function.index("const result = await fetchUrlAnalysis")
        completed_state = function.index("const state = await patchTabState", server_result)
        popup_open = function.index("await openFiveSecondPopup")
        self.assertIn('"/detections/url"', worker)
        self.assertEqual(1, function.count("await fetchUrlAnalysis("))
        self.assertNotIn("openFiveSecondPopup", function[:server_result])
        self.assertGreater(completed_state, server_result)
        self.assertGreater(popup_open, completed_state)
        self.assertIn("cloudReviewIsComplete", function[completed_state:popup_open])
        self.assertIn('state: "complete"', function[completed_state:popup_open])

    def test_url_scans_coalesce_and_keep_a_terminal_local_fallback(self) -> None:
        worker = read("extension/background/service-worker.js")
        popup = read("extension/popup/popup.js")
        self.assertIn("const urlAnalysisRequests", worker)
        self.assertIn("existingRequest?.url === currentUrl", worker)
        self.assertIn("return existingRequest.promise", worker)
        self.assertIn('cloudStatus !== "UNAVAILABLE"', worker)
        self.assertIn('cloudStatus !== "UNAVAILABLE"', popup)

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
