---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/services/export_helpers.py
tags: [vault, code-note, b-tier]
---

# export_helpers.py — CSV 스트리밍 응답 헬퍼

> [!summary] 역할
> 라우터의 반복되는 CSV StreamingResponse 생성 보일러플레이트를 단일 함수로 통합. XLSX는 excel.py의 make_xlsx_response 사용.

## 1. 이 파일의 역할
- StringIO 버퍼(csv.writer로 이미 기록됨) → FastAPI StreamingResponse 변환
- UTF-8 charset, Content-Disposition 헤더 자동 설정
- 파일명만 호출자가 전달 (endpoint는 자동)

## 2. 실제 원본 위치
`backend/app/services/export_helpers.py` — 28줄

## 3. 주요 import
```python
from io import StringIO
from fastapi.responses import StreamingResponse
```

## 4. 어디서 쓰이는지
- 입출고/불량 거래 CSV 내보내기 라우터들
- 사용 패턴:
  ```python
  buffer = StringIO()
  writer = csv.writer(buffer)
  writer.writerow([...])
  return csv_streaming_response(buffer, "export.csv")
  ```

## 5. ⚠️ 위험 포인트
- buffer.seek(0) 호출 후 getvalue() — 버퍼가 이미 쓰기 완료 상태인지 확인 필수
- StringIO는 메모리 기반 — 매우 큰 CSV(1000만 행 이상)에서는 generator 사용 필요
- charset=utf-8이므로 한글 처리 확인: 클라이언트 엑셀이 BOM 자동 감지하는지

## 6. 수정 전 체크
- csv.writer 쓰기 후 buffer.seek(0) 전 상태 확인
- 다운로드 파일명이 한글일 경우 URL encoding 필요한지 테스트
