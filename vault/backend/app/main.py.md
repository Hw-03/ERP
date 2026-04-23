---
type: code-note
project: ERP
layer: backend
source_path: backend/app/main.py
status: active
tags:
  - erp
  - backend
  - entrypoint
  - fastapi
aliases:
  - 백엔드 진입점
  - 서버 시작 파일
---

# main.py

> [!summary] 역할
> FastAPI 서버의 **진입점**. 앱 실행 시 가장 먼저 실행되는 파일이다.
> DB 초기화, 마이그레이션, 기초 데이터 시드, 라우터 등록을 모두 여기서 처리한다.

> [!info] 주요 책임
> - FastAPI 앱 인스턴스 생성 (`app = FastAPI(...)`)
> - CORS 설정 — localhost:3000, 내부 네트워크 IP 허용
> - 14개 라우터를 `/api/...` 경로로 등록
> - `run_migrations()` — SQLite 컬럼 추가 마이그레이션 (실행 시마다 자동)
> - `ensure_reference_data()` — 직원, 제품 심볼, 옵션코드, 공정 타입, 흐름 규칙 초기 데이터 생성
> - `populate_erp_codes()` — ERP 4-part 코드가 없는 품목에 자동 부여
> - `/health`, `/` 엔드포인트 제공

> [!warning] 주의
> - 이 파일은 서버 시작 시 DB 마이그레이션과 시드를 **자동 실행**한다.
> - `run_migrations()`는 이미 존재하는 컬럼이면 오류를 무시하고 넘어간다 (안전함).
> - 직원 시드 데이터에 실제 직원 이름이 하드코딩되어 있음 (운영 데이터 주의).
> - ERP 버전: `1.2.0`

## 등록된 라우터 목록

| 라우터 | 경로 |
|--------|------|
| items | `/api/items` |
| employees | `/api/employees` |
| settings | `/api/settings` |
| ship_packages | `/api/ship-packages` |
| inventory | `/api/inventory` |
| bom | `/api/bom` |
| production | `/api/production` |
| codes | `/api/codes` |
| queue | `/api/queue` |
| scrap | `/api/scrap` |
| loss | `/api/loss` |
| variance | `/api/variance` |
| alerts | `/api/alerts` |
| counts | `/api/counts` |

---

## 쉬운 말로 설명

**서버 켜면 가장 먼저 실행되는 파일**. 세 가지를 순서대로 처리:

1. **DB 구조 맞춤** — `Base.metadata.create_all()` 로 모든 테이블 생성(있으면 스킵) + `run_migrations()` 로 신규 컬럼 뒤늦게 추가.
2. **기초 데이터 시드** — 직원 26명, 제품 심볼 100슬롯(5개 배정 + 95개 예약), 옵션 3개(BG/WM/SV), 공정 타입 11개, 흐름 규칙 6개.
3. **ERP 코드 일괄 부여** — 과거 품목 중 코드 없는 것들에 자동 부여.

그 뒤 FastAPI 앱 객체를 만들고 14개 라우터 등록. `/health`, `/` 두 개의 시스템 엔드포인트 제공. `uvicorn` 이 이 파일의 `app` 변수를 찾아서 HTTP 서버를 띄운다.

---

## 서버 시작 흐름

```
uvicorn이 app.main:app 찾음
  ↓
Base.metadata.create_all(bind=engine)  # 테이블 없으면 생성
  ↓
run_migrations()  # items/inventory에 새 컬럼 뒤늦게 추가
  ↓
FastAPI() 앱 생성 + CORS 미들웨어 + 라우터 14개 등록
  ↓
ensure_reference_data()  # 직원/심볼/옵션/공정 시드
  ↓
populate_erp_codes()  # 코드 없는 품목에 ERP 코드 부여
  ↓
서버 listen 시작 (기본 :8000)
```

---

## 자동 시드 데이터

### 직원 26명 (최초 1회만)
- `E01` ~ `E26` 코드, 부서별 분포:
  - 조립 8명 (김민재, 김종숙, 이계숙, 김건호, 남재원, 김현우, 이형진, 이필욱)
  - 진공 3명 (허동현, 김재현, 이지훈)
  - 고압 2명 (김지현, 민애경)
  - 튜닝 2명 (오세현, 이지현)
  - 튜브 1명 (김도영)
  - AS 1명 (문종현)
  - 연구 2명 (이성민, 오성식)
  - 기타 3명 (류승범, 최윤영, 박성현)
  - 영업 4명 (양승규, 김예진, 심이리나, 드미트리)
- 레벨: MANAGER 7명, STAFF 18명, ADMIN 1명(대표)

### 제품 심볼 100슬롯
- 배정 5개: `1→3(DX3000)`, `2→7(COCOON)`, `3→8(SOLO)`, `4→4(ADX4000W)`, `5→6(ADX6000FB)` 모두 `is_finished_good=True`.
- 예약 95개: 슬롯 6~100, `is_reserved=True`.

### 옵션 3개
```
BG → 블랙 유광   (#111111)
WM → 화이트 무광 (#F7F7F7)
SV → 실버       (#C0C0C0)
```

### 공정 타입 11개 (stage_order 순)
`TR(10)→TA(20)→HR(15)→HA(30)→VR(25)→VA(40)→NA(50)→AR(45)→AA(60)→PR(55)→PA(70)`

### 공정 흐름 규칙 6개 (`process_flow_rules`)
```
TR → TA              (튜브 원자재 → 튜브 조립체)
TA + HR → HA         (튜브 + 고압 원자재 → 고압 조립체)
HA + VR → VA         (고압 + 진공 원자재 → 진공 조립체)
VA → NA              (진공 → 튜닝)
NA + AR → AA         (튜닝 + 조립 원자재 → 최종 조립체)
AA + PR → PA         (최종 조립체 + 포장 원자재 → 완제품)
```

---

## run_migrations() 동작 원리

이미 배포된 SQLite DB 에 **데이터 손실 없이** 컬럼 추가.

```python
for sql in new_columns:
    try:
        conn.execute(text(sql))  # ALTER TABLE ADD COLUMN ...
        conn.commit()
    except Exception:
        pass  # 이미 있으면 조용히 스킵
```

현재 추가하는 컬럼들:
- Items: `barcode`, `legacy_file_type/part/item_type/model`, `supplier`, `min_stock`, `erp_code`, `symbol_slot`, `process_type_code`, `option_code`, `serial_no`
- Inventory: `pending_quantity`, `last_reserver_*`, `warehouse_qty`
- TransactionLog: `batch_id`

또한 **1회성 데이터 이관** 실행: `UPDATE inventory SET warehouse_qty = quantity WHERE warehouse_qty = 0 AND quantity > 0`.

---

## CORS 설정

```python
allow_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
allow_origin_regex = "^https?://(localhost|127\\.0\\.0\\.1|192\\.168\\.\\d+\\.\\d+|10\\.\\d+\\.\\d+\\.\\d+|172\\.(1[6-9]|2\\d|3[0-1])\\.\\d+\\.\\d+)(:\\d+)?$"
```

로컬 + 사내 내부망 IP (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`)는 자동 허용. 외부 IP는 차단.

---

## 시스템 엔드포인트

| 경로 | 메서드 | 응답 |
|------|--------|------|
| `/health` | GET | `{"status": "ok", "service": "X-Ray ERP API"}` |
| `/` | GET | `{"message": "...", "docs": "/docs", "version": "1.2.0"}` |
| `/docs` | GET | Swagger UI (OpenAPI 자동 문서) |
| `/redoc` | GET | ReDoc UI |

---

## FAQ

**Q. 서버 시작 시 DB가 초기화되나?**
아님. `create_all` 은 **없으면 생성**이고, 이미 있으면 건드리지 않음. 데이터 보존.

**Q. 직원 데이터가 하드코딩된 이유?**
프로토타입이라 편의상. 운영 전환 시 시드 로직을 `seed.py` 로 옮기고 main 에서 제거 권장.

**Q. `populate_erp_codes` 는 매번 돌아도 되나?**
안전함. `erp_code IS NULL` 인 행만 대상이라 이미 부여된 품목은 건너뜀.

**Q. 라우터 등록 순서가 중요?**
FastAPI 에선 순서 무관(prefix 서로 다름). 문서 순서만 영향.

**Q. docs 접속이 안 되면?**
브라우저에서 `http://localhost:8000/docs`. 포트 다르면 `docker-compose.yml` 또는 uvicorn 실행 옵션 확인.

---

## 관련 문서

- [[backend/app/database.py.md]] — 엔진/세션 설정
- [[backend/app/models.py.md]] — 모든 ORM 클래스
- [[backend/app/routers/routers]]
- [[backend/app/utils/erp_code.py.md]] — `infer_process_type`, `make_erp_code`
- [[backend/seed.py.md]]

Up: [[backend/app/app]]
