"""Add separate user name fields.

Revision ID: 0002_user_names
Revises: 0001_initial
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op


revision = "0002_user_names"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The initial MVP used create_all during local development. Online
    # inspection keeps this migration safe for both those databases and fresh
    # databases created by the historical 0001 migration.
    if context.is_offline_mode():
        return
    existing = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    added_first = "first_name" not in existing
    added_last = "last_name" not in existing
    if added_first:
        op.add_column("users", sa.Column("first_name", sa.String(length=80), nullable=False, server_default=""))
    if "middle_name" not in existing:
        op.add_column("users", sa.Column("middle_name", sa.String(length=80), nullable=True))
    if added_last:
        op.add_column("users", sa.Column("last_name", sa.String(length=80), nullable=False, server_default=""))
    op.execute(
        "UPDATE users SET first_name = 'BantAI', "
        "last_name = CASE WHEN role = 'ADMIN' THEN 'Administrator' ELSE 'User' END "
        "WHERE first_name = '' OR last_name = ''"
    )
    if added_first:
        op.alter_column("users", "first_name", server_default=None)
    if added_last:
        op.alter_column("users", "last_name", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "last_name")
    op.drop_column("users", "middle_name")
    op.drop_column("users", "first_name")
