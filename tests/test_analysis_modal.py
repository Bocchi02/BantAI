"""Test the Signalam compact Sneat-inspired popup and Shadow DOM analysis modal integration."""

from __future__ import annotations

import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AnalysisModalTests(unittest.TestCase):
    def test_manifest_declares_activetab_and_scripting(self) -> None:
        manifest = json.loads((ROOT / "extension/manifest.json").read_text(encoding="utf-8"))
        permissions = set(manifest.get("permissions", []))
        self.assertIn("activeTab", permissions)
        self.assertIn("scripting", permissions)
        self.assertIn("storage", permissions)
        self.assertIn("tabs", permissions)

    def test_popup_html_contains_compact_ui_and_preserved_invariants(self) -> None:
        html = (ROOT / "extension/popup/popup.html").read_text(encoding="utf-8")
        # Compact UI elements
        self.assertIn('id="compactRiskCard"', html)
        self.assertIn('id="compactTargetDomain"', html)
        self.assertIn('id="compactTargetUrl"', html)
        self.assertIn('id="compactScopePill"', html)
        self.assertIn('id="compactRiskBadge"', html)
        self.assertIn('id="compactDecisionTitle"', html)
        self.assertIn('id="compactSummaryText"', html)
        self.assertIn('id="compactResultIcon"', html)
        self.assertIn('id="viewDetailsBtn"', html)
        self.assertIn('id="detailsDialog"', html)
        self.assertIn('id="detailsCloseBtn"', html)
        self.assertIn('aria-modal="true"', html)
        self.assertIn("Signalam", html)
        self.assertNotIn('class="gauge-label">SCORE', html)
        self.assertIn('class="detection-content hidden"', html)

        # Invariant elements preserved for tests & background tasks
        self.assertIn('id="websiteCard"', html)
        self.assertIn('id="websiteDomain"', html)
        self.assertIn('id="websiteStatus"', html)
        self.assertIn('id="websiteMessage"', html)
        self.assertIn('id="emailCard"', html)
        self.assertIn('id="emailFinalStatus"', html)
        self.assertIn('id="emailReviewForm"', html)
        self.assertIn('id="pairingCard"', html)
        self.assertIn("Address only", html)
        self.assertIn("It does not guarantee", html)

    def test_popup_css_enforces_sneat_tokens_compact_dimensions_and_no_remote_fonts(self) -> None:
        css = (ROOT / "extension/popup/popup.css").read_text(encoding="utf-8")
        self.assertIn("width: 370px", css)
        self.assertIn("max-height: 400px", css)
        self.assertIn("--signalam-primary: #696cff", css)
        self.assertIn("--signalam-success: #71dd37", css)
        self.assertIn("--signalam-warning: #ffab00", css)
        self.assertIn("--signalam-danger: #ff3e1d", css)
        self.assertIn("--space-xs: 4px", css)
        self.assertIn("--space-sm: 8px", css)
        self.assertIn("--space-md: 12px", css)
        self.assertIn("--space-lg: 16px", css)
        self.assertIn("--radius-sm: 6px", css)
        self.assertIn("--radius-md: 8px", css)
        self.assertIn(".detection-content.feedback-visible", css)
        self.assertIn("#detectionContent > #websiteCard", css)
        self.assertIn('"Roboto"', css)
        self.assertNotIn("fonts.googleapis.com", css)
        self.assertNotIn("fonts.gstatic.com", css)

    def test_popup_replaces_stale_failures_while_a_fresh_scan_runs(self) -> None:
        script = (ROOT / "extension/popup/popup.js").read_text(encoding="utf-8")
        self.assertIn("function renderRefreshPending()", script)
        self.assertIn('state: "analyzing"', script)
        self.assertIn("renderRefreshPending();", script)
        self.assertNotIn("compactScoreText", script)
        self.assertNotIn("compactScoreFill", script)
        # Ensure modal payload does not pass internal ML score fields
        compile_payload = script[
            script.index("function compileModalPayload(") :
            script.index("function renderState(")
        ]
        self.assertNotIn("riskScore", compile_payload)
        self.assertNotIn("suspicious_probability", compile_payload)
        self.assertNotIn("installedThreshold", compile_payload)

    def test_analysis_modal_implements_shadow_dom_and_accessibility(self) -> None:
        script = (ROOT / "extension/content/analysis-modal.js").read_text(encoding="utf-8")
        self.assertIn('attachShadow({ mode: "open" })', script)
        self.assertIn('signalam-extension-root', script)
        self.assertIn('setAttribute("role", "dialog")', script)
        self.assertIn('setAttribute("aria-modal", "true")', script)
        self.assertIn('setAttribute("aria-labelledby", "signalamAnalysisModalTitle")', script)
        self.assertIn("BANTAI_SHOW_ANALYSIS_MODAL", script)
        self.assertIn("Escape", script)
        self.assertIn("signalam-backdrop", script)
        self.assertIn("signalam-modal", script)
        self.assertIn("What This Means", script)
        self.assertIn("Recommended Action", script)
        self.assertIn("Continue Anyway", script)
        self.assertIn("Go Back", script)
        self.assertIn("Close", script)
        self.assertIn("This is not a guarantee", script)
        # Verify no ML model outputs are exposed in the modal script
        self.assertNotIn("Random Forest", script)
        self.assertNotIn("XLM-RoBERTa", script)
        self.assertNotIn("confidence score", script.lower())
        self.assertNotIn("risk score", script.lower())

    def test_view_details_sends_message_to_active_tab_content_script(self) -> None:
        script = (ROOT / "extension/popup/popup.js").read_text(encoding="utf-8")
        handler_start = script.index("if (elements.viewDetailsBtn)")
        handler = script[
            handler_start :
            script.index("if (elements.toggleFeedbackBtn)", handler_start)
        ]
        self.assertIn("chrome.tabs.sendMessage", handler)
        self.assertIn("BANTAI_SHOW_ANALYSIS_MODAL", handler)
        self.assertIn("chrome.scripting.executeScript", handler)
        self.assertIn("content/analysis-modal.js", handler)
        self.assertIn('globalThis["close"]()', handler)

    def test_decision_levels_map_to_safe_suspicious_and_dangerous(self) -> None:
        popup_js = (ROOT / "extension/popup/popup.js").read_text(encoding="utf-8")
        modal_js = (ROOT / "extension/content/analysis-modal.js").read_text(encoding="utf-8")
        popup_html = (ROOT / "extension/popup/popup.html").read_text(encoding="utf-8")

        # Verify Popup JS maps outcomes to SAFE, SUSPICIOUS, DANGEROUS
        self.assertIn('badgeLabel = "SAFE";', popup_js)
        self.assertIn('titleText = "SAFE";', popup_js)
        self.assertIn('badgeLabel = "SUSPICIOUS";', popup_js)
        self.assertIn('titleText = "SUSPICIOUS";', popup_js)
        self.assertIn('badgeLabel = "DANGEROUS";', popup_js)
        self.assertIn('titleText = "DANGEROUS";', popup_js)

        # Verify Analysis Modal maps levels to SAFE, SUSPICIOUS, DANGEROUS
        self.assertIn('level: "SAFE"', modal_js)
        self.assertIn('title: "SAFE"', modal_js)
        self.assertIn('level: "SUSPICIOUS"', modal_js)
        self.assertIn('title: "SUSPICIOUS"', modal_js)
        self.assertIn('level: "DANGEROUS"', modal_js)
        self.assertIn('title: "DANGEROUS"', modal_js)

        # Verify default popup HTML renders SAFE
        self.assertIn('>SAFE</span>', popup_html)
        self.assertIn('>SAFE</h2>', popup_html)


if __name__ == "__main__":
    unittest.main()
