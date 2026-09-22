"""Guard the public Signalam name without changing frozen or persisted IDs."""

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SignalamBrandingTests(unittest.TestCase):
    def test_public_product_surfaces_use_signalam(self) -> None:
        manifest = json.loads((ROOT / "extension/manifest.json").read_text(encoding="utf-8"))
        self.assertIn("Signalam", manifest["name"])
        self.assertIn("Signalam", manifest["action"]["default_title"])

        public_sources = (
            ROOT / "extension/popup/popup.html",
            ROOT / "web/app/BrandLogo.jsx",
            ROOT / "web/app/layout.jsx",
            ROOT / "web/app/views/LandingView.jsx",
            ROOT / "web/worker/api-proxy.js",
        )
        for path in public_sources:
            with self.subTest(path=path.name):
                source = path.read_text(encoding="utf-8")
                self.assertIn("Signalam", source)
                self.assertNotIn("BantAI", source)

        self.assertTrue((ROOT / "web/public/og-signalam.png").is_file())

    def test_legacy_identifiers_remain_stable(self) -> None:
        # Existing sessions, encrypted records, and model artifacts must survive.
        self.assertIn(
            'CSRF_COOKIE = "bantai_csrf"',
            (ROOT / "shared_platform/app/dependencies.py").read_text(encoding="utf-8"),
        )
        self.assertIn(
            'MODEL_FILENAME = "bantai_rf_grouped_v1.0.0.joblib"',
            (ROOT / "backend/bantai_inference.py").read_text(encoding="utf-8"),
        )


if __name__ == "__main__":
    unittest.main()
