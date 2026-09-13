"""Separate the legacy ledger activation from the v2 evidence rollout."""

from datetime import UTC, datetime

from alembic import context, op
import sqlalchemy as sa

revision = "20260911_0036"
down_revision = "20260911_0035"
branch_labels = None
depends_on = None

V1_KEY = "inventory_operation_cutover_at"
V2_KEY = "inventory_operation_v2_cutover_at"

EMPLOYEE_AUTO_DEPLOY_POLICY = {
    "kind": "data-change",
    "allowed_tables": ["system_settings", "stock_request_lines"],
    "validator_sql": (
        "SELECT (SELECT COUNT(*) FROM stock_request_lines AS line "
        "JOIN stock_requests AS request ON request.request_id = line.request_id "
        "WHERE request.status = 'FAILED_APPROVAL' AND line.status IN ('RESERVED', 'SUBMITTED')) "
        "+ (SELECT COUNT(*) FROM system_settings AS legacy "
        "WHERE legacy.setting_key = 'inventory_operation_cutover_at' AND NOT EXISTS "
        "(SELECT 1 FROM system_settings WHERE setting_key = 'inventory_operation_v2_cutover_at'))"
    ),
    "validator_expected": 0,
}


def _capture_state(bind: sa.Connection) -> dict:
    """Keep comparison data in memory; never log business rows or settings."""
    return {
        "settings": dict(bind.execute(sa.text("SELECT setting_key, setting_value FROM system_settings")).all()),
        "lines": [dict(row) for row in bind.execute(sa.text("SELECT * FROM stock_request_lines ORDER BY line_id")).mappings()],
    }


def _assert_allowed_delta(before: dict, after: dict, failed_lines: set[int], new_cutoff: str | None) -> None:
    """Allow only the declared cutoff insertion and specific failed line statuses."""
    expected_settings = dict(before["settings"])
    if new_cutoff is not None:
        expected_settings[V2_KEY] = new_cutoff
    expected_lines = [dict(row) for row in before["lines"]]
    for row in expected_lines:
        if row["line_id"] in failed_lines:
            row["status"] = "FAILED_APPROVAL"
    if after != {"settings": expected_settings, "lines": expected_lines}:
        raise RuntimeError("Legacy ledger migration made an unapproved business data change")


def upgrade() -> None:
    """Preserve all quantities/effects and record the first v2 enforcement boundary."""
    if context.is_offline_mode():
        raise RuntimeError("Legacy ledger compatibility requires an online database")
    bind = op.get_bind()
    before = _capture_state(bind)
    failed_lines = set(bind.execute(sa.text(
        "SELECT line_id FROM stock_request_lines WHERE status IN ('RESERVED', 'SUBMITTED') "
        "AND request_id IN (SELECT request_id FROM stock_requests WHERE status = 'FAILED_APPROVAL')"
    )).scalars())
    new_cutoff = None
    settings = dict(bind.execute(sa.text(
        "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (:v1, :v2)"
    ), {"v1": V1_KEY, "v2": V2_KEY}).all())
    if V1_KEY in settings and V2_KEY not in settings:
        first_v2 = bind.execute(sa.text(
            "SELECT MIN(effective_at) FROM inventory_operations WHERE contract_version >= 2"
        )).scalar_one_or_none()
        cutoff = datetime.now(UTC)
        if first_v2 is not None:
            parsed = first_v2 if isinstance(first_v2, datetime) else datetime.fromisoformat(str(first_v2))
            parsed = parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)
            cutoff = min(cutoff, parsed)
        new_cutoff = cutoff.isoformat()
        bind.execute(sa.text(
            "INSERT INTO system_settings (setting_key, setting_value) VALUES (:key, :value)"
        ), {"key": V2_KEY, "value": new_cutoff})

    # Old failure handling finalized only the parent. Do not touch executed lines,
    # requests, quantities, reservations, timestamps, or transaction evidence.
    bind.execute(sa.text(
        "UPDATE stock_request_lines SET status = 'FAILED_APPROVAL' "
        "WHERE status IN ('RESERVED', 'SUBMITTED') AND request_id IN "
        "(SELECT request_id FROM stock_requests WHERE status = 'FAILED_APPROVAL')"
    ))
    _assert_allowed_delta(before, _capture_state(bind), failed_lines, new_cutoff)


def downgrade() -> None:
    """Do not resurrect failed requests or erase the recorded rollout boundary."""
