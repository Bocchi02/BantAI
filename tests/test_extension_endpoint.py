import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
import json

from scripts.configure_remote_endpoint import (
    MAIL_HOSTS,
    configure_artifacts,
    validate_development_configuration,
    validate_release_configuration,
    validated_endpoint,
)


class ExtensionEndpointTests(unittest.TestCase):
    def test_local_docker_requires_explicit_opt_in(self):
        with self.assertRaises(ValueError):
            validated_endpoint("http://127.0.0.1:8080/api/v1")
        self.assertEqual(
            validated_endpoint("http://127.0.0.1:8080/api/v1", True),
            ("http://127.0.0.1:8080/api/v1", "http://127.0.0.1:8080"),
        )

    def test_local_opt_in_does_not_allow_remote_http(self):
        for host in ("example.org", "127.0.0.1.example.org", "192.168.1.2"):
            with self.subTest(host=host), self.assertRaises(ValueError):
                validated_endpoint(f"http://{host}:8080/api/v1", True)

    def test_https_deployment(self):
        self.assertEqual(
            validated_endpoint("https://api.example.org/api/v1/"),
            ("https://api.example.org/api/v1", "https://api.example.org"),
        )

    def test_release_configuration_requires_exact_https_origin_and_policy(self):
        manifest = {
            "host_permissions": sorted(MAIL_HOSTS | {"https://api.example.org/*"}),
            "content_security_policy": {
                "extension_pages": (
                    "script-src 'self'; object-src 'none'; base-uri 'self'; connect-src https://api.example.org; "
                    "style-src 'self'; font-src 'self';"
                )
            },
        }
        config = (
            'globalThis.BANTAI_CONFIG = Object.freeze({ buildMode: "release", '
            'apiBase: "https://api.example.org/api/v1", allowHttpLoopback: false });'
        )
        self.assertEqual(
            "https://api.example.org/api/v1",
            validate_release_configuration(config, manifest),
        )

        development_config = config.replace('buildMode: "release"', 'buildMode: "development"')
        with self.assertRaises(ValueError):
            validate_release_configuration(development_config, manifest)
        with self.assertRaises(ValueError):
            validate_release_configuration(
                config.replace("https://api.example.org", "http://127.0.0.1:8080"),
                manifest,
            )

    def test_release_verifier_rejects_mismatched_host_and_csp(self):
        config = (
            'globalThis.BANTAI_CONFIG = Object.freeze({ buildMode: "release", '
            'apiBase: "https://api.example.org/api/v1", allowHttpLoopback: false });'
        )
        manifest = {
            "host_permissions": sorted(MAIL_HOSTS | {"https://other.example.org/*"}),
            "content_security_policy": {"extension_pages": "connect-src https://other.example.org;"},
        }
        with self.assertRaises(ValueError):
            validate_release_configuration(config, manifest)

    def test_development_configuration_is_explicit_and_loopback_scoped(self):
        manifest = {
            "host_permissions": sorted(MAIL_HOSTS | {"http://127.0.0.1:8080/*"}),
            "content_security_policy": {
                "extension_pages": "script-src 'self'; connect-src http://127.0.0.1:8080;"
            },
        }
        config = (
            'globalThis.BANTAI_CONFIG = Object.freeze({ buildMode: "development", '
            'apiBase: "http://127.0.0.1:8080/api/v1", allowHttpLoopback: true });'
        )
        self.assertEqual(
            "http://127.0.0.1:8080/api/v1",
            validate_development_configuration(config, manifest),
        )
        with self.assertRaises(ValueError):
            validate_development_configuration(
                config.replace("http://127.0.0.1:8080", "http://192.168.1.20:8080"),
                manifest,
            )

    def test_release_configuration_rejects_all_local_or_missing_endpoint_forms(self):
        manifest = {"host_permissions": sorted(MAIL_HOSTS), "content_security_policy": {"extension_pages": ""}}
        base = 'globalThis.BANTAI_CONFIG = Object.freeze({{ buildMode: "release", apiBase: "{endpoint}", allowHttpLoopback: false }});'
        for endpoint in (
            "http://localhost:8080/api/v1",
            "http://127.0.0.1:8080/api/v1",
            "https://localhost:8443/api/v1",
            "https://127.0.0.1:8443/api/v1",
            "https://[::1]:8443/api/v1",
        ):
            with self.subTest(endpoint=endpoint), self.assertRaises(ValueError):
                validate_release_configuration(base.format(endpoint=endpoint), manifest)
        with self.assertRaises(ValueError):
            validate_release_configuration(
                'globalThis.BANTAI_CONFIG = Object.freeze({ buildMode: "release", allowHttpLoopback: false });',
                manifest,
            )

    def test_generated_synthetic_release_artifact_passes_verifier_contract(self):
        source_manifest = Path(__file__).resolve().parents[1] / "extension" / "manifest.json"
        with TemporaryDirectory() as directory:
            config_path = Path(directory) / "config.js"
            manifest_path = Path(directory) / "manifest.json"
            manifest_path.write_text(source_manifest.read_text(encoding="utf-8"), encoding="utf-8")
            endpoint, origin = configure_artifacts(
                config_path,
                manifest_path,
                "https://api.example.invalid/api/v1",
                "release",
                False,
            )
            self.assertEqual("https://api.example.invalid/api/v1", endpoint)
            self.assertEqual("https://api.example.invalid", origin)
            self.assertEqual(
                endpoint,
                validate_release_configuration(
                    config_path.read_text(encoding="utf-8"),
                    json.loads(manifest_path.read_text(encoding="utf-8")),
                ),
            )
