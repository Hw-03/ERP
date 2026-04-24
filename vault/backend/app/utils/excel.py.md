---
type: code-note
project: ERP
layer: backend
source_path: backend/app/utils/excel.py
status: active
tags:
  - erp
  - backend
  - utils
  - excel
aliases:
  - 엑셀 유틸
---

# utils/excel.py

> [!summary] 역할
> 엑셀 파일 생성 및 읽기 기능을 제공하는 유틸리티. 품목 목록과 거래 이력의 엑셀 내보내기에 사용된다.

> [!info] 주요 책임
> - openpyxl 기반 엑셀 파일 생성
> - 품목 내보내기 (`/api/items/export.xlsx`)
> - 거래 이력 내보내기 (`/api/inventory/transactions/export.xlsx`)

---

## 쉬운 말로 설명

**엑셀 파일 다운로드 기능의 공통 스타일·응답 도우미**. 직접 데이터는 안 건드리고, 엑셀 시트의 헤더 스타일·컬럼 폭·HTTP 응답 포장을 담당.

라우터에서 `openpyxl.Workbook()` 만들고 데이터 채운 뒤 → 여기 함수 3개 호출 → 브라우저 다운로드 완료.

---

## 핵심 함수

### `apply_header(ws, columns: list[str])`
- 1행에 헤더를 넣고 **회사 테마(남색 배경 + 흰 글씨)** 로 스타일 적용.
- `HEADER_FILL = PatternFill("solid", fgColor="1A3A5C")` — 남색 `#1A3A5C`.
- `HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)` — 흰색 굵게 10pt.
- 가운데 정렬 + 행 높이 20 + 첫 행 고정(freeze_panes) + 자동 필터 활성화.

### `auto_width(ws)`
- 각 열의 최대 문자 길이에 맞춰 폭 자동 조정.
- 최소 10자, 최대 40자 (너무 넓으면 자름).

### `make_xlsx_response(wb, filename) -> StreamingResponse`
- `Workbook` 을 메모리 버퍼에 저장 → FastAPI `StreamingResponse` 로 포장.
- `Content-Disposition: attachment; filename="..."` 헤더 부착 → 브라우저가 바로 다운로드.
- media_type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

## 사용 패턴 (라우터 예시)

```python
from openpyxl import Workbook
from app.utils.excel import apply_header, auto_width, make_xlsx_response

wb = Workbook()
ws = wb.active
ws.title = "Items"
apply_header(ws, ["ERP코드", "품목명", "카테고리", "수량"])
for item in items:
    ws.append([item.erp_code, item.name, item.category, item.qty])
auto_width(ws)
return make_xlsx_response(wb, "items.xlsx")
```

---

## 어디서 쓰이나

- `GET /api/items/export.xlsx` — 품목 전체 내보내기
- `GET /api/inventory/transactions/export.xlsx` — 거래 이력 내보내기
- 기타 엑셀 다운로드 엔드포인트 전반

---

## FAQ

**Q. 헤더 색을 바꾸고 싶다면?**
`HEADER_FILL` 의 `fgColor` 를 HEX 변경. `1A3A5C` → 원하는 값.

**Q. 자동 필터가 자동 활성화되는데 끄려면?**
`apply_header()` 내부에서 `ws.auto_filter.ref = ws.dimensions` 줄 주석 처리. 단 공통 스타일이므로 수정 시 전체 엑셀 영향.

**Q. 대용량 데이터(수만 행)도 가능?**
openpyxl 은 메모리에 전체 로드. 수만 행이면 느려지고 메모리 많이 씀. 필요 시 `write_only=True` 모드로 전환 검토.

**Q. CSV 내보내기도 여기에 있나?**
아님. CSV는 라우터에서 `csv` 모듈로 직접 처리. 이 파일은 XLSX 전용.

---

## 관련 문서

- [[backend/app/routers/items.py.md]] — `/export.xlsx`
- [[backend/app/routers/inventory.py.md]] — `/transactions/export.xlsx`

Up: [[backend/app/utils/utils]]
