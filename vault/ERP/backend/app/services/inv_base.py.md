# inv_base.py

## 이 파일은 뭐예요?

`inv_calc`, `inv_transfer`, `inv_defective`, `inv_effect` 등 모든 재고 서비스 모듈이 공통으로 의존하는 **기반 헬퍼**입니다.

- `Inventory`·`InventoryLocation` 레코드 조회·생성·잠금 함수
- 공정 코드(process_type_code) → 부서 자동 매핑 테이블 (`PROCESS_TYPE_TO_DEPT`)

역방향 import 없음 — 이 파일이 재고 계층의 최하단입니다.

## 언제 보나요?

- 부서 매핑이 이상할 때 (`PROCESS_TYPE_TO_DEPT` 확인)
- 재고 잠금(row-level lock) 동작을 파악할 때

## 중요한 내용

- `get_or_create_inventory(db, item_id)` — Inventory 레코드를 가져오거나 없으면 생성
- `_lock_inventory(db, item_id)` — SQLite/PostgreSQL 호환 행 잠금
- `_lock_location(db, item_id, dept, status)` — InventoryLocation 행 잠금
- `PROCESS_TYPE_TO_DEPT` — TA·TF→TUBE, HA·HF→HIGH_VOLTAGE 등 18가지 매핑

## 위험도

🔴 높음

이 파일의 부서 매핑이나 잠금 로직이 틀리면 재고 데이터가 잘못 기록됩니다.  
변경 전 `tests/services/test_inventory*.py` 전체 실행 필수.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/inv_calc.py]] — 이 파일에만 의존하는 집계 계산
- [[ERP/backend/app/services/inv_transfer.py]] — 이동·입고·출고
- [[ERP/backend/app/models/inventory.py]] — Inventory·InventoryLocation 모델

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/services/inv_defective.py]]
> - [[ERP/backend/app/services/inv_effect.py]]
