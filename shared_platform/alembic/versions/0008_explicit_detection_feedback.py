"""Scope URL feedback to an explicitly reviewed detection.

Revision ID: 0008_explicit_feedback
Revises: 0007_training_store
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op


revision = "0008_explicit_feedback"
down_revision = "0007_training_store"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    if "url_reports" not in set(sa.inspect(bind).get_table_names()):
        return
    constraints = {
        constraint["name"]
        for constraint in sa.inspect(bind).get_unique_constraints("url_reports")
    }
    if "uq_url_report_user_origin" in constraints:
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table("url_reports") as batch:
                batch.drop_constraint("uq_url_report_user_origin", type_="unique")
        else:
            op.drop_constraint("uq_url_report_user_origin", "url_reports", type_="unique")
    else:
        indexes = {
            index["name"]: index
            for index in sa.inspect(bind).get_indexes("url_reports")
        }
        if indexes.get("uq_url_report_user_origin", {}).get("unique"):
            op.drop_index("uq_url_report_user_origin", table_name="url_reports")


def downgrade() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    if "url_reports" not in set(sa.inspect(bind).get_table_names()):
        return
    constraints = {
        constraint["name"]
        for constraint in sa.inspect(bind).get_unique_constraints("url_reports")
    }
    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("url_reports")}
    if "uq_url_report_user_origin" not in constraints | indexes:
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table("url_reports") as batch:
                batch.create_unique_constraint(
                    "uq_url_report_user_origin",
                    ["user_id", "origin_fingerprint"],
                )
        else:
            op.create_unique_constraint(
                "uq_url_report_user_origin",
                "url_reports",
                ["user_id", "origin_fingerprint"],
            )
