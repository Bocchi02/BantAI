from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DatabaseRoleDesignTests(unittest.TestCase):
    def test_production_runtime_and_migration_credentials_are_separate(self) -> None:
        compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        dockerfile = (ROOT / "shared_platform/Dockerfile").read_text(encoding="utf-8")
        role_script = (ROOT / "deploy/mysql/create-roles.sh").read_text(encoding="utf-8")
        self.assertIn("BANTAI_DB_RUNTIME_PASSWORD", compose)
        self.assertIn("BANTAI_DB_MIGRATION_PASSWORD", compose)
        self.assertIn("bantai_runtime", compose)
        self.assertIn("bantai_migration", compose)
        self.assertIn("service_completed_successfully", compose)
        self.assertNotIn("alembic", dockerfile.lower())
        self.assertIn("GRANT SELECT, INSERT, UPDATE, DELETE ON bantai.*", role_script)
        self.assertIn("CREATE, ALTER, DROP, INDEX, REFERENCES, CREATE TEMPORARY TABLES", role_script)


if __name__ == "__main__":
    unittest.main()
