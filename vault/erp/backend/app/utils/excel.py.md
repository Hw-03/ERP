---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/utils/excel.py
tags: [vault, code-note, b-tier]
---

# excel.py — openpyxl 기반 XLSX 내보내기 헬퍼

> [!summary] 역할
> Workbook → BytesIO 변환 후 StreamingResponse 반환. 헤더 스타일(색상/폰트/고정), 자동 열 너비 설정.

## 1. 이 파일의 역할
- apply_header() — 첫 번째 행 스타일(파란색 배경, 흰색 폰트, 센터), 열 고정(A2부터)
- auto_width() — 모든 열의 너비 자동 조정 (최대 40)
- make_xlsx_response() — Workbook → StreamingResponse (다운로드)

## 2. 실제 원본 위치
`backend/app/utils/excel.py` — 39줄

## 3. 주요 import
```python
from io import BytesIO
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
```

## 4. 어디서 쓰이는지
- 입출고/불량/조정 거래 XLSX 내보내기 라우터들
- 사용 패턴:
  ```python
  wb = Workbook()
  ws = wb.active
  apply_header(ws, ["품목코드", "품목명", ...])
  for row in data:
    ws.append(row)
  auto_width(ws)
  return make_xlsx_response(wb, "export.xlsx")
  ```

## 5. ⚠️ 위험 포인트
- **HEADER_FILL/HEADER_FONT hardcoded** — 디자인 변경 시 상수 수정 필요
- auto_width는 전체 열 순회 (열이 많으면 성능 저하)
- max_len + 2 고정식 — 매우 긴 셀은 40으로 잘림

## 6. 수정 전 체크
- apply_header 호출 후 ws.freeze_panes == "A2" 확인
- auto_width 호출 후 모든 열의 width > 0 확인
- make_xlsx_response 후 Content-Disposition이 attachment로 설정되는지 확인
