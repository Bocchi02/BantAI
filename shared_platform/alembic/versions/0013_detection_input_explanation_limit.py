"""Bind detection input and share explanation budgets across account credentials.

Legacy input fingerprints intentionally remain NULL: input cannot be reconstructed
from minimized history. Such IDs require a new detection ID, never a guessed binding.
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_input_explanation_limit"
down_revision = "0012_remote_server_inference"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    activity_columns = {column["name"] for column in sa.inspect(bind).get_columns("activity_events")}
    user_columns = {column["name"] for column in sa.inspect(bind).get_columns("users")}
    if "inference_fingerprint" not in activity_columns:
        op.add_column("activity_events", sa.Column("inference_fingerprint", sa.String(64), nullable=True))
    if "explanation_window_started_at" not in user_columns:
        op.add_column("users", sa.Column("explanation_window_started_at", sa.DateTime(timezone=True), nullable=True))
    if "explanation_request_count" not in user_columns:
        op.add_column("users", sa.Column("explanation_request_count", sa.Integer(), nullable=False, server_default="0"))


def downgrade():
    bind = op.get_bind()
    activity_columns = {column["name"] for column in sa.inspect(bind).get_columns("activity_events")}
    user_columns = {column["name"] for column in sa.inspect(bind).get_columns("users")}
    if "explanation_request_count" in user_columns:
        op.drop_column("users", "explanation_request_count")
    if "explanation_window_started_at" in user_columns:
        op.drop_column("users", "explanation_window_started_at")
    if "inference_fingerprint" in activity_columns:
        op.drop_column("activity_events", "inference_fingerprint")
