---
type: file-explanation
source_path: "backend/app/services/pin_auth.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# pin_auth.py — pin_auth.py 설명

## 이 파일은 무엇을 책임지나

`pin_auth.py`는 `pin_auth` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `hash_pin`
- `verify_pin`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/backend/app/schemas/📁_schemas]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

서비스는 DB 변경을 포함할 수 있습니다. 같은 도메인의 라우터, 모델, 테스트를 함께 확인해야 합니다.

## 핵심 발췌

```python
"""PIN 해싱 및 검증 유틸리티.

작업자 식별용 — 실제 보안 인증이 아님.
4자리 PIN으로 작업자를 식별하는 경량 인증 헬퍼.
"""

import hashlib

DEFAULT_PIN = "0000"


def hash_pin(pin: str) -> str:
    """PIN 문자열을 SHA-256 해시로 변환."""
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()


def verify_pin(stored_hash: str | None, input_pin: str) -> bool:
    """저장된 해시와 입력 PIN을 비교. stored_hash가 None이면 기본 PIN 0000과 비교."""
    if stored_hash is None:
        return input_pin == DEFAULT_PIN
    return stored_hash == hash_pin(input_pin)


DEFAULT_PIN_HASH: str = hash_pin(DEFAULT_PIN)
```
