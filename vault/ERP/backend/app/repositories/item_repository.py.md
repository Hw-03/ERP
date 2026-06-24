# item_repository.py

## 이 파일은 뭐예요?
코드베이스 곳곳에 흩어져 있던 `db.query(Item).filter(Item.item_id == X).first()` 패턴을 하나로 통합한 순수 조회 레이어. 단건 품목 레코드 조회만 담당하며, 404/ValueError 변환·트랜잭션은 호출자가 책임진다.

## 언제 보나요?
- 품목 ID로 `Item` 레코드를 조회하는 로직의 진입점을 찾을 때
- 품목 관련 버그 디버깅 시 DB 접근 경로를 확인할 때
- soft-delete 필터가 빠진 이유를 확인할 때(의도적 — 기존 동작 보존)

## 중요한 내용
- `get(db, item_id)` — `Item` 테이블에서 `item_id`로 단건 조회. `Optional[Item]` 반환(없으면 `None`).
- soft-delete 무시 — `.first()` 기존 동작 보존. 삭제 필터가 필요한 호출부는 이 repository의 통합 대상이 아니다.
- 잠금·생성이 필요한 경로(`inventory.get_or_create_inventory` 등)는 기존 전용 헬퍼를 그대로 사용.

## 위험도
🔴 높음 — 품목 마스터를 직접 읽는 DB 접근 레이어. soft-delete된 품목도 반환할 수 있으므로 호출부에서 `is_deleted` 등 상태를 별도 확인해야 한다.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/models/📁_models]] — `Item` 모델 정의
- [[ERP/backend/app/repositories/inventory_repository.py]] — 동일 패턴의 Inventory 조회 레이어
