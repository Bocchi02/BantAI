"""Remove email verification and email-based password recovery.

Revision ID: 0003_remove_email_account_flows
Revises: 0002_user_names
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op


revision = "0003_remove_email_account_flows"
down_revision = "0002_user_names"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if context.is_offline_mode():
        return

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "users" in tables:
        columns = {column["name"] for column in inspector.get_columns("users")}
        op.execute("UPDATE users SET status = 'ACTIVE' WHERE status = 'PENDING_VERIFICATION'")
        if bind.dialect.name == "mysql":
            op.execute(
                "ALTER TABLE users MODIFY COLUMN status "
                "ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE'"
            )
        if "verified_at" in columns:
            op.drop_column("users", "verified_at")

    if "account_tokens" in tables:
        op.drop_table("account_tokens")


def downgrade() -> None:
    if context.is_offline_mode():
        return

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "users" in tables:
        columns = {column["name"] for column in inspector.get_columns("users")}
        if "verified_at" not in columns:
            op.add_column("users", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))
        if bind.dialect.name == "mysql":
            op.execute(
                "ALTER TABLE users MODIFY COLUMN status "
                "ENUM('PENDING_VERIFICATION','ACTIVE','SUSPENDED') "
                "NOT NULL DEFAULT 'PENDING_VERIFICATION'"
            )

    if "account_tokens" not in tables:
        op.create_table(
            "account_tokens",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column(
                "purpose",
                sa.Enum("EMAIL_VERIFICATION", "PASSWORD_RESET", name="tokenpurpose"),
                nullable=False,
            ),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_account_tokens_user_id", "account_tokens", ["user_id"])
        op.create_index("ix_account_tokens_token_hash", "account_tokens", ["token_hash"], unique=True)
        op.create_index("ix_account_tokens_expires_at", "account_tokens", ["expires_at"])

