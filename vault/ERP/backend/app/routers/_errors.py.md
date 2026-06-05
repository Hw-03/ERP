---
type: file-explanation
source_path: "backend/app/routers/_errors.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# _errors.py — _errors.py 설명

## 이 파일은 무엇을 책임지나

`_errors.py`는 `_errors` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ErrorCode`
- `http_error`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
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
    FORBIDDEN = "FORBIDDEN"                      # 403 — 접근 거부 (PIN 불일치, 비활성 직원 등)
    TOO_MANY_REQUESTS = "TOO_MANY_REQUESTS"      # 429 — 요청 과다 (PIN 무차별 시도 등)


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
```
