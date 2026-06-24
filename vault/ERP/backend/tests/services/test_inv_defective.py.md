# test_inv_defective.py

## 이 파일은 뭐예요?
`services/inv_defective.py`의 불량 처리 함수 6종(`mark_defective`, `unmark_defective`, `scrap_defective`, `return_to_supplier`, `scrap_normal`, `return_to_supplier_from_normal`)이 총량 불변식과 재고 부족/비정상 입력 방어를 올바르게 처리하는지 검증하는 회귀 테스트입니다.

## 언제 보나요?
- 불량 등록·복귀·폐기·반품 서비스 로직을 수정할 때
- warehouse/production 출처 분기, 부서 교차 불량 등록 동작을 확인할 때
- DefectSource·NormalSource·ReasonContext 구조를 바꿀 때

## 중요한 내용
- `mark_defective` / `unmark_defective` — 위치만 이동, 총량 불변
- `scrap_defective` / `return_to_supplier` / `scrap_normal` / `return_to_supplier_from_normal` — 총량 감소 (물리적 소멸)
- `test_mark_defective_sets_defective_at` — 불량 등록 시 defective_at 타임스탬프 기록
- `test_unmark_defective_clears_defective_at` — 전량 복귀 시 defective_at NULL 초기화
- `test_mark_defective_production_cross_dept_source` — source_dept(TUBE)와 target_dept(ASSEMBLY)가 다를 수 있음

## 위험도
🔴 높음 — 불량 처리는 총량 불변(위치 이동)과 총량 감소(물리 소멸)가 혼재. 분기 오류 시 재고가 조용히 증발하거나 부풀어 오른다.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/inv_defective.py]] — 테스트 대상 서비스
- [[ERP/backend/app/services/inv_calc.py]] — `_sync_total` 공유 사용
