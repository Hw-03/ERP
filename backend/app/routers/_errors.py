"""표준 에러 응답 헬퍼.

detail 모양: {"code": str, "message": str, "extra"?: dict}
- 기존 str detail 라우터는 그대로 유지(하위호환).
- 새로 정형화한 라우터만 이 모양을 사용한다.

프론트는 lib/api.ts:extractErrorMessage 가 str/dict 둘 다 처리.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException


# 코드 상수 — 라우터에서 직접 import 해서 사용
class ErrorCode:
    STOCK_SHORTAGE = "STOCK_SHORTAGE"            # 422 — 재고 부족 (extra.shortages: list[str])
    EXPORT_RANGE_TOO_LARGE = "EXPORT_RANGE_TOO_LARGE"  # 422 — export 범위 초과
    EXPORT_RANGE_REQUIRED = "EXPORT_RANGE_REQUIRED"    # 400 — start_date/end_date 필수
    VALIDATION_ERROR = "VALIDATION_ERROR"        # 422 — ValueError fallback
    DB_INTEGRITY = "DB_INTEGRITY"                # 409 — IntegrityError
    DB_UNAVAILABLE = "DB_UNAVAILABLE"            # 503 — OperationalError
    INTERNAL = "INTERNAL"                        # 500 — Exception fallback


def http_error(
    status_code: int,
    code: str,
    message: str,
    **extra: Any,
) -> HTTPException:
    """표준화된 HTTPException 생성.

    Args:
        status_code: HTTP 상태 코드
        code: ErrorCode 의 상수 값 (클라이언트가 분기에 사용)
        message: 한국어 사용자 표시 메시지
        **extra: 부분 실패 등 부가 정보 (shortages 등). 비어있으면 키 자체 생략.
    """
    detail: dict[str, Any] = {"code": code, "message": message}
    if extra:
        detail["extra"] = extra
    return HTTPException(status_code=status_code, detail=detail)
