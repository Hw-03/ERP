# 📁 repositories

## 이 폴더는 뭐예요?
DB 조회 패턴을 한 곳으로 모아 둔 레이어. 코드 여러 곳에 흩어져 있던 `db.query(모델).filter(...).first()` 호출을 통합해 중복을 줄인다. 현재는 단건 조회(순수 읽기)만 담당하고, 트랜잭션·잠금·생성은 각 호출자나 기존 전용 헬퍼가 처리한다.

## 언제 여기를 보나요?
- 재고(`Inventory`)나 품목(`Item`)을 ID로 조회하는 코드가 어디서 오는지 추적할 때
- DB 접근 진입점을 한 곳에서 파악하고 싶을 때
- 새 모델에 대한 단순 조회 함수를 추가할 위치를 찾을 때

## 주요 파일
- `inventory_repository.py` — `Inventory` 단건 조회 (`get(db, item_id)`)
- `item_repository.py` — `Item` 단건 조회 (`get(db, item_id)`)
- `__init__.py` — 빈 패키지 마커

## 관련 파일
### 먼저 볼 파일
- [[ERP/backend/app/models/📁_models]] — 여기서 조회하는 ORM 모델 정의
