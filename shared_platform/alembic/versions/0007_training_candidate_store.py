"""Add a de-identified durable URL training-candidate store.

Revision ID: 0007_training_store
Revises: 0006_feedback_candidates
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op


revision = "0007_training_store"
down_revision = "0006_feedback_candidates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    if "url_training_candidates" in set(sa.inspect(bind).get_table_names()):
        return
    op.create_table(
        "url_training_candidates",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("origin_encrypted", sa.Text(), nullable=False),
        sa.Column("origin_fingerprint", sa.String(length=64), nullable=False),
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
            "approved_label",
            sa.Enum("LEGITIMATE", "SUSPICIOUS", "INCONCLUSIVE", name="adminurlassessment"),
            nullable=False,
        ),
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
        sa.Column(
            "feedback_source",
            sa.Enum("RECENT_DETECTION", "MANUAL_ENTRY", name="feedbacksource"),
            nullable=False,
        ),
        sa.Column("detector_model_version", sa.String(length=40), nullable=False),
        sa.Column("evidence_count", sa.Integer(), nullable=False),
        sa.Column("first_approved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_approved_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "approved_label IN ('LEGITIMATE', 'SUSPICIOUS')",
            name="ck_training_candidate_label",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "origin_fingerprint",
            "detector_model_version",
            name="uq_training_candidate_origin_model",
        ),
    )
    op.create_index(
        "ix_training_candidate_label_approved",
        "url_training_candidates",
        ["approved_label", "last_approved_at"],
    )


def downgrade() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    if "url_training_candidates" in set(sa.inspect(bind).get_table_names()):
        op.drop_table("url_training_candidates")
