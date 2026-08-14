"""Add privacy-minimized website correction reports.

Revision ID: 0004_url_reports
Revises: 0003_remove_email_account_flows
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op


revision = "0004_url_reports"
down_revision = "0003_remove_email_account_flows"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if context.is_offline_mode():
        return

    bind = op.get_bind()
    if "url_reports" in set(sa.inspect(bind).get_table_names()):
        return

    op.create_table(
        "url_reports",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("activity_event_id", sa.String(length=36), nullable=True),
        sa.Column("origin_encrypted", sa.Text(), nullable=False),
        sa.Column(
            "detector_outcome",
            sa.Enum(
                "NO_STRONG_WARNING_SIGNS",
                "NEEDS_CAUTION",
                "SUSPICIOUS_SIGNS_FOUND",
                name="outcome",
            ),
            nullable=False,
        ),
        sa.Column(
            "user_classification",
            sa.Enum("LEGITIMATE", "SUSPICIOUS", name="urlreportclassification"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("PENDING", "REVIEWED", name="urlreportstatus"),
            nullable=False,
        ),
        sa.Column(
            "admin_assessment",
            sa.Enum("LEGITIMATE", "SUSPICIOUS", "INCONCLUSIVE", name="adminurlassessment"),
            nullable=True,
        ),
        sa.Column("reviewed_by", sa.String(length=36), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "(status = 'PENDING' AND admin_assessment IS NULL AND reviewed_at IS NULL) OR "
            "(status = 'REVIEWED' AND admin_assessment IS NOT NULL AND reviewed_at IS NOT NULL)",
            name="ck_url_report_review_shape",
        ),
        sa.ForeignKeyConstraint(["activity_event_id"], ["activity_events.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "activity_event_id", name="uq_url_report_user_activity"),
    )
    op.create_index("ix_url_reports_user_id", "url_reports", ["user_id"])
    op.create_index("ix_url_reports_activity_event_id", "url_reports", ["activity_event_id"])
    op.create_index("ix_url_reports_status_submitted", "url_reports", ["status", "submitted_at"])


def downgrade() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    if "url_reports" in set(sa.inspect(bind).get_table_names()):
        op.drop_table("url_reports")
