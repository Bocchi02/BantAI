"""Allow privacy-minimized manually entered website reports.

Revision ID: 0005_manual_url_report_input
Revises: 0004_url_reports
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op


revision = "0005_manual_url_report_input"
down_revision = "0004_url_reports"
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
    if "origin_fingerprint" not in columns:
        op.add_column("url_reports", sa.Column("origin_fingerprint", sa.String(length=64), nullable=True))

    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("url_reports")}
    constraints = {constraint["name"] for constraint in sa.inspect(bind).get_unique_constraints("url_reports")}
    if "uq_url_report_user_origin" not in indexes | constraints:
        op.create_unique_constraint(
            "uq_url_report_user_origin",
            "url_reports",
            ["user_id", "origin_fingerprint"],
        )


def downgrade() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "url_reports" not in set(inspector.get_table_names()):
        return
    constraints = {constraint["name"] for constraint in inspector.get_unique_constraints("url_reports")}
    if "uq_url_report_user_origin" in constraints:
        op.drop_constraint("uq_url_report_user_origin", "url_reports", type_="unique")
    columns = {column["name"] for column in sa.inspect(bind).get_columns("url_reports")}
    if "origin_fingerprint" in columns:
        op.drop_column("url_reports", "origin_fingerprint")
