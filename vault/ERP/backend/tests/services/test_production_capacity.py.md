# test_production_capacity.py

## 이 파일은 뭐예요?
`services/production_capacity.py`의 `compute_capacity()`를 DB에 직접 품목·BOM을 구성해 호출하고, AF 기준 3수량(ship_ready/fast_production/total_production)·PF 변형 목록·공유 자재 배분·legacy 필드 보존을 검증하는 순수 단위 테스트입니다.

## 언제 보나요?
- compute_capacity의 AF 기준 수량 계산 로직(fast/total/ship)을 수정할 때
- PF 변형별 포장재 제한 또는 AF 재고 cap 동작을 확인할 때
- 공유 자재의 비대칭 소요 배분(total_production 과대 계산 방지)을 점검할 때
- legacy(PF 합산) 필드가 유지되는지 확인할 때

## 중요한 내용
- `test_af_without_children_included_as_incomplete` — PF 경로 없는 AF는 3수량 모두 0
- `test_fast_production_limited_by_direct_nf_shortage` — 직계 자식 재고 부족이 fast_production 병목
- `test_fast_production_includes_existing_af_stock` — AF 자체 재고 + 부품 재고 합산
- `test_total_production_shared_subcomponent_no_overcount` — 공유 자재 합산 배분으로 과대 계산 차단
- `test_fast_production_ignores_sibling_af_materials` — 형제 AF 자재는 다른 AF fast_production에 영향 없음
- `test_legacy_fields_preserved` — immediate/maximum/top_items 레거시 PF 합산 필드 보존

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/production_capacity.py]] — 테스트 대상 서비스
- [[ERP/backend/app/routers/production.py]] — HTTP 진입점
