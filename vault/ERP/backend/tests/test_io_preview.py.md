# test_io_preview.py

## 이 파일은 뭐예요?
`services/io_preview.py`의 라우팅 규칙(`_route_for_sub_type`)과 BOM 전개(`preview`)를 DB 세션 직접 호출로 검증하는 단위 테스트. HTTP 없이 순수 서비스 레이어만 테스트한다.

## 검증하는 것
- `_route_for_sub_type`: 입고(receive_supplier), 창고→부서, 부서→창고, 불량 격리(창고/부서 소스) 각각의 방향·버킷 튜플
- 미등록 sub_type → `ValueError` 발생
- `preview`: 잘못된 work_type → `ValueError`
- 단일 품목 입고 → `requires_approval=False`, 방향 `in`, 버킷 `warehouse`
- 생산(produce) → BOM 자동 전개 (부품 출고 + 완제품 입고, 수량=BOM비율×수량)
- 분해(disassemble) → BOM 자녀 복구(입고), `exclusion_note` 포함
- 수동(manual) source_kind → BOM 전개 없이 직접 처리

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/io_preview.py]] — 테스트 대상
