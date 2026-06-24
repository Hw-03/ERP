# test_io_preview.py

## 이 파일은 뭐예요?
`services/io_preview.py`의 라우팅 규칙(`_route_for_sub_type`) 및 BOM 전개(`preview()`) 로직을 DB 직접 호출로 검증하는 단위 테스트. HTTP 없이 서비스 층만 테스트.

## 언제 보나요?
- sub_type별 bucket 라우팅 규칙(`receive_supplier`, `warehouse_to_dept`, `defect_quarantine` 등) 변경 시
- BOM 전개 방향(produce=부품 차감, disassemble=부품 회수)이 바뀌었을 때
- `manual` source_kind로 보내면 BOM 전개를 스킵하는지 확인 시

## 중요한 내용
- `test_route_*` 시리즈: `_route_for_sub_type()` 반환값 `(direction, from_bucket, from_dept, to_bucket, to_dept)` 검증
- `test_route_unknown_sub_type_raises`: 미등록 sub_type → `ValueError`
- `test_preview_produce_expands_bom`: 완제품 produce 시 BOM 자식 `"bom_auto"` origin, 수량 `qty×bom_qty` 확인
- `test_preview_disassemble_recovers_children`: 분해 시 자식 방향 `"in"` + `DISASSEMBLE_EXCLUSION_NOTE` 확인
- `test_preview_manual_skips_bom_expansion`: `source_kind="manual"` → BOM 전개 없이 라인 1개만

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/io_preview.py]] — 대상 서비스 (라우팅 규칙 + BOM 전개)
- [[ERP/backend/tests/conftest.py]] — `make_item`, `make_bom` fixture
