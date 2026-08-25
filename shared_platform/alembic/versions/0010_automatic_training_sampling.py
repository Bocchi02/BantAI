"""Add opt-in automatic training-data sampling.

Revision ID: 0010_auto_sampling
Revises: 0009_email_training
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op


revision = "0010_auto_sampling"
down_revision = "0009_email_training"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "training_collection_enabled" not in user_columns:
        op.add_column("users", sa.Column("training_collection_enabled", sa.Boolean(), server_default=sa.false(), nullable=False))
    if "training_consent_at" not in user_columns:
        op.add_column("users", sa.Column("training_consent_at", sa.DateTime(timezone=True), nullable=True))
    if "training_consent_version" not in user_columns:
        op.add_column("users", sa.Column("training_consent_version", sa.String(length=20), nullable=True))

    if "automatic_training_samples" not in set(inspector.get_table_names()):
        op.create_table(
            "automatic_training_samples",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("device_id", sa.String(length=36), nullable=False),
            sa.Column("client_event_id", sa.String(length=128), nullable=False),
            sa.Column("event_type", sa.Enum("URL", "EMAIL", name="eventtype"), nullable=False),
            sa.Column("url_ciphertext", sa.Text(), nullable=True),
            sa.Column("provider", sa.String(length=20), nullable=True),
            sa.Column("sender_encrypted", sa.Text(), nullable=True),
            sa.Column("subject_encrypted", sa.Text(), nullable=True),
            sa.Column("body_ciphertext", sa.Text(), nullable=True),
            sa.Column("content_fingerprint", sa.String(length=64), nullable=False),
            sa.Column("body_character_count", sa.Integer(), nullable=True),
            sa.Column("detector_outcome", sa.Enum("NO_STRONG_WARNING_SIGNS", "NEEDS_CAUTION", "SUSPICIOUS_SIGNS_FOUND", name="outcome"), nullable=False),
            sa.Column("detector_model_version", sa.String(length=40), nullable=False),
            sa.Column("consent_version", sa.String(length=20), nullable=False),
            sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint(
                "(event_type = 'URL' AND url_ciphertext IS NOT NULL AND provider IS NULL AND sender_encrypted IS NULL AND subject_encrypted IS NULL AND body_ciphertext IS NULL) OR "
                "(event_type = 'EMAIL' AND url_ciphertext IS NULL AND provider IS NOT NULL AND body_ciphertext IS NOT NULL)",
                name="ck_auto_sample_content_shape",
            ),
            sa.ForeignKeyConstraint(["device_id"], ["paired_devices.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("device_id", "client_event_id", name="uq_auto_sample_device_event"),
        )
        op.create_index("ix_automatic_training_samples_user_id", "automatic_training_samples", ["user_id"])
        op.create_index("ix_automatic_training_samples_device_id", "automatic_training_samples", ["device_id"])
        op.create_index("ix_automatic_training_samples_content_fingerprint", "automatic_training_samples", ["content_fingerprint"])
        op.create_index("ix_automatic_training_samples_occurred_at", "automatic_training_samples", ["occurred_at"])
        op.create_index("ix_auto_sample_type_created", "automatic_training_samples", ["event_type", "created_at"])
        op.create_index("ix_auto_sample_user_created", "automatic_training_samples", ["user_id", "created_at"])


def downgrade() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "automatic_training_samples" in tables:
        op.drop_table("automatic_training_samples")
    user_columns = {column["name"] for column in sa.inspect(bind).get_columns("users")}
    for name in ("training_consent_version", "training_consent_at", "training_collection_enabled"):
        if name in user_columns:
            op.drop_column("users", name)
