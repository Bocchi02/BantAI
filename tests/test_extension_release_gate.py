from __future__ import annotations

import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.configure_remote_endpoint import (
    configure_artifacts,
    validate_release_configuration,
)
from scripts.package_extension import package_release


ROOT = Path(__file__).resolve().parents[1]


class ExtensionReleaseGateTests(unittest.TestCase):
    def _artifact(self) -> tuple[Path, Path, Path]:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        source = root / "extension"
        source.mkdir()
        shutil_manifest = json.loads((ROOT / "extension/manifest.json").read_text(encoding="utf-8"))
        (source / "manifest.json").write_text(json.dumps(shutil_manifest), encoding="utf-8")
        (source / "config.js").write_text((ROOT / "extension/config.js").read_text(encoding="utf-8"), encoding="utf-8")
        return root, source / "config.js", source / "manifest.json"

    def test_development_artifact_is_rejected(self) -> None:
        _root, config, manifest = self._artifact()
        with self.assertRaises(ValueError):
            validate_release_configuration(config.read_text(encoding="utf-8"), json.loads(manifest.read_text(encoding="utf-8")))

    def test_release_artifact_is_accepted_and_packaged(self) -> None:
        root, config, manifest = self._artifact()
        configure_artifacts(config, manifest, "https://synthetic-release.invalid/api/v1", "release", False)
        output = root / "dist" / "release.zip"
        package_release(root / "extension", output, "https://synthetic-release.invalid/api/v1")
        self.assertTrue(output.is_file())
        with zipfile.ZipFile(output) as archive:
            config_text = archive.read("extension/config.js").decode("utf-8")
            packaged_manifest = json.loads(archive.read("extension/manifest.json"))
        self.assertIn('buildMode: "release"', config_text)
        self.assertIn("https://synthetic-release.invalid/*", packaged_manifest["host_permissions"])

    def test_invalid_release_inputs_are_rejected(self) -> None:
        invalid = (
            "http://example.invalid/api/v1",
            "http://localhost/api/v1",
            "http://127.0.0.1/api/v1",
            "http://[::1]/api/v1",
            "https://synthetic-release.invalid/not-api-v1",
            "",
        )
        for endpoint in invalid:
            with self.subTest(endpoint=endpoint):
                root, config, manifest = self._artifact()
                with self.assertRaises(ValueError):
                    configure_artifacts(config, manifest, endpoint, "release", False)

    def test_mismatch_and_loopback_release_settings_are_rejected(self) -> None:
        root, config, manifest = self._artifact()
        configure_artifacts(config, manifest, "https://synthetic-release.invalid/api/v1", "release", False)
        parsed = json.loads(manifest.read_text(encoding="utf-8"))
        parsed["host_permissions"] = [host for host in parsed["host_permissions"] if "synthetic-release" not in host]
        with self.assertRaises(ValueError):
            validate_release_configuration(config.read_text(encoding="utf-8"), parsed)
        bad_config = config.read_text(encoding="utf-8").replace('allowHttpLoopback: false', 'allowHttpLoopback: true')
        with self.assertRaises(ValueError):
            validate_release_configuration(bad_config, json.loads(manifest.read_text(encoding="utf-8")))


if __name__ == "__main__":
    unittest.main()
