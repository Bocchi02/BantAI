from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError


BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from llm.schemas import validate_llm_response


class LLMSchemaTests(unittest.TestCase):
    def test_valid_response_is_accepted(self) -> None:
        result = validate_llm_response(
            {
                "assessment": "NEEDS_CAUTION",
                "confidence": "MEDIUM",
                "indicators": [],
                "reasoning_summary": "The request should be verified independently.",
                "recommended_action": "Contact the sender through an official channel.",
            }
        )
        self.assertEqual(result.assessment, "NEEDS_CAUTION")

    def test_malformed_response_is_rejected_without_fabrication(self) -> None:
        with self.assertRaises(ValidationError):
            validate_llm_response(
                {
                    "assessment": "SUSPICIOUS_SIGNS_FOUND",
                    "indicators": [],
                }
            )

    def test_extra_fields_are_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            validate_llm_response(
                {
                    "assessment": "NO_STRONG_WARNING_SIGNS",
                    "confidence": "HIGH",
                    "indicators": [],
                    "reasoning_summary": "No strong warning sign was observed.",
                    "recommended_action": "Continue carefully.",
                    "hidden_chain_of_thought": "must not be accepted",
                }
            )


if __name__ == "__main__":
    unittest.main()
