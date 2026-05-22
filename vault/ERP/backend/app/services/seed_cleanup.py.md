# seed_cleanup.py

## 이 파일은 뭐예요?

722행짜리 정리본 엑셀(`생산부_재고_매칭작업_정리본.xlsx`)을 DB에 적재하는 서비스. `scripts/dev/import_inventory_cleanup.py`의 핵심 로직을 추출한 것이며, `settings./reset` 엔드포인트가 이 함수를 호출한다.

## 언제 보나요?

- DB 초기화 후 기준 재고를 다시 적재해야 할 때
- 엑셀 파싱 실패 오류 메시지를 추적할 때
- `bootstrap_db.py --all`이 내부적으로 무슨 일을 하는지 볼 때

## 핵심 상수

| 상수 | 값 | 의미 |
|------|----|------|
| `EXPECTED_ROWS` | 722 | 엑셀 유효 행수. 다르면 오류 |
| `EXPECTED_TOTAL_QTY` | 108,924 | 전체 재고 합계. 다르면 경고 |
| `DEFAULT_MIN_STOCK` | 200 | 적재 시 min_stock 기본값 |
| `DEFAULT_EXCEL_PATH` | `outputs/inventory_cleanup/생산부_재고_매칭작업_정리본.xlsx` | 기본 엑셀 경로 |

## 부서 코드 매핑

```python
DEPT_MAP = {"T": "튜브", "H": "고압", "V": "진공", "N": "튜닝", "A": "조립", "P": "출하"}
```

품목 코드(`6-PA-0001` 형식)의 `process_type_code` 첫 글자로 부서를 결정한다.

## 주요 함수

### `run_cleanup_import(db, excel_path, *, dry_run=False)`

엑셀을 파싱해 `Item` + `Inventory` + `InventoryLocation`을 일괄 적재한다.

**호출 전 전제조건:** `items / inventory / inventory_locations` 테이블이 비어 있어야 한다.

**`dry_run=True`** 이면 파싱·검증만 하고 DB는 변경하지 않는다.

반환값:
```python
{"rows": int, "total_qty": Decimal, "ok": bool, "errors": list[str]}
```

## 흐름 요약

1. 엑셀 로드 (`_load_excel`) → 헤더 자동 감지 (ERP코드 / 품명 / 분류 / 현재고)
2. 행수·합계 검증
3. 각 행마다 품목 코드 파싱 (`_parse_erp_code`) → 부서 결정
4. `process_types` 테이블에서 유효 코드 확인
5. `Item` → `Inventory` → `InventoryLocation` 순서로 bulk insert

## 주의사항

> [!warning]
> - 적재 전 테이블이 비어 있지 않으면 중복 오류 발생
> - `openpyxl` 미설치 시 `RuntimeError` 발생 (`pip install openpyxl`)
> - 행수나 합계가 불일치해도 오류는 `errors` 리스트에 담길 뿐, dry_run이 아닌 경우 적재는 계속됨

## 연결되는 파일

- [[ERP/backend/app/models.py]] — Item, Inventory, InventoryLocation, LocationStatusEnum
- [[ERP/backend/bootstrap_db.py]] — `--all` 플래그 시 이 서비스 호출
- `scripts/dev/import_inventory_cleanup.py` — 이 서비스의 원본 스크립트
