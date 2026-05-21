---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/services/pin_auth.py
tags: [vault, code-note, b-tier]
---

# pin_auth.py — PIN 해싱 및 검증 유틸리티

> [!summary] 역할
> 작업자 식별용 경량 인증 헬퍼 (실제 보안 인증 아님). 4자리 PIN을 SHA-256 해싱해 저장/검증한다.

## 1. 이 파일의 역할
- PIN 문자열 → SHA-256 해시 변환 (hash_pin)
- 저장된 해시 vs 입력 PIN 비교 검증 (verify_pin)
- 기본값 PIN "0000" 관리 (DEFAULT_PIN, DEFAULT_PIN_HASH)
- 작업자 식별용이지 보안 인증이 아님 — DB에 pin_hash 컬럼으로 저장

## 2. 실제 원본 위치
`backend/app/services/pin_auth.py` — 총 25줄

## 3. 주요 import
```python
import hashlib
```
- 표준 라이브러리만 사용 (외부 의존성 없음)

## 4. 어디서 쓰이는지
- `backend/bootstrap_db.py` — 기본 PIN 해시 값 임포트 (DEFAULT_PIN_HASH)
- `backend/tests/routers/test_transaction_edit.py` — 테스트 직원 PIN 설정 시
- `frontend/app/legacy/_components/login/OperatorLoginCard.tsx` — PIN 검증 API 호출 대상
- Employee 모델의 pin_hash 컬럼 초기화

## 5. ⚠️ 위험 포인트
- **SHA-256는 비밀번호 해싱용이 아님** (salt 없음, fast hash). 실제 보안이 필요하면 bcrypt/argon2 전환 필수
- stored_hash가 None이면 기본값 "0000" 비교 — 원래 NULL 의도인지 확인 필요
- 4자리 PIN은 10,000가지뿐 (brute-force 쉬움) → rate_limit.py와 함께 사용하는 것이 필수

## 6. 수정 전 체크
- verify_pin(None, "0000") → True 검증
- hash_pin("1234") → 동일 호출 시 동일 값 반환 확인
- PIN 글자수 검증은 이 모듈이 아닌 호출처 책임 (pin_auth는 "검증만" 수행)
