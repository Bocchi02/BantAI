"""Align operational states, review provenance, and detector identifiers.

Revision ID: 0011_contracts_ops
Revises: 0010_auto_sampling
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0011_contracts_ops"
down_revision = "0010_auto_sampling"
branch_labels = None
depends_on = None


MODEL_TABLES = (
    "automatic_training_samples",
    "url_reports",
    "url_training_candidates",
    "email_reports",
    "email_training_candidates",
)


def _columns(bind, table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    if "activity_events" in tables:
        columns = _columns(bind, "activity_events")
        if "cloud_failure_category" not in columns:
            op.add_column("activity_events", sa.Column("cloud_failure_category", sa.String(length=64), nullable=True))
        if "duration_ms" not in columns:
            op.add_column("activity_events", sa.Column("duration_ms", sa.Integer(), nullable=True))

        dialect = bind.dialect.name
        if dialect == "mysql":
            op.execute(
                "ALTER TABLE activity_events MODIFY cloud_status "
                "ENUM('COMPLETE','SKIPPED','UNAVAILABLE') NOT NULL"
            )
        elif dialect == "postgresql":
            op.execute("ALTER TYPE cloudstatus ADD VALUE IF NOT EXISTS 'SKIPPED'")

    for table in ("url_reports", "email_reports"):
        if table in tables and "review_reason" not in _columns(bind, table):
            op.add_column(table, sa.Column("review_reason", sa.Text(), nullable=True))

    if "email_reports" in tables:
        columns = _columns(bind, "email_reports")
        if "activity_event_id" not in columns:
            with op.batch_alter_table("email_reports") as batch:
                batch.add_column(sa.Column("activity_event_id", sa.String(length=36), nullable=True))
                batch.create_foreign_key(
                    "fk_email_reports_activity_event_id",
                    "activity_events",
                    ["activity_event_id"],
                    ["id"],
                    ondelete="SET NULL",
                )
                batch.create_index("ix_email_reports_activity_event_id", ["activity_event_id"])
                batch.create_index(
                    "uq_email_report_user_activity",
                    ["user_id", "activity_event_id"],
                    unique=True,
                )

    for table in MODEL_TABLES:
        if table in tables and "detector_model_version" in _columns(bind, table):
            with op.batch_alter_table(table) as batch:
                batch.alter_column(
                    "detector_model_version",
                    existing_type=sa.String(length=40),
                    type_=sa.String(length=128),
                    existing_nullable=False,
                )


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "email_reports" in tables:
        indexes = {index["name"] for index in sa.inspect(bind).get_indexes("email_reports")}
        columns = _columns(bind, "email_reports")
        if "activity_event_id" in columns:
            foreign_keys = {
                foreign_key["name"]
                for foreign_key in sa.inspect(bind).get_foreign_keys("email_reports")
                if foreign_key.get("name")
                and foreign_key.get("constrained_columns") == ["activity_event_id"]
            }
            with op.batch_alter_table("email_reports") as batch:
                for name in foreign_keys:
                    batch.drop_constraint(name, type_="foreignkey")
                for name in ("uq_email_report_user_activity", "ix_email_reports_activity_event_id"):
                    if name in indexes:
                        batch.drop_index(name)
                batch.drop_column("activity_event_id")
    for table in ("url_reports", "email_reports"):
        if table in tables and "review_reason" in _columns(bind, table):
            with op.batch_alter_table(table) as batch:
                batch.drop_column("review_reason")
    if "activity_events" in tables:
        columns = _columns(bind, "activity_events")
        with op.batch_alter_table("activity_events") as batch:
            if "duration_ms" in columns:
                batch.drop_column("duration_ms")
            if "cloud_failure_category" in columns:
                batch.drop_column("cloud_failure_category")
