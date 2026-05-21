# 백엔드 수정안 — 2026-05-02

> **작업 ID:** MES-BE-001~006
> **작성일:** 2026-05-02 (토)
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)
> **수정 여부:** 없음 (계획 문서만, 실제 수정은 회사 PC)

---

## MES-BE-001 — `update_item` + `process_type_code` 누락 버그

### 현상

품목 마스터 화면에서 `process_type_code` 변경 시 저장되지 않음.

### 원인

| 위치 | 문제 |
|---|---|
| `backend/app/schemas.py:41-51` (`ItemUpdate`) | `process_type_code` 필드 자체가 없음 |
| `backend/app/routers/items.py:415-444` (`update_item`) | 10개 필드 루프 돌리는데 `process_type_code` 미포함 |

### 수정안

```python
# schemas.py — ItemUpdate에 추가
class ItemUpdate(BaseModel):
    item_name: Optional[str] = None
    spec: Optional[str] = None
    unit: Optional[str] = None
    barcode: Optional[str] = None
    min_stock: Optional[int] = None
    process_type_code: Optional[str] = None   # ← 추가
    # ... 기존 필드 유지
```

```python
# items.py — update_item 루프에 추가
for field in (
    "item_name", "spec", "unit", "barcode", "min_stock",
    "process_type_code",   # ← 추가
    # ... 기존 필드
):
    value = getattr(payload, field, None)
    if value is not None:
        setattr(item, field, value)
```

### 검증 절차 (회사 PC)

```bash
# 실제 라우트: backend/app/routers/items.py 의 @router.put("/{item_id}")
# → 메서드는 PUT (PATCH 아님)

# 1) 변경 전 baseline
curl -s http://localhost:8010/api/items/1 | jq '.process_type_code'

# 2) PUT 시도 (전체 페이로드 또는 부분 페이로드는 ItemUpdate 스키마에 맞춤)
curl -X PUT http://localhost:8010/api/items/1 \
  -H "Content-Type: application/json" \
  -d '{"process_type_code":"AS1"}'

# 3) 변경 후 확인
curl -s http://localhost:8010/api/items/1 | jq '.process_type_code'
```

### 위험도

**C** (서버 코드 변경 + 동작 검증 필요, 데이터 마이그레이션 없음)

---

## MES-BE-002 — `option_code` 길이 불일치

### 현상

| 위치 | 길이 |
|---|---|
| `backend/bootstrap_db.py:72` | `VARCHAR(2)` |
| `backend/app/models.py:169` (`Item.option_code`) | `String(10)` |
| `backend/app/schemas.py` (`ItemBase.option_code`) | `max_length=10` |

bootstrap에서 새로 만든 DB는 2자만 허용, 기존 DB(SQLite WAL)는 10자 허용 → 신규 환경에서 3자 이상 옵션 코드 입력 시 깨짐.

### 수정안

```python
# bootstrap_db.py:72
option_code VARCHAR(10),   # 2 → 10
```

### 검증 절차 (회사 PC)

```bash
# 신규 erp.db 만들기 전 확인
sqlite3 backend/erp.db ".schema items" | grep option_code

# 수정 후 재생성
rm backend/erp.db
python backend/bootstrap_db.py
sqlite3 backend/erp.db ".schema items" | grep option_code
```

### 위험도

**C** (DDL 변경이나, 기존 erp.db는 영향 없음 — 신규 환경만)

---

## MES-BE-003 — `/health/detailed` 필드명 문서 정정

### 현상

`docs/OPERATIONS.md` 의 필드명이 실제 응답과 5곳 불일치.

### 매핑

| OPERATIONS.md (틀림) | 실제 (`backend/app/main.py:254-300`) |
|---|---|
| `database` | `db` |
| `tables` | `rows` |
| `open_queue_count` | `open_queue_batches` |
| `latest_transaction_at` | `last_transaction_at` |
| (누락) | `inventory_mismatch_count` |

### 수정안

`docs/OPERATIONS.md` 의 `/health/detailed` 응답 예시 블록만 교체. 코드 변경 없음.

### 위험도

**A** (문서만 수정)

---

## MES-BE-004 — Dockerfile / 포트 통일

### 현상

| 파일 | 포트 | `--reload` |
|---|---|---|
| `start.bat` | 8010 | ✅ (개발용) |
| `Dockerfile` | 8000 | ✅ (운영에 부적합) |
| `docker-compose.yml` | 확인 필요 | — |

운영 컨테이너에서 `--reload` 가 켜져있으면 inotify watcher 가 메모리 누수, 포트가 8000 ≠ 8010 이라 docker-compose 와 start.bat 간 동선 분리.

### 수정안

```dockerfile
# Dockerfile
EXPOSE 8010
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
# ↑ --reload 제거, 포트 8010 통일
```

### 검증 절차 (회사 PC)

```bash
docker build -t mes-backend backend/
docker run -p 8010:8010 mes-backend
curl http://localhost:8010/health
```

### 위험도

**C** (운영 영향 가능 → docker-compose 확인 후 동시 변경)

---

## MES-BE-005 — PIN 보안 (SHA-256 → bcrypt/argon2id)

### 현상

`backend/app/services/pin_auth.py`:

- 현재: SHA-256 단일 해시 (salt 없음, stretch 없음)
- 기본값: `DEFAULT_PIN = "0000"`
- 마이그레이션: 평문 → 해시 lazy migration 이미 존재

### 위험

- SHA-256 + 4자리 숫자 → 레인보우 테이블 즉시 역산 (10000 조합)
- 동일 PIN 사용자 간 해시 충돌
- 무차별 대입 속도 제한 없음 (rate limit 없음)

### 수정안 (별도 PR — D등급)

```python
# pin_auth.py 후보
import bcrypt   # 또는 argon2-cffi

def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt(rounds=12)).decode()

def verify_pin(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())
```

### 마이그레이션 전략

1. 신규 컬럼 `pin_hash_v2` 추가 (기존 `pin_hash` 유지)
2. 로그인 시 v2 비어있으면 v1 검증 → 성공 시 v2 채움 (lazy)
3. 일정 기간 후 v1 컬럼 제거

### 첫 진입 강제 변경

`DEFAULT_PIN = "0000"` 으로 로그인 성공 시 PIN 변경 화면 강제.

### 위험도

**D** (인증 영향, 별도 PR + 별도 단계로 분리 — 이번 주 작업 범위 아님)

---

## MES-BE-006 — `/api/settings/integrity/inventory` PIN 전달 방식

### 현상

(추정) `GET /api/settings/integrity/inventory?pin=0000` — PIN 이 query string 으로 전달 → 액세스 로그에 평문 PIN 기록 위험.

### 수정안

```python
# routers/settings.py
class IntegrityRequest(BaseModel):
    pin: str

@router.post("/integrity/inventory")  # GET → POST
def integrity_inventory(payload: IntegrityRequest, db: Session = Depends(get_db)):
    verify_admin_pin(payload.pin)
    # ... 기존 로직
```

### 프론트 변경

```ts
// fetch URL 에서 ?pin= 제거, body 로 전달
await fetch("/api/settings/integrity/inventory", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ pin })
});
```

### 검증 절차

```bash
# 변경 전 액세스 로그
tail -n 20 backend/logs/access.log | grep integrity

# 변경 후: URL 에 pin 안 보여야 함
```

### 위험도

**C** (프론트+백엔드 동시 변경 필요, 기존 호출처 1곳 추정)

---

## 종합 우선순위 (위험도/임팩트)

| ID | 제목 | 위험도 | 임팩트 | 권장 순서 |
|---|---|---|---|---|
| BE-001 | update_item process_type_code | C | 高 (관리자 버그) | 1 |
| BE-003 | OPERATIONS.md 정정 | A | 中 (문서) | 2 |
| BE-002 | option_code VARCHAR(10) | C | 中 (신규 환경만) | 3 |
| BE-006 | integrity PIN POST 전환 | C | 中 (보안) | 4 |
| BE-004 | Dockerfile 포트/reload | C | 中 (운영) | 5 |
| BE-005 | PIN bcrypt 전환 | D | 高 (인증) | 별도 PR |

---

## 회사 PC 첫 작업 추천

**P-MON-01** (월요일 시작용): **BE-001** 단독 진행
- 코드 변경 2곳 (schemas.py 1줄 + items.py 1줄)
- 수동 검증 3-step (curl PUT)
- 동선 짧고 회귀 위험 낮음
