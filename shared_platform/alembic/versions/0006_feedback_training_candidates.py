"""Add reviewed URL feedback training-candidate metadata.

Revision ID: 0006_feedback_candidates
Revises: 0005_manual_url_report_input
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op


revision = "0006_feedback_candidates"
down_revision = "0005_manual_url_report_input"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if context.is_offline_mode():
        return

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "url_reports" not in set(inspector.get_table_names()):
        return

    columns = {column["name"] for column in inspector.get_columns("url_reports")}
    if bind.dialect.name == "mysql":
        op.execute(
            "ALTER TABLE url_reports MODIFY COLUMN user_classification "
            "ENUM('LEGITIMATE','SUSPICIOUS','UNSURE') NOT NULL"
        )
    if "feedback_verdict" not in columns:
        op.add_column(
            "url_reports",
            sa.Column(
                "feedback_verdict",
                sa.Enum("CORRECT", "INCORRECT", "UNSURE", name="feedbackverdict"),
                nullable=False,
                server_default="INCORRECT",
            ),
        )
    if "feedback_reason" not in columns:
        op.add_column(
            "url_reports",
            sa.Column(
                "feedback_reason",
                sa.Enum(
                    "TRUSTED_OR_OFFICIAL",
                    "INCORRECT_WARNING",
                    "MISSED_WARNING",
                    "IMPERSONATION_OR_DECEPTIVE",
                    "OTHER",
                    name="feedbackreason",
                ),
                nullable=True,
            ),
        )
    if "feedback_source" not in columns:
        op.add_column(
            "url_reports",
            sa.Column(
                "feedback_source",
                sa.Enum("RECENT_DETECTION", "MANUAL_ENTRY", name="feedbacksource"),
                nullable=False,
                server_default="MANUAL_ENTRY",
            ),
        )
    if "training_status" not in columns:
        op.add_column(
            "url_reports",
            sa.Column(
                "training_status",
                sa.Enum("PENDING", "APPROVED", "REJECTED", "INCONCLUSIVE", name="trainingstatus"),
                nullable=False,
                server_default="PENDING",
            ),
        )
    if "detector_model_version" not in columns:
        op.add_column(
            "url_reports",
            sa.Column("detector_model_version", sa.String(length=40), nullable=False, server_default="RF V4-B"),
        )

    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("url_reports")}
    if "ix_url_reports_training_status_submitted" not in indexes:
        op.create_index(
            "ix_url_reports_training_status_submitted",
            "url_reports",
            ["training_status", "submitted_at"],
        )


def downgrade() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "url_reports" not in set(inspector.get_table_names()):
        return
    indexes = {index["name"] for index in inspector.get_indexes("url_reports")}
    if "ix_url_reports_training_status_submitted" in indexes:
        op.drop_index("ix_url_reports_training_status_submitted", table_name="url_reports")
    columns = {column["name"] for column in sa.inspect(bind).get_columns("url_reports")}
    for name in (
        "detector_model_version",
        "training_status",
        "feedback_source",
        "feedback_reason",
        "feedback_verdict",
    ):
        if name in columns:
            op.drop_column("url_reports", name)
    if bind.dialect.name == "mysql":
        op.execute(
            "UPDATE url_reports SET user_classification = 'LEGITIMATE' "
            "WHERE user_classification = 'UNSURE'"
        )
        op.execute(
            "ALTER TABLE url_reports MODIFY COLUMN user_classification "
            "ENUM('LEGITIMATE','SUSPICIOUS') NOT NULL"
        )
