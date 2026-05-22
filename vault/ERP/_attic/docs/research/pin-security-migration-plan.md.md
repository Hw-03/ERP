---
type: file-explanation
source_path: "_attic/docs/research/pin-security-migration-plan.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# pin-security-migration-plan.md — pin-security-migration-plan.md 설명

## 이 파일은 무엇을 책임지나

`pin-security-migration-plan.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `PIN 보안 마이그레이션 설계 — 2026-05-04`
- `1. 결론 (한 줄)`
- `2. 현재 구조`
- `2-1. 코드 위치`
- `2-2. 알고리즘 / 정책`
- `backend/app/services/pin_auth.py — 핵심 코드 (현재)`
- `2-3. PIN 전송 방식`
- `3. 위험 분석`
- `3-1. 알고리즘 위험`
- `3-2. 운영 위험`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# PIN 보안 마이그레이션 설계 — 2026-05-04

> **작업 ID:** MES-BE-005 (설계 단계)
> **작성일:** 2026-05-04 (월)
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)
> **본 PR 범위:** **설계 문서만**. 코드 / DB / 로그인 흐름 변경 0건.
> **구현 PR:** **별도 PR 로 분리** (D등급 — 인증 영향 큼).

---

## 1. 결론 (한 줄)

SHA-256 단일 해시 + 평문 `DEFAULT_PIN="0000"` 을 **argon2id (1순위) 또는 bcrypt (2순위)** 로 전환. 데이터 마이그레이션은 **lazy** 방식, 신규 컬럼 1개 추가, 기존 컬럼은 잠정 유지. **rollback 가능 설계**.

---

## 2. 현재 구조

### 2-1. 코드 위치

| 파일 | 역할 |
|---|---|
| `backend/app/services/pin_auth.py` | `hash_pin`, `verify_pin`, `DEFAULT_PIN="0000"`, `DEFAULT_PIN_HASH` |
| `backend/app/models.py:311` | `Employee.pin_hash = Column(Text, nullable=True)` |
| `backend/app/routers/employees.py` | PIN 변경 / 검증 / 리셋 (`DEFAULT_PIN_HASH` 비교 사용) |
| `backend/app/routers/settings.py` | 관리자 PIN — `system_settings.ADMIN_PIN_KEY` 에 SHA-256 저장 |
| `backend/app/services/stock_requests.py` | 요청 승인/취소 시 PIN 검증 (3곳) |
| `backend/app/routers/inventory/transactions.py` | 거래 정정 시 직원 PIN 검증 |

### 2-2. 알고리즘 / 정책

```python
# backend/app/services/pin_auth.py — 핵심 코드 (현재)
DEFAULT_PIN = "0000"

def hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()

def verify_pin(stored_hash: str | None, input_pin: str) -> bool:
    if stored_hash is None:
        return input_pin == DEFAULT_PIN
    return stored_hash == hash_pin(input_pin)
```

| 항목 | 값 |
|---|---|
| 알고리즘 | SHA-256 단일 라운드 |
| salt | **없음** |
| stretch | **없음** |
| 입력 공간 | 4자리 숫자 = 10,000 조합 |
| 비교 방식 | `==` 직접 비교 (timing-safe 아님) |
| 기본 PIN | `"0000"` (전 직원 공통, 첫 로그인 강제 변경 안 됨) |
| 관리자 PIN | `system_settings` 행 1건, 동일 SHA-256 |

### 2-3. PIN 전송 방식
```
