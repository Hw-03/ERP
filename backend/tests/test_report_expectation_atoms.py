"""동결된 주간 화면 밖에서 검증하는 다중 구성품 전환 보존 조건."""

from types import SimpleNamespace

from app.models import InventoryOperationRoleEnum, TransactionTypeEnum
from app.services.weekly_report_contract import classify_inventory_activity


def test_weekly_api_explains_actual_finished_item_scope_and_distinct_model_production(client):
    response = client.get("/api/inventory/weekly-report?week_start=2026-08-03&week_end=2026-08-09")
    assert response.status_code == 200
    scope = response.json()["aggregation_scope"]
    assert scope["inventory"] == "공정별·품목별·전체 합계는 주간보고 대상 완료품 TF·HF·VF·NF·AF·PF와 선택 주차에 허용된 중간공정 예외 품목을 합산합니다. 모든 원자재·중간공정 품목의 합계는 아닙니다."
    assert scope["production_matrix"] == "모델별 생산은 품목 전환을 제외한 TF~AF 생산과 PF 출하 픽업 완료를 구분하여 합산합니다. 재고 증감 전체를 생산으로 집계하지 않습니다."
    assert scope["verified_cancellation"] == "basis_version=2 검산 자료는 같은 주차에서 취소된 원·역작업을 함께 제외합니다. 주차 밖 원작업의 취소는 출하 준비의 보고 중립 예외를 제외하고 검산 실패로 표시합니다."
    assert scope["verified_rework"] == "basis_version=2에서 정상 재작업 부모는 불량, 정상 자식은 입고로 분류합니다. 불량·폐기 자식은 입고와 불량에 함께 표시하여 정상재고 순변화 0을 보존합니다."


def test_component_conversion_companions_preserve_full_normal_inventory_delta_without_duplicate_columns():
    rows = [
        ("source-parent", TransactionTypeEnum.BACKFLUSH, InventoryOperationRoleEnum.COMPONENT_INPUT, -1),
        ("source-child", TransactionTypeEnum.BACKFLUSH, InventoryOperationRoleEnum.COMPONENT_INPUT, -2),
        ("target-parent", TransactionTypeEnum.PRODUCE, InventoryOperationRoleEnum.PRODUCT_OUTPUT, 1),
        ("target-child", TransactionTypeEnum.PRODUCE, InventoryOperationRoleEnum.PRODUCT_OUTPUT, 2),
    ]
    classified = {
        item_id: classify_inventory_activity(SimpleNamespace(
            item_id=item_id, transaction_type=kind, operation_role=role,
            quantity_change=delta, shipping_phase="COMPONENT_CHANGE",
            inventory_effect=[{"scope": "location", "department": "에이징", "status": "PRODUCTION", "delta": delta}],
        ))
        for item_id, kind, role, delta in rows
    }
    assert classified["source-parent"].as_tuple() == (0, 0, 1, 0)
    assert classified["source-child"].as_tuple() == (0, 0, 2, 0)
    assert classified["target-parent"].as_tuple() == (0, 1, 0, 0)
    assert classified["target-child"].as_tuple() == (0, 2, 0, 0)
    assert sum(row.normal_delta for row in classified.values()) == sum(delta for _, _, _, delta in rows) == 0
    assert sum(row.as_tuple()[1] for row in classified.values()) == sum(row.as_tuple()[2] for row in classified.values()) == 3
    assert sum(row.as_tuple()[0] for row in classified.values()) == 0
