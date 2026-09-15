"""Track one server-side automatic-sampling decision per completed detection.

Revision ID: 0012_remote_server_inference
Revises: 0011_contracts_ops
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_remote_server_inference"
down_revision = "0011_contracts_ops"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("activity_events")}
    if "automatic_sample_decided_at" not in columns:
        op.add_column("activity_events", sa.Column("automatic_sample_decided_at", sa.DateTime(timezone=True), nullable=True))
    if "automatic_sample_selected" not in columns:
        op.add_column("activity_events", sa.Column("automatic_sample_selected", sa.Boolean(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("activity_events")}
    if "automatic_sample_selected" in columns:
        op.drop_column("activity_events", "automatic_sample_selected")
    if "automatic_sample_decided_at" in columns:
        op.drop_column("activity_events", "automatic_sample_decided_at")
