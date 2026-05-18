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

| 위치 | 전송 방식 | 위험 |
|---|---|---|
| `settings.py:119` | Query string `?pin=...` | 액세스 로그에 평문 노출 |
| `departments.py:81` | Query string `?pin=...` | 동일 |
| `settings.py:31,35` (verify-pin / change-pin) | POST body | 안전 |
| 직원 PIN 검증 | POST body | 안전 |

---

## 3. 위험 분석

### 3-1. 알고리즘 위험

- **레인보우 테이블 즉시 역산**: 4자리 숫자 × SHA-256 무 salt = 10,000개 매핑 테이블 1초 미만 생성
- **GPU 단일 PC 로 전체 직원 PIN 복원**: SHA-256 throughput ≈ 10⁹ hash/s → 사실상 즉시
- **해시 충돌 노출**: 동일 PIN 사용 직원 간 `pin_hash` 같음 → DB 덤프만으로 동일 PIN 그룹 식별 가능
- **timing attack**: `==` 비교는 짧은 prefix 일치 시 빠르게 false 반환 → 해시 추측 가능 (실제 영향 작지만 정석 위반)

### 3-2. 운영 위험

- **`DEFAULT_PIN="0000"` 평문 상수**: 코드 leak 시 즉시 모든 미설정 계정 침해
- **`pin_hash IS NULL` → 0000 매치**: 신규 직원 / 마이그레이션 누락 직원이 무조건 0000 으로 로그인 가능
- **Query string PIN 2곳** (settings, departments): nginx/proxy/CDN 액세스 로그에 평문 PIN 영구 기록
- **Rate limit 없음**: 10,000 조합 PIN 을 무한 시도 가능 → 평균 5,000 시도로 침투
- **공통 관리자 PIN**: 직원별이 아닌 시스템 전역 1개 — 누설 시 폭발

### 3-3. 영향 범위

| 자산 | 영향 |
|---|---|
| 거래 정정 / 취소 | 임의 직원 사칭 가능 |
| 재고 강제 조정 | 관리자 PIN 1개로 모든 권한 |
| 부서 마스터 변경 | 동일 |
| 시스템 초기화 / CSV 재시드 | 동일 |
| 감사 로그 | 사칭 직원 이름으로 기록되어 추적 어려움 |

---

## 4. 제안 마이그레이션

### 4-1. 알고리즘 선택

**1순위 — argon2id**
- 메모리 하드, GPU 공격 효과적 차단
- 파라미터 권장: `time_cost=2, memory_cost=64*1024 KiB (64 MiB), parallelism=2`
- 4자리 PIN 의 약한 입력 공간을 보완하기에 가장 적합
- Python 라이브러리: `argon2-cffi` (백엔드 환경 ARM/x86 둘 다 OK)

**2순위 — bcrypt**
- 메모리 하드 아니지만 stretch 충분 (`rounds=12`)
- 라이브러리: `bcrypt`
- 마이그레이션 단순, NAS 환경 호환성 좋음

**선택 기준:**
- argon2id 가 보안적으로 우월 — 본 마이그레이션 기본
- 빌드/배포 환경에서 argon2-cffi 설치 실패하면 bcrypt 로 폴백 (Dockerfile 빌드 단계에서 결정)

### 4-2. 신규 스키마

```sql
-- 신규 컬럼 1개 추가. 기존 pin_hash 는 잠정 유지 (rollback 용).
ALTER TABLE employees ADD COLUMN pin_hash_v2 TEXT NULL;

-- system_settings 의 ADMIN_PIN_KEY 옆에 ADMIN_PIN_KEY_V2 추가.
-- (기존 setting_value 는 그대로, 새 setting_key 로 v2 저장.)
```

본 PR 에선 적용 안 함 — Alembic 마이그레이션 별도 PR.

### 4-3. lazy migration 전략

```python
# 의사 코드 — 다음 PR 의 pin_auth.py 신규 구조

def verify_pin(employee: Employee, input_pin: str, db: Session) -> bool:
    # 1) v2 가 있으면 v2 만 검증
    if employee.pin_hash_v2:
        return argon2_verify(employee.pin_hash_v2, input_pin)

    # 2) v2 가 없고 v1 (sha256) 있으면 v1 검증 → 성공 시 v2 채움
    if employee.pin_hash:
        if sha256_constant_time_eq(employee.pin_hash, input_pin):
            employee.pin_hash_v2 = argon2_hash(input_pin)
            db.commit()
            return True
        return False

    # 3) 둘 다 None — DEFAULT_PIN 매치 + 강제 변경 안내 플래그
    if input_pin == DEFAULT_PIN:
        # 강제 변경 화면으로 유도 (응답 헤더 또는 별도 status)
        return True
    return False
```

핵심:
- **로그인 흐름 변경 없음** — 기존 호출 측 시그니처 그대로
- **첫 정상 로그인 시 자동 업그레이드** — 운영 중 점진 전환
- **deprecation 시한:** 90일 후 v1 컬럼 제거 (별도 PR + Alembic)

### 4-4. DEFAULT_PIN 강제 변경 전략

#### 1단계 — 응답 신호 (이번 PR 직후)

```python
# verify_pin 응답에 must_change_pin 플래그 추가
class PinVerifyResponse(BaseModel):
    ok: bool
    must_change_pin: bool = False  # NEW
```

조건: `pin_hash IS NULL` OR `input_pin == DEFAULT_PIN` (해시화된 비교 후) → `True`

#### 2단계 — 프론트 강제 모달 (별도 프론트 PR)

- `must_change_pin == True` 면 PIN 변경 화면으로 라우팅
- 변경 완료 전까지 다른 화면 접근 차단

#### 3단계 — 신규 직원 생성 시 PIN 미설정 금지 (별도 PR)

- `Employee.pin_hash NOT NULL` 제약 추가 (기존 직원은 lazy migration 후 일제히 NOT NULL)

### 4-5. rate limit 필요성

| 대상 | 권장 정책 | 우선순위 |
|---|---|---|
| 직원 PIN 검증 (`verify-pin`, 거래 정정, 요청 승인) | 5회 실패 / 5분 → 5분 락아웃 | 高 |
| 관리자 PIN (`/api/settings/verify-pin`) | 3회 실패 / 5분 → 15분 락아웃 + 알림 | 高 |
| 부서 변경 / 강제조정 | 3회 실패 / 5분 → 15분 락아웃 | 中 |

**구현 옵션:**
- A) `slowapi` (`pip install slowapi`) — FastAPI 친화, 최소 설정
- B) 인메모리 dict + threading.Lock — 외부 의존성 0, NAS 환경에 가벼움
- C) Redis — 다중 인스턴스 동기화 시 필요 (현재 NAS 단일 인스턴스 → 불필요)

**권장:** B 단순 인메모리 (단일 NAS 환경). 다중 인스턴스 전환 시 A 로 재구성.

### 4-6. Query string PIN 제거

- `settings.py:119` `/api/settings/integrity/inventory` GET ?pin → POST body
- `departments.py:81` `/api/departments/...` 동일 처리

→ **MES-BE-006** 으로 이미 분리됨. 본 PR 범위 외, 우선 진행 권장.

---

## 5. rollback 전략

### 5-1. 신규 컬럼 안전 설계

```
Phase 1 (구현 PR): pin_hash_v2 추가, lazy migration 시작. pin_hash 그대로 보존.
Phase 2 (90일 후): pin_hash_v2 가 NOT NULL 인 직원 비율 확인. 95% 이상이면 다음 단계.
Phase 3 (선택적): pin_hash 컬럼 DROP. 이 시점에 rollback 어려움.
```

→ Phase 2 까지는 v1 / v2 양립 → 언제든 v1 코드로 롤백 가능.

### 5-2. 롤백 절차 (Phase 1~2)

1. 코드 revert (`pin_auth.py` 만 이전 SHA-256 본문으로)
2. `pin_hash_v2` 컬럼은 그대로 둠 (사용 안 함, 문제 없음)
3. 기존 직원 모두 `pin_hash` (SHA-256) 그대로 유효 — 즉시 정상 로그인

### 5-3. 데이터 무결성

- `pin_hash_v2` 가 채워진 직원이 v1 으로 롤백되면 — **다시 SHA-256 PIN 으로 로그인 필요**
- v1 PIN 은 그대로 보존되어 있으므로 로그인 가능
- 직원 입장: 변경 없음

### 5-4. argon2 라이브러리 실패 시

- Dockerfile 빌드 단계에서 `argon2-cffi` 설치 실패 → bcrypt 로 자동 폴백 (별도 빌드 인자)
- 운영 컨테이너 시작 시 알고리즘 자동 감지 (`pin_hash_v2` 의 prefix `$argon2id$` vs `$2b$`)

---

## 6. 본 PR 범위 / 다음 PR 분리

### 본 PR (현재 — 설계만)

- [x] 본 문서 작성
- [x] 위험 분석 / 마이그레이션 / rollback 설계 명시
- [ ] **코드 변경 0**
- [ ] **DB 변경 0**
- [ ] **로그인 흐름 변경 0**

### 다음 PR (별도, D등급)

| 단계 | 작업 | 위험 |
|---|---|---|
| PR-1 | `argon2-cffi` 의존성 + `pin_auth.py` 알고리즘 분기 (lazy migration 진입점) | C |
| PR-2 | Alembic 마이그레이션 — `pin_hash_v2`, `ADMIN_PIN_KEY_V2` 컬럼 추가 | C |
| PR-3 | `verify_pin` 호출처 5곳 (employees, settings, stock_requests×3, transactions) 모두 lazy migration 로직 적용 | D |
| PR-4 | `must_change_pin` 응답 플래그 + 프론트 강제 변경 모달 | C |
| PR-5 | rate limit (인메모리 단순) | C |
| PR-6 | (90일 후) `pin_hash` 컬럼 DROP, v1 코드 제거 | D |

---

## 7. 실제 구현 전 필요한 확인 (회사 PC)

- [ ] `pip install argon2-cffi` 가 운영 환경 (NAS / Docker python:3.11-slim) 에서 빌드 통과하는지 확인
- [ ] 빌드 실패 시 bcrypt 로 폴백 의사결정 사전 확정
- [ ] 현재 직원 수 / `pin_hash IS NULL` 비율 통계 (회사 PC 백업 후 SELECT)
  ```sql
  SELECT COUNT(*) AS total,
         SUM(CASE WHEN pin_hash IS NULL THEN 1 ELSE 0 END) AS null_count
  FROM employees;
  ```
- [ ] 시스템 설정의 관리자 PIN 이 기본값 (`hash_pin("0000")`) 그대로인지 확인
- [ ] Alembic 마이그레이션 환경 / 백업 절차 점검
- [ ] 운영 직원에게 90일 내 강제 PIN 변경 일정 사전 공지 가능 여부
- [ ] `slowapi` 사용 여부 결정 (인메모리 vs slowapi vs Redis)
- [ ] MES-BE-006 (Query string PIN → POST body) 가 본 PR 보다 먼저 진행되는지 순서 확정

---

## 8. 참고 — 본 PR 에서는 절대 수정하지 않은 파일

| 파일 | 사유 |
|---|---|
| `backend/app/services/pin_auth.py` | 알고리즘 본체 — 다음 PR |
| `backend/app/models.py` | DB 컬럼 추가 — Alembic PR |
| `backend/app/routers/employees.py` | PIN 검증 호출처 — 별도 PR |
| `backend/app/routers/settings.py` | 관리자 PIN — 별도 PR |
| `backend/app/routers/inventory/transactions.py` | 거래 정정 PIN — 별도 PR |
| `backend/app/services/stock_requests.py` | 요청 승인/취소 PIN — 별도 PR |
| `backend/app/routers/departments.py` | Query string PIN — MES-BE-006 |
| 프론트 PIN 모달 | 강제 변경 화면 — 별도 프론트 PR |
