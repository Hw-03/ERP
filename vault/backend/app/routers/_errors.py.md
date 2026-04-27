---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/_errors.py
status: active
updated: 2026-04-27
source_sha: 6c6031cc8fe5
tags:
  - erp
  - backend
  - router
  - py
---

# _errors.py

> [!summary] 역할
> FastAPI 라우터 계층의 `_errors` 영역 API 엔드포인트를 담당한다.

## 원본 위치

- Source: `backend/app/routers/_errors.py`
- Layer: `backend`
- Kind: `router`
- Size: `2236` bytes

## 연결

- Parent hub: [[backend/app/routers/routers|backend/app/routers]]
- Related: [[backend/backend]]

## 읽는 포인트

- 라우터는 API 표면이다. 요청/응답 계약은 `schemas.py`와 함께 확인한다.
- DB 변경은 서비스/모델/테스트까지 같이 본다.

## 원본 발췌

````python
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
    # Phase 4
    STOCK_SHORTAGE = "STOCK_SHORTAGE"            # 422 — 재고 부족 (extra.shortages: list[str])
    EXPORT_RANGE_TOO_LARGE = "EXPORT_RANGE_TOO_LARGE"  # 422 — export 범위 초과
    EXPORT_RANGE_REQUIRED = "EXPORT_RANGE_REQUIRED"    # 400 — start_date/end_date 필수
    VALIDATION_ERROR = "VALIDATION_ERROR"        # 422 — ValueError fallback
    DB_INTEGRITY = "DB_INTEGRITY"                # 409 — IntegrityError
    DB_UNAVAILABLE = "DB_UNAVAILABLE"            # 503 — OperationalError
    INTERNAL = "INTERNAL"                        # 500 — Exception fallback

    # Phase 5 — 라우터 일반 마이그레이션용
    NOT_FOUND = "NOT_FOUND"                      # 404 — 리소스 없음
    BAD_REQUEST = "BAD_REQUEST"                  # 400 — 잘못된 요청
    CONFLICT = "CONFLICT"                        # 409 — 중복/충돌
    UNPROCESSABLE = "UNPROCESSABLE"              # 422 — 비즈니스 검증 실패 (구체 코드가 없는 경우)
    BUSINESS_RULE = "BUSINESS_RULE"              # 422 — 도메인 규칙 위반


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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
