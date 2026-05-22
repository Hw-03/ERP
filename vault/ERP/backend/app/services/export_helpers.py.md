---
type: file-explanation
source_path: "backend/app/services/export_helpers.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# export_helpers.py — export_helpers.py 설명

## 이 파일은 무엇을 책임지나

`export_helpers.py`는 `export_helpers` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `csv_streaming_response`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models.py]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 파일입니다.
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

서비스는 DB 변경을 포함할 수 있습니다. 같은 도메인의 라우터, 모델, 테스트를 함께 확인해야 합니다.

## 핵심 발췌

```python
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
```
