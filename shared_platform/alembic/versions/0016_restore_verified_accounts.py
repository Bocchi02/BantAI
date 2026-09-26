"""Restore verified accounts and hashed one-time account tokens.

Revision ID: 0016_restore_verified_accounts
Revises: 0015_signalam_brand_placeholders
"""

from alembic import op
import sqlalchemy as sa


revision = "0016_restore_verified_accounts"
down_revision = "0015_signalam_brand_placeholders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if bind.dialect.name == "mysql":
        op.execute("ALTER TABLE users MODIFY COLUMN status ENUM('PENDING_VERIFICATION','ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE'")
    if "verified_at" not in user_columns:
        op.add_column("users", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))
    # Existing accounts were admitted before email verification existed.
    op.execute("UPDATE users SET verified_at = created_at WHERE status = 'ACTIVE' AND verified_at IS NULL")

    if not inspector.has_table("account_tokens"):
        op.create_table(
            "account_tokens",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token_hash", sa.String(64), nullable=False),
            sa.Column("purpose", sa.Enum("EMAIL_VERIFICATION", "PASSWORD_RESET", name="tokenpurpose"), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_account_tokens_user_id", "account_tokens", ["user_id"])
        op.create_index("ix_account_tokens_token_hash", "account_tokens", ["token_hash"], unique=True)
        op.create_index("ix_account_tokens_expires_at", "account_tokens", ["expires_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("account_tokens"):
        op.drop_table("account_tokens")
    if "verified_at" in {column["name"] for column in inspector.get_columns("users")}:
        op.drop_column("users", "verified_at")
    if bind.dialect.name == "mysql":
        op.execute("UPDATE users SET status = 'ACTIVE' WHERE status = 'PENDING_VERIFICATION'")
        op.execute("ALTER TABLE users MODIFY COLUMN status ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE'")
