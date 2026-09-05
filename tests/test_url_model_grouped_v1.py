from __future__ import annotations

import hashlib
import os
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
MODEL_PATH = ROOT / "models" / "url_random_forest_grouped_v1" / "bantai_rf_grouped_v1.0.0.joblib"

os.environ.setdefault("BANTAI_PLATFORM_API", "")

import sys

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from bantai_inference import (  # noqa: E402
    BantAIInference,
    EXPECTED_MODEL_SHA256,
    EXPECTED_THRESHOLD,
    MODEL_NAME,
    MODEL_VERSION,
    decision_for_probability,
)
from extract_url_features import EXTRACTOR_VERSION, FEATURE_NAMES, one_feature_vector  # noqa: E402


EXPECTED_FEATURE_NAMES = [
    "url_length", "host_length", "registrable_domain_length", "provider_domain_length",
    "path_length", "query_length", "fragment_length", "path_depth", "query_param_count",
    "subdomain_count", "tld_length", "digit_count", "letter_count", "special_count",
    "digit_ratio", "letter_ratio", "special_ratio", "dot_count", "hyphen_count",
    "underscore_count", "slash_count", "at_count", "question_count", "equals_count",
    "ampersand_count", "percent_count", "colon_count", "semicolon_count",
    "host_digit_count", "host_digit_ratio", "host_hyphen_count", "host_dot_count",
    "domain_digit_count", "domain_hyphen_count", "is_https", "is_http", "is_ip_host",
    "has_explicit_port", "has_userinfo", "has_fragment", "has_query", "has_punycode",
    "is_suffixless_host", "host_equals_registrable", "url_entropy", "token_count",
    "mean_token_length", "max_token_length", "suspicious_token_count", "encoded_octet_count",
    "max_repeated_char_run", "path_extension_length",
]


class GroupedUrlModelContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not MODEL_PATH.is_file():
            raise unittest.SkipTest(f"Local URL model is missing: {MODEL_PATH}")
        cls.engine = BantAIInference(MODEL_PATH)

    def test_successful_hash_verified_model_loading(self) -> None:
        self.assertEqual(MODEL_NAME, "BantAI RF Grouped")
        self.assertEqual(MODEL_VERSION, "v1.0.0")
        self.assertEqual(self.engine.model_sha256, EXPECTED_MODEL_SHA256)
        self.assertEqual(self.engine.threshold, EXPECTED_THRESHOLD)
        self.assertEqual(self.engine.bundle["label_meanings"], {0: "legitimate", 1: "phishing"})

    def test_deployed_model_hash(self) -> None:
        digest = hashlib.sha256()
        with MODEL_PATH.open("rb") as handle:
            while chunk := handle.read(8 * 1024 * 1024):
                digest.update(chunk)
        self.assertEqual(digest.hexdigest(), EXPECTED_MODEL_SHA256)

    def test_hash_mismatch_is_rejected_before_loading(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            corrupt = Path(temporary) / "corrupt.joblib"
            corrupt.write_bytes(b"not the approved model")
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                BantAIInference(corrupt)

    def test_exact_52_feature_schema_and_ordering(self) -> None:
        self.assertEqual(EXTRACTOR_VERSION, "bantai_lexical_v1")
        self.assertEqual(FEATURE_NAMES, EXPECTED_FEATURE_NAMES)
        self.assertEqual(self.engine.bundle["feature_names"], EXPECTED_FEATURE_NAMES)
        vector = one_feature_vector(
            "https://github.com/openai?tab=repositories",
            "github.com",
            "github.com",
            "github.com",
            "False",
        )
        self.assertEqual(len(vector), 52)

    def test_legitimate_and_suspicious_predictions(self) -> None:
        records, _ = self.engine.predict_urls([
            "https://github.com/openai",
            "https://xn--pple-43d.com/login",
        ])
        self.assertEqual(records[0]["decision"], "legitimate")
        self.assertLess(records[0]["phishing_probability"], EXPECTED_THRESHOLD)
        self.assertEqual(records[1]["decision"], "phishing")
        self.assertGreaterEqual(records[1]["phishing_probability"], EXPECTED_THRESHOLD)

    def test_malformed_rejection_and_repaired_url(self) -> None:
        records, _ = self.engine.predict_urls(["https://", "http:/github.com"])
        self.assertEqual(records[0]["validation_status"], "rejected")
        self.assertIsNone(records[0]["phishing_probability"])
        self.assertEqual(records[1]["validation_status"], "repaired")
        self.assertEqual(records[1]["normalized_url"], "http://github.com")

    def test_repeated_predictions_are_deterministic(self) -> None:
        urls = ["https://github.com/openai", "https://xn--pple-43d.com/login"]
        first, _ = self.engine.predict_urls(urls)
        second, _ = self.engine.predict_urls(urls)
        self.assertEqual(first, second)

    def test_threshold_is_inclusive_at_0547(self) -> None:
        self.assertEqual(decision_for_probability(0.546999999999), "legitimate")
        self.assertEqual(decision_for_probability(0.547), "phishing")

    def test_real_application_entry_point_reports_identity_and_shadow_mode(self) -> None:
        import server

        previous_engine = server.runtime.url_engine
        previous_model = server.runtime.url_model
        previous_enforcement = server.URL_MODEL_ENFORCEMENT_ENABLED
        try:
            server.runtime.url_engine = self.engine
            server.runtime.url_model = self.engine.model
            server.URL_MODEL_ENFORCEMENT_ENABLED = False
            result = server.analyze_url(server.UrlAnalysisRequest(url="http:/github.com"))
        finally:
            server.runtime.url_engine = previous_engine
            server.runtime.url_model = previous_model
            server.URL_MODEL_ENFORCEMENT_ENABLED = previous_enforcement

        self.assertEqual(result.model_name, "BantAI RF Grouped")
        self.assertEqual(result.model_version, "v1.0.0")
        self.assertEqual(result.validation_status, "repaired")
        self.assertEqual(result.decision_threshold, 0.547)
        self.assertEqual(result.phishing_probability, result.suspicious_probability)
        self.assertTrue(result.shadow_mode)
        self.assertFalse(result.enforcement_enabled)
        self.assertFalse(result.automatic_navigation_performed)

        health = server.health()["url_detector"]
        self.assertEqual(health["filename"], "bantai_rf_grouped_v1.0.0.joblib")
        self.assertEqual(health["feature_extractor"], "bantai_lexical_v1")
        self.assertEqual(health["feature_count"], 52)

    def test_v4b_is_not_selected_by_default(self) -> None:
        active_sources = "\n".join([
            (BACKEND / "server.py").read_text(encoding="utf-8"),
            (ROOT / "companion" / "app.py").read_text(encoding="utf-8"),
            (ROOT / "docker-compose.yml").read_text(encoding="utf-8"),
        ])
        self.assertIn("bantai_rf_grouped_v1.0.0.joblib", active_sources)
        self.assertNotIn("bantai_rf_url_model_v4b_optimized.joblib", active_sources)
        self.assertTrue((BACKEND / "bantai_rf_url_model_v4b_runtime.py").is_file())


if __name__ == "__main__":
    unittest.main()
