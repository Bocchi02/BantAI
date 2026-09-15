from __future__ import annotations

import hashlib
import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from email_model import MODEL_VERSION, verify_deployment_manifest  # noqa: E402


class EmailModelManifestTests(unittest.TestCase):
    def test_manifest_rejects_tampered_artifact_before_model_loading(self) -> None:
        with TemporaryDirectory() as directory:
            model_dir = Path(directory)
            artifact = model_dir / "fixture.bin"
            artifact.write_bytes(b"expected frozen artifact")
            manifest = {
                "schema_version": 1,
                "model_version": MODEL_VERSION,
                "files": {
                    "fixture.bin": {
                        "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
                        "size_bytes": artifact.stat().st_size,
                    }
                },
            }
            (model_dir / "EMAIL_MODEL_MANIFEST.json").write_text(
                json.dumps(manifest), encoding="utf-8"
            )

            verify_deployment_manifest(model_dir)
            artifact.write_bytes(b"tampered artifact")
            with self.assertRaisesRegex(RuntimeError, "size mismatch|SHA-256 mismatch"):
                verify_deployment_manifest(model_dir)


if __name__ == "__main__":
    unittest.main()
