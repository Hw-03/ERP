# inv_calc.py

## 이 파일은 뭐예요?

재고 집계 계산 함수 모음입니다. `inv_base.py`에만 의존하며 역방향 import 없습니다.

- 부서별 PRODUCTION/DEFECTIVE 합계 집계
- `_sync_total()` — `InventoryLocation` 변경 후 `Inventory.total` 동기화

## 언제 보나요?

- 재고 합계(total) 계산이 이상할 때
- 부서별 수량 집계 로직을 파악할 때

## 중요한 내용

- `production_total(db, item_id)` — 전체 부서 PRODUCTION 합계
- `defective_total(db, item_id)` — 전체 부서 DEFECTIVE 합계
- `_sync_total(db, inventory)` — 변경 후 반드시 호출해 `total`을 최신화

## 위험도

🔴 높음

`_sync_total`을 누락하면 `Inventory.total`이 실제와 달라져 KPI 화면에 잘못된 수치가 표시됩니다.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/inv_base.py.md]] — 의존성
- [[ERP/backend/app/services/inv_transfer.py.md]] — _sync_total 호출자
- [[ERP/backend/app/services/stock_math.py.md]] — 사용 가능 수량 계산

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/services/inv_defective.py.md]]
> - [[ERP/backend/app/models/inventory.py.md]]
