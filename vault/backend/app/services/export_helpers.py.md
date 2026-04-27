---
type: code-note
project: ERP
layer: backend
source_path: backend/app/services/export_helpers.py
status: active
updated: 2026-04-27
source_sha: 2839fbc4213c
tags:
  - erp
  - backend
  - service
  - py
---

# export_helpers.py

> [!summary] 역할
> 라우터에서 직접 처리하기 무거운 `export_helpers` 비즈니스 로직과 계산 책임을 분리해 담는다.

## 원본 위치

- Source: `backend/app/services/export_helpers.py`
- Layer: `backend`
- Kind: `service`
- Size: `1010` bytes

## 연결

- Parent hub: [[backend/app/services/services|backend/app/services]]
- Related: [[backend/backend]]

## 읽는 포인트

- 서비스는 라우터보다 안쪽의 업무 규칙을 담는다.
- 재고 수량이나 BOM 계산은 화면 표시와 실제 거래가 일치해야 한다.

## 원본 발췌

````python
"""Export 관련 보일러플레이트 helper.

라우터에서 반복되는 CSV `StreamingResponse` 생성 코드를 단일 호출로 통합한다.
- endpoint 응답 / 컬럼 / mime 타입 / 파일명 모두 호출자가 그대로 결정한다.
- XLSX는 `app.utils.excel.make_xlsx_response`가 이미 동일 역할을 하므로 추가 helper 불필요.
"""

from __future__ import annotations

from io import StringIO

from fastapi.responses import StreamingResponse


def csv_streaming_response(buffer: StringIO, filename: str) -> StreamingResponse:
    """CSV 버퍼를 UTF-8 다운로드 응답으로 감싼다.

    Args:
        buffer: `csv.writer(buffer)` 가 모두 기록된 ``StringIO``.
        filename: 다운로드 파일명(확장자 포함).
    """
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
