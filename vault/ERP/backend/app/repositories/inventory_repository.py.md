# inventory_repository.py

## 이 파일은 뭐예요?
코드베이스 곳곳에 흩어져 있던 `db.query(Inventory).filter(Inventory.item_id == X).first()` 패턴을 하나로 통합한 순수 조회 레이어. 단건 재고 레코드 조회만 담당하며, 트랜잭션·잠금은 호출자가 책임진다.

## 언제 보나요?
- 품목 ID로 `Inventory` 레코드를 조회하는 로직이 어디서 왔는지 추적할 때
- 재고 관련 버그를 디버깅할 때 DB 접근 진입점을 확인할 때
- 잠금/생성이 필요한 경로(`get_or_create_inventory`, `_lock_inventory`)가 여기 없는 이유를 확인할 때

## 중요한 내용
- `get(db, item_id)` — `Inventory` 테이블에서 `item_id`로 단건 조회. `Optional[Inventory]` 반환(없으면 `None`).
- soft-delete 필터 없음 — 기존 `.first()` 동작 그대로 보존.
- 잠금/생성(`get_or_create_inventory`, `_lock_inventory`)은 `inv_base` 전용 헬퍼를 계속 사용하며 이 파일에 포함되지 않는다.

## 위험도
🔴 높음 — 재고 수치를 직접 읽는 DB 접근 레이어. 여기서 반환하는 `Inventory` 객체를 수정하면 세션에 따라 즉시 DB에 반영될 수 있으므로 호출부의 트랜잭션 경계를 반드시 확인해야 한다.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/models/📁_models]] — `Inventory` 모델 정의
- [[ERP/backend/app/repositories/item_repository.py]] — 동일 패턴의 Item 조회 레이어
