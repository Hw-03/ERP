"""등록된 HTTP mutation의 폐쇄형 인증 분류."""

from __future__ import annotations

from enum import Enum

from fastapi import FastAPI
from fastapi.routing import APIRoute


MUTATION_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class MutationClass(str, Enum):
    VERIFIED_ACTOR = "verified_actor"
    AUTH_BOOTSTRAP = "auth_bootstrap"
    SYSTEM_EXCEPTION = "system_exception"


MutationKey = tuple[str, str]


# Public service call sites whose server-resolved Employee is part of the contract.
# The security gate discovers Employee-annotated service functions independently and
# compares both directions, so additions and removals must update this reviewed list.
SERVICE_ACTOR_CONSUMERS: dict[str, str] = {
    "app.services.defect_actions.quarantine_inventory": "actor",
    "app.services.defect_actions.unquarantine_inventory": "actor",
    "app.services.dept_adjustment.submit_adjustment": "actor",
    "app.services.dept_adjustment.submit_defective_disassemble": "actor",
    "app.services.dept_adjustment.submit_normal_disassemble": "actor",
    "app.services.handover.can_receive": "actor",
    "app.services.handover.create_handover": "author",
    "app.services.handover.receive_handover": "actor",
    "app.services.handover.save_handover_draft": "author",
    "app.services.handover.submit_handover": "author",
    "app.services.handover_actions.create_handover": "author",
    "app.services.handover_actions.delete_handover_draft": "author",
    "app.services.handover_actions.save_handover_draft": "author",
    "app.services.handover_actions.submit_handover": "author",
    "app.services.integrity.repair_inventory_totals": "actor",
    "app.services.inventory.reserve": "employee",
    "app.services.inventory_operation_cancellation.cancel_operation": "canceller",
    "app.services.io_actions.submit": "requester",
    "app.services.io_actions.submit_existing_draft": "requester",
    "app.services.io_dispatch.execute_batch_after_dept_approval": "approver",
    "app.services.io_dispatch.submit": "requester",
    "app.services.io_dispatch.submit_existing_draft": "requester",
    "app.services.io_draft.delete_draft": "requester",
    "app.services.io_draft.save_draft": "requester",
    "app.services.io_preview.validate_internal_use_requester": "requester",
    "app.services.io_preview.validate_warehouse_adjust_requester": "requester",
    "app.services.legacy_inventory_operation_adoption.adopt_and_cancel": "canceller",
    "app.services.production_receipt.execute_production_receipt": "actor",
    "app.services.rate_limit.verify_operator_pin": "actor",
    "app.services.shipping_actions.clear_checklist": "actor",
    "app.services.shipping_actions.component_change_preview": "actor",
    "app.services.shipping_actions.create_request": "actor",
    "app.services.shipping_actions.delete_request": "actor",
    "app.services.shipping_actions.execute_component_change": "actor",
    "app.services.shipping_actions.execute_component_change_independent": "actor",
    "app.services.shipping_actions.pickup_cancel": "actor",
    "app.services.shipping_actions.pickup_complete": "actor",
    "app.services.shipping_actions.prepare_cancel": "actor",
    "app.services.shipping_actions.prepare_complete": "actor",
    "app.services.shipping_actions.update_checklist": "actor",
    "app.services.shipping_actions.update_invoice": "actor",
    "app.services.shipping_actions.update_request": "actor",
    "app.services.sr_approval.approve_request": "approver",
    "app.services.sr_approval.approve_request_department": "approver",
    "app.services.sr_approval.cancel_request": "requester",
    "app.services.sr_approval.mark_failed_approval": "approver",
    "app.services.sr_approval.reject_request": "approver",
    "app.services.sr_approval.reject_request_department": "approver",
    "app.services.sr_execution.release_reservation": "actor",
    "app.services.sr_draft.delete_draft_request": "requester",
    "app.services.sr_draft.submit_draft_request": "requester",
    "app.services.sr_draft.upsert_draft_request": "requester",
    "app.services.sr_reservation.reserve_lines": "employee",
    "app.services.sr_validation.validate_request_entrypoint": "requester",
    "app.services.sr_validation.validate_requester_for_request_type": "requester",
    "app.services.stock_request_actions.approve_department_request": "approver",
    "app.services.stock_request_actions.approve_warehouse_request": "approver",
    "app.services.stock_request_actions.cancel_request": "requester",
    "app.services.stock_request_actions.create_request": "requester",
    "app.services.stock_request_actions.revert_to_draft": "requester",
    "app.services.stock_requests.create_manual_adjustment_request": "requester",
    "app.services.stock_requests.create_request": "requester",
    "app.services.transaction_actions.cancel_transaction": "canceller",
    "app.services.transaction_actions.correct_transaction_quantity": "editor",
    "app.services.transaction_actions.edit_transaction_metadata": "editor",
}


# Actor-like names in these pure authorization helpers are read-only duck-typed
# inputs, not mutation attribution. New exceptions require explicit review here.
SERVICE_ACTOR_LIKE_READ_ONLY_EXCEPTIONS: frozenset[str] = frozenset(
    {
        "app.services.dept_hierarchy.approvable_departments",
        "app.services.dept_hierarchy.can_approve_department",
    }
)


# Every module-owned public service function that cannot mutate persistent state.
# The security gate builds an independent AST call graph and rejects write
# reachability from any entry in this reviewed exact set.
SERVICE_READ_ONLY_EXPORTS: frozenset[str] = frozenset(
    {
        "app.services.activity_audit_export.available_months",
        "app.services.activity_audit_export.csv_buffer",
        "app.services.activity_audit_export.export_row",
        "app.services.activity_audit_export.monthly_logs",
        "app.services.activity_audit_export.utc_bounds",
        "app.services.audit_actor_session.get_verified_audit_actor_code",
        "app.services.audit_csv.row_from_log",
        "app.services.bom.bom_child_item_ordering",
        "app.services.bom.bom_modal_tree_child_ordering_key",
        "app.services.bom.build_bom_cache",
        "app.services.bom.direct_children",
        "app.services.bom.explode_bom",
        "app.services.bom.merge_requirements",
        "app.services.bom_stock_policy.bom_template_claims",
        "app.services.bom_stock_policy.has_valid_bom_auto_token",
        "app.services.bom_stock_policy.io_bom_auto_claims",
        "app.services.bom_stock_policy.is_bom_generated_line",
        "app.services.bom_stock_policy.should_skip_bom_inventory",
        "app.services.codes.format_mes_code",
        "app.services.codes.generate_code",
        "app.services.codes.next_serial",
        "app.services.codes.parse_mes_code",
        "app.services.codes.validate_code",
        "app.services.command_idempotency.fingerprint_io_draft_submit",
        "app.services.command_idempotency.fingerprint_io_submit",
        "app.services.command_idempotency.fingerprint_stock_request_create",
        "app.services.command_idempotency.require_matching_fingerprint",
        "app.services.dept_adjustment.build_disassembly_template",
        "app.services.dept_adjustment.build_production_template",
        "app.services.dept_adjustment.expand_component",
        "app.services.dept_adjustment.rework_inventory_item_ids",
        "app.services.dept_hierarchy.approvable_departments",
        "app.services.dept_hierarchy.can_approve_department",
        "app.services.dept_hierarchy.is_production_line",
        "app.services.export_helpers.csv_streaming_response",
        "app.services.f704_02_ledger.collect_entries",
        "app.services.f704_02_ledger.render_workbook",
        "app.services.f705_02_production_log.collect_daily_quantities",
        "app.services.f705_02_production_log.render_workbook",
        "app.services.integrity.check_inventory_consistency",
        "app.services.inv_base.dept_for_process_type",
        "app.services.inv_base.lock_inventories",
        "app.services.inv_calc.available",
        "app.services.inv_calc.defective_total",
        "app.services.inv_calc.production_total",
        "app.services.inv_effect.effect_diff",
        "app.services.inv_effect.summarize_stock_cells",
        "app.services.inv_transfer.department_for_item",
        "app.services.inv_transfer.format_item_location_shortage",
        "app.services.inv_transfer.item_department_stock",
        "app.services.io_draft.build_idempotent_response",
        "app.services.io_draft.find_by_client_request_id",
        "app.services.io_draft.get_draft",
        "app.services.io_draft.list_drafts",
        "app.services.io_persist.ensure_batch_is_mutable",
        "app.services.io_persist.ensure_stock_request_batch_is_mutable",
        "app.services.io_persist.get_batch",
        "app.services.io_preview.preview",
        "app.services.io_preview.validate_internal_use_bundles",
        "app.services.io_preview.validate_internal_use_operation",
        "app.services.io_preview.validate_operation_sources",
        "app.services.io_preview.validate_warehouse_adjust_operation",
        "app.services.inventory_integrity.diagnose_inventory_integrity",
        "app.services.inventory_operation_cancellation.is_same_kst_week",
        "app.services.inventory_operation_cancellation.normalized_effect_for_cancellation",
        "app.services.inventory_operation_cancellation.preview_cancellation",
        "app.services.inventory_operations.cutover_at",
        "app.services.inventory_operations.is_ledger_active",
        "app.services.item_display_order.default_item_display_order",
        "app.services.item_lifecycle.active_item_references",
        "app.services.notifications.recipients_for_department_approval",
        "app.services.notifications.recipients_for_handover",
        "app.services.notifications.recipients_for_warehouse_approval",
        "app.services.operator_session.hash_session_token",
        "app.services.operator_session.resolve_session",
        "app.services.operator_session.resolve_session_and_lock_employee",
        "app.services.operator_session.resolve_session_and_lock_employees",
        "app.services.operator_session.utc_now",
        "app.services.pin_auth.hash_pin",
        "app.services.pin_auth.validate_pin",
        "app.services.pin_auth.verify_pin",
        "app.services.pin_auth.verify_pin_and_upgrade",
        "app.services.production_capacity.build_af_capacity_bom_cache",
        "app.services.production_capacity.build_reverse_bom",
        "app.services.production_capacity.compute_af_capacity",
        "app.services.production_capacity.compute_additional_producible_quantity",
        "app.services.production_capacity.compute_capacity",
        "app.services.production_capacity.compute_legacy_capacity",
        "app.services.production_capacity.is_production_capacity_ignored",
        "app.services.production_capacity.select_auto_representatives",
        "app.services.rate_limit.admin_credential_key",
        "app.services.rate_limit.credential_key",
        "app.services.rate_limit.effective_client_ip",
        "app.services.rate_limit.operator_login_kdf_ip_key",
        "app.services.rate_limit.operator_login_ip_key",
        "app.services.rate_limit.operator_session_issuance_key",
        "app.services.shipping.component_change_preview_independent",
        "app.services.shipping.get_request",
        "app.services.shipping.match_bom",
        "app.services.sr_draft.get_draft_request",
        "app.services.sr_draft.list_draft_requests",
        "app.services.sr_reservation.aggregate_reservations",
        "app.services.sr_validation.line_requires_approval",
        "app.services.sr_validation.line_requires_pending",
        "app.services.sr_validation.request_requires_approval",
        "app.services.sr_validation.validate_line_shape_for_request_type",
        "app.services.stock_math.bulk_compute",
        "app.services.stock_math.compute_for",
        "app.services.stock_math.figures_from_inventory",
        "app.services.stock_requests.list_active_reservations",
        "app.services.transaction_actions.lock_transaction_operation_and_log",
        "app.services.transaction_display_groups.build_display_groups",
        "app.services.warehouse_map.boxes_total_for_item",
        "app.services.warehouse_map.build_map_payload",
        "app.services.warehouse_map.build_special_zone_payloads",
        "app.services.warehouse_map.department_for_item",
        "app.services.warehouse_map.is_box_tracking_enabled",
        "app.services.warehouse_map.lock_box_with_stable_contents",
        "app.services.warehouse_map.lock_warehouse_map_rows",
        "app.services.warehouse_map.lock_zone_for_deactivation",
        "app.services.warehouse_map.reconcile_inventory",
        "app.services.weekly_inventory_snapshot.latest_completed_sunday",
        "app.services.weekly_inventory_snapshot.load_dashboard_finished_stock",
        "app.services.weekly_inventory_snapshot.sunday_cutoff_utc",
        "app.services.weekly_report_contract.classify_inventory_activity",
        "app.services.weekly_report_contract.weekly_contract_state",
    }
)


_AUDIT_INFRASTRUCTURE_REASON = (
    "인증된 route transaction의 감사·파일 export side effect를 담당하는 기반 경계"
)
_AUTH_INFRASTRUCTURE_REASON = (
    "operator 인증 bootstrap·폐기 및 in-process rate-limit 상태를 담당하는 기반 경계"
)
_RUNTIME_INFRASTRUCTURE_REASON = (
    "프로세스 lifecycle listener 또는 명시적 운영 import를 담당하는 기반 경계"
)
_IDEMPOTENCY_LOCK_INFRASTRUCTURE_REASON = (
    "인증된 업무 명령 transaction의 route 공통 key 직렬화를 담당하는 기반 경계"
)
_INVENTORY_OPERATION_MAINTENANCE_REASON = (
    "명시적 재고 원장 운영 CLI의 진단 보정·전향 활성화를 담당하는 기반 경계"
)
_WEEKLY_SNAPSHOT_INFRASTRUCTURE_REASON = (
    "첫 write 또는 예약 작업에서 주간 재고 snapshot을 원자적으로 확정하는 기반 경계"
)


# Non-business infrastructure mutations cannot accept a VerifiedActor by design.
# This is an exact, reasoned set: no module/name heuristic can auto-admit additions.
SERVICE_INFRASTRUCTURE_MUTATION_REASONS: dict[str, str] = {
    "app.services._tx.transactional": _RUNTIME_INFRASTRUCTURE_REASON,
    "app.services.command_idempotency.lock_idempotency_key": _IDEMPOTENCY_LOCK_INFRASTRUCTURE_REASON,
    "app.services.activity_audit.record": _AUDIT_INFRASTRUCTURE_REASON,
    "app.services.audit.record": _AUDIT_INFRASTRUCTURE_REASON,
    "app.services.audit_actor_session.clear_audit_actor_cookie": _AUTH_INFRASTRUCTURE_REASON,
    "app.services.audit_actor_session.set_audit_actor_cookie": _AUTH_INFRASTRUCTURE_REASON,
    "app.services.audit_csv.backfill_all": _AUDIT_INFRASTRUCTURE_REASON,
    "app.services.audit_csv.get_csv_dir": _AUDIT_INFRASTRUCTURE_REASON,
    "app.services.audit_csv.list_available_months": _AUDIT_INFRASTRUCTURE_REASON,
    "app.services.audit_csv.path_for_month": _AUDIT_INFRASTRUCTURE_REASON,
    "app.services.audit_csv.register_session_listeners": _AUDIT_INFRASTRUCTURE_REASON,
    "app.services.inventory_integrity_repair.repair_inventory_integrity_issue": _INVENTORY_OPERATION_MAINTENANCE_REASON,
    "app.services.inventory_operation_activation.activate_inventory_operation_contract": _INVENTORY_OPERATION_MAINTENANCE_REASON,
    "app.services.operator_session.create_session": _AUTH_INFRASTRUCTURE_REASON,
    "app.services.operator_session.revoke_employee_sessions": _AUTH_INFRASTRUCTURE_REASON,
    "app.services.operator_session.revoke_session": _AUTH_INFRASTRUCTURE_REASON,
    "app.services.rate_limit.admit_attempt": _AUTH_INFRASTRUCTURE_REASON,
    "app.services.rate_limit.is_blocked": _AUTH_INFRASTRUCTURE_REASON,
    "app.services.rate_limit.record_failure": _AUTH_INFRASTRUCTURE_REASON,
    "app.services.rate_limit.record_success": _AUTH_INFRASTRUCTURE_REASON,
    "app.services.rate_limit.release_attempt": _AUTH_INFRASTRUCTURE_REASON,
    "app.services.rate_limit.reset_all": _AUTH_INFRASTRUCTURE_REASON,
    "app.services.realtime.register_session_listeners": _RUNTIME_INFRASTRUCTURE_REASON,
    "app.services.realtime.suppress_realtime_revision": _RUNTIME_INFRASTRUCTURE_REASON,
    "app.services.realtime.unregister_session_listeners": _RUNTIME_INFRASTRUCTURE_REASON,
    "app.services.seed_cleanup.run_cleanup_import": _RUNTIME_INFRASTRUCTURE_REASON,
    "app.services.weekly_inventory_snapshot.capture_due_weekly_inventory_snapshot": _WEEKLY_SNAPSHOT_INFRASTRUCTURE_REASON,
    "app.services.weekly_inventory_snapshot.capture_weekly_inventory_snapshot": _WEEKLY_SNAPSHOT_INFRASTRUCTURE_REASON,
    "app.services.weekly_inventory_snapshot.ensure_due_snapshot_committed": _WEEKLY_SNAPSHOT_INFRASTRUCTURE_REASON,
    "app.services.weekly_report_contract.build_verified_weekly_report": _WEEKLY_SNAPSHOT_INFRASTRUCTURE_REASON,
}


# inventory.py exposes only reads and actor-required mutation entrypoints.
# Low-level stock mutators stay underscore-private behind reviewed action services.
INVENTORY_READ_ONLY_SERVICE_EXPORTS: frozenset[str] = frozenset(
    {
        "app.services.inventory.available",
        "app.services.inventory.defective_total",
        "app.services.inventory.department_for_item",
        "app.services.inventory.dept_for_process_type",
        "app.services.inventory.format_item_location_shortage",
        "app.services.inventory.item_department_stock",
        "app.services.inventory.lock_inventories",
        "app.services.inventory.production_total",
    }
)


STOCK_RESERVATION_READ_ONLY_SERVICE_EXPORTS: frozenset[str] = frozenset(
    {"app.services.sr_reservation.aggregate_reservations"}
)


# shipping.py is an internal core. Its only reviewed public exports are reads;
# every shipping mutation must cross shipping_actions and require Employee actor.
SHIPPING_READ_ONLY_SERVICE_EXPORTS: frozenset[str] = frozenset(
    {
        "app.services.shipping.component_change_preview_independent",
        "app.services.shipping.get_request",
        "app.services.shipping.match_bom",
    }
)


AUTH_BOOTSTRAP_MUTATION_REASONS: dict[MutationKey, str] = {
    ("POST", "/api/operator-session"): "PIN을 검증해 최초 operator/challenge 세션을 발급",
    (
        "POST",
        "/api/operator-session/complete-pin-change",
    ): "1회성 challenge만으로 기본 PIN을 교체하며 operator actor로 승격하지 않음",
    (
        "DELETE",
        "/api/operator-session",
    ): "요청 cookie의 DB 세션을 idempotent하게 폐기하며 만료·변조 cookie도 actor 없이 안전하게 종료",
    (
        "POST",
        "/api/employees/{employee_id}/verify-pin",
    ): "한 release 호환 alias이며 canonical session 발급 계약을 그대로 호출",
}
AUTH_BOOTSTRAP_MUTATIONS: frozenset[MutationKey] = frozenset(
    AUTH_BOOTSTRAP_MUTATION_REASONS
)

SYSTEM_MUTATION_EXCEPTION_REASONS: dict[MutationKey, str] = {
    (
        "POST",
        "/api/health/write-check",
    ): "운영 health probe가 독립 transaction에서 임시 행을 rollback하는 system endpoint",
}
SYSTEM_MUTATION_EXCEPTIONS: frozenset[MutationKey] = frozenset(
    SYSTEM_MUTATION_EXCEPTION_REASONS
)


def classify_registered_mutations(app: FastAPI) -> dict[MutationKey, MutationClass]:
    """실제 등록 집합을 분류해 새 route가 무분류 상태로 숨을 수 없게 한다."""
    classified: dict[MutationKey, MutationClass] = {}
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in route.methods & MUTATION_METHODS:
            key = (method, route.path)
            if key in AUTH_BOOTSTRAP_MUTATIONS:
                category = MutationClass.AUTH_BOOTSTRAP
            elif key in SYSTEM_MUTATION_EXCEPTIONS:
                category = MutationClass.SYSTEM_EXCEPTION
            else:
                category = MutationClass.VERIFIED_ACTOR
            classified[key] = category
    return classified
