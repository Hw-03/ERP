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
