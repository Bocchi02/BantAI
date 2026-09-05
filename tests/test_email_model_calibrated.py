from __future__ import annotations

import gc
import math
import sys
import unittest
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from email_model import (  # noqa: E402
    EXPECTED_ID2LABEL,
    MODEL_VERSION,
    PREPROCESSING,
    calibrated_probabilities,
    count_untruncated_email_tokens,
    encode_email,
    encoded_to_tensors,
    is_suspicious_probability,
    load_deployment_contract,
)


MODEL_DIR = ROOT / "models" / "email_text_xlmr_v2" / MODEL_VERSION


def contains_subsequence(values: list[int], expected: list[int]) -> bool:
    width = len(expected)
    return any(values[index : index + width] == expected for index in range(len(values) - width + 1))


class CalibrationMathTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = load_deployment_contract(MODEL_DIR)

    def test_label_mapping_and_calibration_contract(self) -> None:
        self.assertEqual(EXPECTED_ID2LABEL, {0: "LEGITIMATE", 1: "PHISHING_SOCIAL_ENGINEERING"})
        self.assertEqual(self.contract.positive_class_id, 1)
        self.assertEqual(self.contract.method, "temperature_scaling")
        self.assertEqual(self.contract.temperature, 2.2198894341340183)
        self.assertEqual(self.contract.suspicious_threshold, 0.6923658179915227)

    def test_temperature_scaling_divides_both_logits_before_softmax(self) -> None:
        logits = torch.tensor([[1.25, -0.75]], dtype=torch.float64)
        probabilities = calibrated_probabilities(logits, self.contract)[0]
        expected_class_1 = math.exp(-0.75 / self.contract.temperature) / (
            math.exp(1.25 / self.contract.temperature)
            + math.exp(-0.75 / self.contract.temperature)
        )
        self.assertAlmostEqual(float(probabilities[1]), expected_class_1, places=15)
        self.assertAlmostEqual(float(probabilities.sum()), 1.0, places=15)

    def test_threshold_boundary_below_equal_and_above(self) -> None:
        threshold = self.contract.suspicious_threshold
        self.assertFalse(is_suspicious_probability(math.nextafter(threshold, 0.0), self.contract))
        self.assertTrue(is_suspicious_probability(threshold, self.contract))
        self.assertTrue(is_suspicious_probability(math.nextafter(threshold, 1.0), self.contract))


class CalibratedEmailArtifactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = load_deployment_contract(MODEL_DIR)
        cls.tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR, local_files_only=True)
        cls.model = AutoModelForSequenceClassification.from_pretrained(
            MODEL_DIR,
            local_files_only=True,
        ).to(torch.device("cpu"))
        cls.model.eval()

    @classmethod
    def tearDownClass(cls) -> None:
        del cls.model
        del cls.tokenizer
        gc.collect()

    def test_checkpoint_and_tokenizer_load_offline_with_expected_labels(self) -> None:
        actual_mapping = {int(key): value for key, value in self.model.config.id2label.items()}
        self.assertEqual(actual_mapping, EXPECTED_ID2LABEL)
        self.assertEqual(self.model.config.num_labels, 2)
        self.assertEqual(self.tokenizer.num_special_tokens_to_add(pair=False), 2)

    def test_short_subject_and_body_preserve_structure_and_special_tokens(self) -> None:
        encoded = encode_email(
            self.tokenizer,
            "Project update",
            "The synthetic meeting is tomorrow.",
        )
        decoded = self.tokenizer.decode(encoded["input_ids"], skip_special_tokens=True)
        self.assertIn("Subject:", decoded)
        self.assertIn("Project update", decoded)
        self.assertIn("Body:", decoded)
        self.assertIn("meeting is tomorrow", decoded)
        self.assertEqual(encoded["input_ids"][0], self.tokenizer.cls_token_id)
        self.assertEqual(encoded["input_ids"][-1], self.tokenizer.sep_token_id)
        self.assertLessEqual(len(encoded["input_ids"]), PREPROCESSING["max_length"])

    def test_empty_subject_and_empty_body_are_supported_by_preprocessor(self) -> None:
        body_only = encode_email(self.tokenizer, "", "Synthetic body only.")
        body_decoded = self.tokenizer.decode(body_only["input_ids"], skip_special_tokens=True)
        self.assertIn("Synthetic body only", body_decoded)
        self.assertNotIn("Subject:", body_decoded)

        subject_only = encode_email(self.tokenizer, "Synthetic subject only", "")
        subject_decoded = self.tokenizer.decode(subject_only["input_ids"], skip_special_tokens=True)
        self.assertIn("Subject:", subject_decoded)
        self.assertIn("Synthetic subject only", subject_decoded)
        self.assertIn("Body:", subject_decoded)

    def test_long_input_is_capped_and_preserves_subject_and_body_head_and_tail(self) -> None:
        subject = "SUBJECT_HEAD_ALPHA " + ("subjectmiddle " * 300) + "SUBJECT_TAIL_OMEGA"
        body = "BODY_HEAD_ALPHA " + ("bodymiddle " * 1400) + "BODY_TAIL_OMEGA"
        encoded = encode_email(self.tokenizer, subject, body)
        decoded = self.tokenizer.decode(encoded["input_ids"], skip_special_tokens=True)

        self.assertEqual(len(encoded["input_ids"]), PREPROCESSING["max_length"])
        self.assertGreater(count_untruncated_email_tokens(self.tokenizer, subject, body), 512)
        for marker in (
            "SUBJECT_HEAD_ALPHA",
            "SUBJECT_TAIL_OMEGA",
            "BODY_HEAD_ALPHA",
            "BODY_TAIL_OMEGA",
        ):
            with self.subTest(marker=marker):
                marker_ids = self.tokenizer.encode(marker, add_special_tokens=False, verbose=False)
                self.assertTrue(
                    marker in decoded or contains_subsequence(encoded["input_ids"], marker_ids),
                    f"Head-tail encoding did not preserve {marker}",
                )

    def test_same_input_produces_deterministic_logits_and_probability(self) -> None:
        encoded = encode_email(
            self.tokenizer,
            "Synthetic account notice",
            "This is a deterministic local model test with no personal information.",
        )
        tensors = encoded_to_tensors(encoded, torch.device("cpu"))
        with torch.inference_mode():
            logits_1 = self.model(**tensors).logits
            logits_2 = self.model(**tensors).logits
        self.assertTrue(torch.equal(logits_1, logits_2))
        probability_1 = calibrated_probabilities(logits_1, self.contract)[0, 1]
        probability_2 = calibrated_probabilities(logits_2, self.contract)[0, 1]
        self.assertEqual(float(probability_1), float(probability_2))

    def test_existing_email_endpoint_returns_calibrated_probability_metadata(self) -> None:
        import server

        previous = (
            server.runtime.email_tokenizer,
            server.runtime.email_model,
            server.runtime.email_device,
            server.runtime.email_model_dir,
            server.runtime.email_contract,
        )
        server.runtime.email_tokenizer = self.tokenizer
        server.runtime.email_model = self.model
        server.runtime.email_device = torch.device("cpu")
        server.runtime.email_model_dir = MODEL_DIR
        server.runtime.email_contract = self.contract
        try:
            result = server.analyze_email(
                server.EmailAnalysisRequest(
                    provider="gmail",
                    subject="Synthetic delivery notice",
                    body="A synthetic package message for endpoint integration testing.",
                )
            )
        finally:
            (
                server.runtime.email_tokenizer,
                server.runtime.email_model,
                server.runtime.email_device,
                server.runtime.email_model_dir,
                server.runtime.email_contract,
            ) = previous

        self.assertEqual(result.model_version, MODEL_VERSION)
        self.assertEqual(result.calibration_method, "temperature_scaling")
        self.assertEqual(result.temperature, self.contract.temperature)
        self.assertEqual(result.threshold, self.contract.suspicious_threshold)
        self.assertEqual(result.is_suspicious, result.suspicious_probability >= result.threshold)
        self.assertEqual(
            result.predicted_label,
            "phishing_social_engineering" if result.is_suspicious else "legitimate",
        )
        self.assertAlmostEqual(result.safe_probability + result.suspicious_probability, 1.0, places=6)
        self.assertLessEqual(result.analyzed_token_count, 512)


if __name__ == "__main__":
    unittest.main()
