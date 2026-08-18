"""Add encrypted, explicit email feedback and training candidates.

Revision ID: 0009_email_training
Revises: 0008_explicit_feedback
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op


revision = "0009_email_training"
down_revision = "0008_explicit_feedback"
branch_labels = None
depends_on = None


def outcome_enum() -> sa.Enum:
    return sa.Enum(
        "NO_STRONG_WARNING_SIGNS",
        "NEEDS_CAUTION",
        "SUSPICIOUS_SIGNS_FOUND",
        name="outcome",
    )


def classification_enum() -> sa.Enum:
    return sa.Enum("LEGITIMATE", "SUSPICIOUS", "UNSURE", name="urlreportclassification")


def assessment_enum() -> sa.Enum:
    return sa.Enum("LEGITIMATE", "SUSPICIOUS", "INCONCLUSIVE", name="adminurlassessment")


def reason_enum() -> sa.Enum:
    return sa.Enum(
        "TRUSTED_OR_OFFICIAL",
        "INCORRECT_WARNING",
        "MISSED_WARNING",
        "IMPERSONATION_OR_DECEPTIVE",
        "OTHER",
        name="feedbackreason",
    )


def upgrade() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "email_reports" not in tables:
        op.create_table(
            "email_reports",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("provider", sa.String(length=20), nullable=False),
            sa.Column("sender_encrypted", sa.Text(), nullable=False),
            sa.Column("subject_encrypted", sa.Text(), nullable=False),
            sa.Column("body_ciphertext", sa.Text(), nullable=False),
            sa.Column("body_fingerprint", sa.String(length=64), nullable=False),
            sa.Column("body_character_count", sa.Integer(), nullable=False),
            sa.Column("detector_outcome", outcome_enum(), nullable=False),
            sa.Column("user_classification", classification_enum(), nullable=False),
            sa.Column("feedback_reason", reason_enum(), nullable=True),
            sa.Column(
                "training_status",
                sa.Enum("PENDING", "APPROVED", "REJECTED", "INCONCLUSIVE", name="trainingstatus"),
                nullable=False,
            ),
            sa.Column("detector_model_version", sa.String(length=40), nullable=False),
            sa.Column("status", sa.Enum("PENDING", "REVIEWED", name="urlreportstatus"), nullable=False),
            sa.Column("admin_assessment", assessment_enum(), nullable=True),
            sa.Column("reviewed_by", sa.String(length=36), nullable=True),
            sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.CheckConstraint(
                "(status = 'PENDING' AND admin_assessment IS NULL AND reviewed_at IS NULL) OR "
                "(status = 'REVIEWED' AND admin_assessment IS NOT NULL AND reviewed_at IS NOT NULL)",
                name="ck_email_report_review_shape",
            ),
            sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "body_fingerprint", name="uq_email_report_user_body"),
        )
        op.create_index("ix_email_reports_user_id", "email_reports", ["user_id"])
        op.create_index("ix_email_reports_status_submitted", "email_reports", ["status", "submitted_at"])
        op.create_index(
            "ix_email_reports_training_status_submitted",
            "email_reports",
            ["training_status", "submitted_at"],
        )

    tables = set(sa.inspect(bind).get_table_names())
    if "email_training_candidates" not in tables:
        op.create_table(
            "email_training_candidates",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("provider", sa.String(length=20), nullable=False),
            sa.Column("sender_encrypted", sa.Text(), nullable=False),
            sa.Column("subject_encrypted", sa.Text(), nullable=False),
            sa.Column("body_ciphertext", sa.Text(), nullable=False),
            sa.Column("body_fingerprint", sa.String(length=64), nullable=False),
            sa.Column("body_character_count", sa.Integer(), nullable=False),
            sa.Column("detector_outcome", outcome_enum(), nullable=False),
            sa.Column("approved_label", assessment_enum(), nullable=False),
            sa.Column("feedback_reason", reason_enum(), nullable=True),
            sa.Column("detector_model_version", sa.String(length=40), nullable=False),
            sa.Column("evidence_count", sa.Integer(), nullable=False),
            sa.Column("first_approved_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_approved_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint(
                "approved_label IN ('LEGITIMATE', 'SUSPICIOUS')",
                name="ck_email_training_candidate_label",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "body_fingerprint",
                "detector_model_version",
                name="uq_email_candidate_body_model",
            ),
        )
        op.create_index(
            "ix_email_candidate_label_approved",
            "email_training_candidates",
            ["approved_label", "last_approved_at"],
        )


def downgrade() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "email_training_candidates" in tables:
        op.drop_table("email_training_candidates")
    if "email_reports" in tables:
        op.drop_table("email_reports")
