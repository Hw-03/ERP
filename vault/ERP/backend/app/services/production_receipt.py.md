# production_receipt.py

## 이 파일은 뭐예요?
생산 입고(Production Receipt) 전체 흐름을 오케스트레이션하는 서비스. BOM 전개 → 사전 재고 검사 → 부품 창고 차감(BACKFLUSH) → 완제품 적재(PRODUCE) 4단계를 하나의 업무 단위로 묶는다. `routers/production.py`에 인라인돼 있던 로직을 추출했다.

## 언제 보나요?
- 생산 입고 시 "재고 부족" 422 에러의 판정 기준(창고 가용분 `warehouse_available`)을 확인할 때
- BACKFLUSH / PRODUCE 트랜잭션 로그가 어떻게 기록되는지 볼 때
- BOM 순환참조 400, 부품 미존재 404 등 생산 입고 예외 처리를 수정할 때

## 중요한 내용
- `execute_production_receipt(db, payload, produced_item, producer_name, producer_id)` — 외부 진입점. commit은 하지 않고 트랜잭션 경계는 라우터 책임.
- `ProductionShortage(shortages)` — 사전 재고 부족 시 raise. `.shortages`에 품목별 부족 상세 문자열 목록 포함(→ 라우터에서 422).
- `ProductionBadRequest` — BOM 순환참조 / 빈 BOM → 400.
- `ProductionItemNotFound` — 부품 미존재 → 404.
- `_assert_no_shortage` — `stock_math.figures_from_inventory().warehouse_available` 기준으로 사전 검사. **창고 가용분** 기준이므로 pending 예약분은 제외.
- `_preload_components` — 부품 Item/Inventory를 IN 쿼리 1회씩 bulk 로드하고 `lock_inventories`로 FOR UPDATE 잠금(TOCTOU 방지).

## 위험도
🔴 높음 — 부품 재고 차감(BACKFLUSH)과 완제품 적재(PRODUCE)를 동시에 수행하는 핵심 생산 경로. `_assert_no_shortage` 조건이나 `consume_warehouse` 호출 순서를 잘못 수정하면 재고 불일치가 발생한다.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/production.py]] — 라우터: HTTP 매핑·트랜잭션 커밋 담당
- [[ERP/backend/app/services/bom.py]] — `explode_bom` / `merge_requirements` BOM 전개
- [[ERP/backend/app/services/inventory.py]] — `consume_warehouse` / `receive_confirmed` / `lock_inventories` / `dept_for_process_type`
- [[ERP/backend/app/services/stock_math.py]] — `figures_from_inventory` 재고 수량 계산(창고 가용분 포함)
- [[ERP/backend/app/services/inv_effect.py]] — `snapshot_cells` / `capture_effect` 재고 셀 변화 기록
