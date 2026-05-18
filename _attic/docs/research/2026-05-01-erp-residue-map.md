# ERP 잔재 매핑 노트 — 2026-05-01

> **작업 ID:** MES-NAME-001  
> **작성일:** 2026-05-01 (금)  
> **기준 브랜치:** `feat/hardening-roadmap`  
> (초기 분석은 `claude/analyze-dexcowin-mes-tGZNI` 에서 시작했으나 fast-forward 머지 후 통일. 이 브랜치는 폐기됨.)  
> **수정 여부:** 없음 (읽기 전용 분석)  
> **grep 범위:** 전체 프로젝트 (`_archive/`, `backups/`, `vault/`, `node_modules/`, `.next/` 제외)

---

## 1. 총계

| 분류 | 건수 |
|---|---|
| 변경 금지 (frozen identifier) | 16 |
| 변경 후보 A등급 (시스템명/로깅/주석) | 20 |
| 변경 후보 B등급 (신중 검토 필요) | 4 |
| 보존 권장 (역사적 기록) | 2 |
| **합계** | **42** |

---

## 2. 변경 금지 식별자 (절대 건드리지 말 것)

> 이 항목들은 `erp` 글자가 박혀 있어도 **변경 금지**. DB 컬럼, API 계약, localStorage key, 파일명에 의존하는 전 시스템 영향 범위.

| # | 식별자 | 파일:라인 | 이유 |
|---|---|---|---|
| F-01 | `items.erp_code` (DB 컬럼) | `backend/app/models.py`, `backend/app/schemas.py`, `frontend/lib/api.ts:147` 전반 | DB 컬럼명 — Alembic 없으면 마이그레이션 불가 |
| F-02 | `formatErpCode()` | `frontend/lib/api.ts:147` | DB `erp_code` 필드 직접 사용, 전 화면 영향 |
| F-03 | `erpCodeDept()` | `frontend/app/legacy/_components/legacyUi.ts` | erp_code 컬럼 파싱 |
| F-04 | `erpCodeDeptBadge()` | `frontend/app/legacy/_components/legacyUi.ts:199` | erp_code 컬럼 파싱 |
| F-05 | `ErpCode` class | `backend/app/services/codes.py:44` | 코드 생성/파싱 핵심 클래스 |
| F-06 | `ErpCodeParseRequest`, `ErpCodeGenerateRequest`, `ErpCodeResponse` | `backend/app/schemas.py:533-543` | API 계약 — 변경 시 `/api/codes` 전체 영향 |
| F-07 | `erp.db` (DB 파일명) | `backend/app/database.py:13`, `docker/docker-compose.nas.yml:9,13` 전반 | DB 파일명 — 변경 시 전 Docker/ops 스크립트 영향 |
| F-08 | `erp_code.py` (파일명) | `backend/app/utils/erp_code.py` | 의도적 보존 (CLAUDE.md 명시) |
| F-09 | `ErpLoginGate` (컴포넌트/파일명) | `frontend/app/legacy/_components/login/ErpLoginGate.tsx` | 진입점 컴포넌트 — `legacy/page.tsx:18,33,41` import |
| F-10 | `dexcowin_erp_operator` (localStorage key) | `frontend/app/legacy/_components/login/useCurrentOperator.ts:21` | 운영 중 브라우저 스토리지 데이터 손실 위험 |
| F-11 | `dexcowin_erp_boot_id` (localStorage key) | `frontend/app/legacy/_components/login/useCurrentOperator.ts:22` | 위 동일 |
| F-12 | `Hw-03/ERP` (GitHub 레포명) | — | CI URL, clone 경로 전반 영향 |
| F-13 | `C:/ERP/`, `ERP/` (디렉터리 경로) | `scripts/migrations/fix_legacy_items.py:9`, `scripts/dev/test_encoding.py:7` 등 | 실제 파일시스템 경로 |
| F-14 | `xray-erp-frontend` (`package.json` name) | `frontend/package.json:2`, `frontend/package-lock.json:2,8` | npm 식별자 — lock 파일 재생성 수반 |
| F-15 | `erp-card-anim`, `erp-card-rise`, `erp-letter`, `erp-letter-in` (CSS 클래스) | `frontend/app/legacy/_components/login/ErpLoginGate.tsx:100-101`, `LoginIntro.tsx:107,113,127,133` | 애니메이션 CSS — 실행 중 화면 깨짐 위험 |
| F-16 | `ERP_Master_DB.csv` (데이터 파일명) | `backend/seed.py:28`, `backend/sync_excel_stock.py:25`, `scripts/dev/erp_integration.py:60-64` | 실제 데이터 파일명 |

---

## 3. 변경 후보 A등급 — 시스템명/로깅/주석 (모바일 수정 가능)

> `start.bat`, ops 스크립트, 백엔드 주석에 박힌 `[ERP]` 텍스트. UI/로그 표기만 변경. 코드 식별자 변경 없음.

| # | 파일:라인 | 현재 텍스트 | 변경 후보 | 비고 |
|---|---|---|---|---|
| A-01 | `start.bat:14` | `echo [ERP] Installing frontend...` | `[MES]` | 로깅 텍스트만 |
| A-02 | `start.bat:23` | `echo [ERP] Installing backend...` | `[MES]` | 로깅 텍스트만 |
| A-03 | `start.bat:27` | `echo [ERP] WARNING: backend pip install failed.` | `[MES]` | 로깅 텍스트만 |
| A-04 | `start.bat:28` | `echo [ERP] If you see a psycopg2 build error...` | `[MES]` | 로깅 텍스트만 |
| A-05 | `start.bat:29` | `echo [ERP] Recommended: install Python 3.13...` | `[MES]` | 로깅 텍스트만 |
| A-06 | `start.bat:40` | `echo [ERP] Ensuring DB schema is up to date...` | `[MES]` | 로깅 텍스트만 |
| A-07 | `start.bat:43` | `echo [ERP] ERROR: bootstrap_db.py ... failed.` | `[MES]` | 로깅 텍스트만 |
| A-08 | `start.bat:58` | `echo [ERP] Detected IP: %IP%` | `[MES]` | 로깅 텍스트만 |
| A-09 | `start.bat:59` | `echo [ERP] URL: http://%IP%:3000` | `[MES]` | 로깅 텍스트만 |
| A-10 | `docs/ARCHITECTURE.md:13` | `ERP/` (폴더 구조도 최상단) | `ERP/ (= 프로젝트 루트, DEXCOWIN MES)` | 디렉터리명은 유지, 주석으로 시스템명 표기 |
| A-11 | `backend/app/models.py:154` | `# populated from ERP_Master_DB.csv or rule-based defaults` | `# populated from ERP_Master_DB.csv ...` — **ERP_Master_DB.csv는 파일명이므로 변경 금지, 주석만 표현 조정** | 부분 보존 |
| A-12 | `backend/app/models.py:164` | `# 4-part ERP code ([모델기호조합]-[구분코드]-[일련번호]-[옵션코드])` | `# 4-part 품목 코드 (MES 코드 체계)` | 주석 한국어화 후보 |
| A-13 | `scripts/ops/healthcheck.bat:3` | `rem  ERP 헬스체크 스크립트` | `rem  MES 헬스체크 스크립트` | 주석만 |
| A-14 | `scripts/ops/reconcile_inventory.bat:3` | `rem  ERP 재고 정합성 1차 진단 스크립트` | `rem  MES 재고 정합성 1차 진단 스크립트` | 주석만 |
| A-15 | `scripts/ops/restore_db.bat:3` | `rem  ERP DB restore (operator must stop the backend first!)` | `rem  MES DB restore ...` | 주석만 |
| A-16 | `scripts/ops/backup_db.bat:3` | `rem  ERP DB backup script (WAL safe)` | `rem  MES DB backup script (WAL safe)` | 주석만 |
| A-17 | `backend/app/services/seed_cleanup.py:41` | `raise ValueError(f"ERP 코드 형식 오류: {raw!r}")` | `raise ValueError(f"품목 코드 형식 오류: {raw!r}")` | 에러메시지 한국어화 후보 |
| A-18 | `backend/app/services/seed_cleanup.py:121` | `raise ValueError(f"ERP 코드 중복: {erp}")` | `raise ValueError(f"품목 코드 중복: {erp}")` | 에러메시지 한국어화 후보 |
| A-19 | `backend/bootstrap_db.py:2` | `bootstrap_db.py — DB 스키마 / 마이그레이션 / 참조 데이터 / ERP 코드 백필 통합 CLI.` | `... / 품목 코드 백필 ...` | docstring 후보 |
| A-20 | `backend/bootstrap_db.py:398` | `description="ERP backend DB bootstrap tool"` | `description="MES backend DB bootstrap tool"` | CLI 설명 텍스트 |

---

## 4. 변경 후보 B등급 — 신중 검토 필요 (diff 검토 + 서버 확인)

| # | 파일:라인 | 현재 | 제안 | 주의사항 |
|---|---|---|---|---|
| B-01 | `frontend/package.json:2` | `"name": "xray-erp-frontend"` | `"name": "dexcowin-mes-frontend"` | `package-lock.json` 재생성 필요. npm install 후 검증. |
| B-02 | `backend/app/_logging.py:30,31,42,62` | 로거 이름 `"erp"`, 로그 파일 `erp.log` | `"mes"`, `mes.log` | ops 스크립트 전반에 `erp.log` 경로 하드코딩됨 (`docs/OPERATIONS.md:148`). 함께 변경 필수. |
| B-03 | `backend/seed.py:2` | `Seed SQLite ERP data from ERP_Master_DB.csv.` | `Seed SQLite MES data from ERP_Master_DB.csv.` | ERP_Master_DB.csv 파일명은 그대로 유지 |
| B-04 | `backend/sync_excel_stock.py:2` | `Sync legacy metadata and current stock from ERP Excel workbooks into backend/erp.db.` | `Sync legacy metadata and current stock from ERP Excel workbooks into backend/erp.db.` (erp.db는 변경 금지라 주석 수정 효과 미미) | 사실상 변경 실익 없음 → 보류 권장 |

---

## 5. 보존 권장 (역사적 기록, 변경 불필요)

| # | 파일:라인 | 내용 | 이유 |
|---|---|---|---|
| P-01 | `docs/CODEX_PROGRESS.md:78,89` | `feat/erp-overhaul` 브랜치명 참조 | 개발 이력 기록 — 변경 시 히스토리 맥락 상실 |
| P-02 | `docs/regression-2026-04-26/README.md:3` | `feat/erp-overhaul` 브랜치명 | 회귀 테스트 문서 기준점 |

---

## 6. 파일별 집계

| 파일 | 건수 | 분류 |
|---|---|---|
| `start.bat` | 9 | A등급 (A-01~A-09) |
| `backend/app/models.py` | 2 | A등급 (A-11, A-12) |
| `backend/app/services/seed_cleanup.py` | 4 | A등급 (A-17~A-18 포함) |
| `backend/bootstrap_db.py` | 2 | A등급 (A-19, A-20) |
| `scripts/ops/*.bat` | 4 | A등급 (A-13~A-16) |
| `docs/ARCHITECTURE.md` | 1 | A등급 (A-10) |
| `frontend/package.json` | 1 | B등급 (B-01) |
| `backend/app/_logging.py` | 4 | B등급 (B-02) |
| `backend/seed.py` | 1 | B등급 (B-03) |
| `backend/sync_excel_stock.py` | 1 | B등급 (B-04, 보류 권장) |
| `docs/CODEX_PROGRESS.md` | 2 | 보존 |
| `docs/regression-*/README.md` | 1 | 보존 |
| frozen identifiers (F-01~F-16) | 16 | 변경 금지 |

---

## 7. 핵심 결정 요약

### 절대 변경 금지
- `erp_code` (DB 컬럼), `formatErpCode`, `ErpCode`, `ErpLoginGate`, `erp.db`, `ERP_Master_DB.csv`
- localStorage keys `dexcowin_erp_operator/boot_id`
- CSS 클래스 `erp-card-anim`, `erp-letter` 계열
- `xray-erp-frontend` (package.json) — lock 파일 재생성 선행 필요

### 모바일에서 바로 가능 (A등급, 회사 PC 확인 불필요)
- `start.bat` 로깅 텍스트 9곳 → `[ERP]` → `[MES]`
- ops 스크립트 주석 4곳 → `ERP` → `MES`
- `backend/app/models.py` 주석 2곳
- `backend/bootstrap_db.py` CLI 설명

### 월요일 회사 PC 확인 필요 (B등급)
- `frontend/package.json name` 변경 → npm install 재검증
- `_logging.py` 로거/파일명 변경 → ops 스크립트 `erp.log` 경로 일괄 변경 수반

---

## 8. 다음 작업

- `MES-TREE-001` — 폴더 전체 분류표 작성 → `docs/research/2026-05-01-folder-classification.md` ✅

---

# 표준 용어 사전 — MES-TERM-001

> **작업 ID:** MES-TERM-001  
> **원칙:** UI 한국어 라벨만 변경. 코드 식별자(함수/변수/타입/파일명/API path)·DB 컬럼명은 영문 유지.

## 용어 사전 25개

| # | 영문 식별자 | 한국어 UI 라벨 | 유지/변경 | 확인 파일 | 위험도 | 비고 |
|---|---|---|---|---|---|---|
| 1 | ERP (시스템명) | **MES** | 변경 (시스템명만) | `README.md`, `backend/app/main.py` | A | 공식명: DEXCOWIN MES |
| 2 | erp_code | erp_code | **유지** | `items` 테이블, `frontend/lib/api.ts` | D | DB 컬럼 — 변경 금지 |
| 3 | item | 품목 | UI 라벨만 | `routers/items.py`, `schemas.py` | A | item/product/material 구분 필요 |
| 4 | product | 제품 (완성품) | UI 라벨만 | `routers/models.py`, `ProductSymbol` | A | item(총칭)과 구분 |
| 5 | material | 자재 (원자재) | UI 라벨만 | UI 라벨 내 | A | 부품·반제품과 구분 |
| 6 | inventory | 재고 | UI 라벨만 | `routers/inventory/`, `services/inventory.py` | A | stock과 동의어로 혼용 중 |
| 7 | stock | 재고 | UI 라벨만 | `services/stock_math.py` | B | 코드 식별자 `stock_math` 유지 |
| 8 | warehouse | 창고 | UI 라벨만 | `DesktopWarehouseView.tsx` | A | |
| 9 | department | 부서 | UI 라벨만 | `routers/departments.py` | A | |
| 10 | inbound | 입고 | UI 라벨만 | `routers/inventory/receive.py` | A | |
| 11 | outbound | 출고 | UI 라벨만 | `routers/inventory/ship.py` | A | |
| 12 | adjustment | 조정 | UI 라벨만 | UI 라벨 내 | A | 강제조정(admin PIN 필요)과 구분 |
| 13 | count | 실사 | UI 라벨만 | `routers/counts.py` | A | 재고 실사 의미 |
| 14 | audit | 감사 로그 | UI 라벨만 | `routers/admin_audit.py` | A | 관리자 액션 로그 |
| 15 | production | 생산 | UI 라벨만 | `routers/production.py` | A | |
| 16 | reservation | 예약 | UI 라벨만 | `routers/stock_requests.py` | A | 생산 자재 사전 확보 |
| 17 | confirm | 확정 | UI 라벨만 | UI 라벨 내 | A | 예약→확정 전환 |
| 18 | cancel | 취소 | UI 라벨만 | UI 라벨 내 | A | |
| 19 | loss | 분실 | UI 라벨만 | `routers/loss.py` | A | 물리적 분실 |
| 20 | scrap / disposal | 폐기 | UI 라벨만 | `routers/scrap.py` | A | scrap과 disposal 한국어 통일 필요 |
| 21 | waste | 폐기 (=scrap) | UI 라벨만 | UI 라벨 내 | A | scrap과 통합 표기 검토 |
| 22 | BOM | BOM (그대로) | **유지** | `routers/bom.py` | A | 국제 표준 용어 |
| 23 | package | 출하패키지 | UI 라벨만 | `routers/ship_packages.py` | A | 출하 단위 묶음 |
| 24 | legacy | (그대로 유지) | **유지** | `app/legacy/` 디렉터리 | D | 라우트 경로 영향 — 절대 변경 금지 |
| 25 | admin | 관리자 | UI 라벨만 | UI 라벨 내 | A | |

## 적용 원칙 요약

1. **UI 한국어 라벨만** 위 표대로 통일 (화면에 표시되는 텍스트)
2. **코드 식별자**(함수명, 변수명, 타입명, 파일명, API path)는 영문 그대로 유지
3. **DB 컬럼명** 절대 변경 금지 (`erp_code`, `warehouse_qty`, `pending_quantity` 등)
4. `scrap`/`waste`/`disposal` 세 용어는 모두 **"폐기"**로 통일 (단, 코드 식별자는 유지)
5. `inventory`와 `stock` 코드 혼용은 허용 — UI 라벨만 "재고"로 통일

## 주의: 용어 충돌 3건

| 충돌 | 현재 상태 | 권장 처리 |
|---|---|---|
| `scrap` vs `disposal` vs `waste` | 3개 용어가 모두 "폐기" 의미로 산재 | UI 라벨 "폐기"로 통일, 코드는 유지 |
| `inventory` vs `stock` | 같은 의미로 혼용 | UI "재고" 통일, 코드 식별자는 혼용 허용 |
| `count` (개수) vs `count` (실사) | 문맥에 따라 의미 다름 | UI 라벨: 실사 카운트 → "실사", 수량 → "수량" |

---

## 9. 다음 작업

- `MES-TERM-002` — 용어 사전 ↔ 코드 파일 매핑표 (어떤 파일이 어떤 용어 쓰는지) ✅ (아래 섹션)

---

# 용어 사전 ↔ 코드 파일 매핑표 — MES-TERM-002

> **작업 ID:** MES-TERM-002  
> **목적:** 각 도메인 용어가 어느 파일/계층에서 사용되는지 추적. 리팩터·라벨 변경 시 영향 범위 파악용.

## 백엔드 매핑

| 도메인 용어 | 라우터 | 서비스 | 모델/스키마 | 비고 |
|---|---|---|---|---|
| 품목 (item) | `routers/items.py` | — | `models.py::Item`, `schemas.py::ItemBase/ItemCreate/ItemUpdate` | `erp_code` 컬럼 포함 |
| 재고 (inventory) | `routers/inventory/query.py`, `receive.py`, `ship.py`, `transfer.py`, `defective.py` | `services/inventory.py`, `stock_math.py` | `models.py::InventoryLocation` | `warehouse_qty`, `pending_quantity` |
| 창고 입고 (inbound) | `routers/inventory/receive.py` | `services/inventory.py` | `TransactionType.INBOUND` | |
| 창고 출고 (outbound) | `routers/inventory/ship.py` | `services/inventory.py` | `TransactionType.OUTBOUND` | |
| 조정 (adjustment) | `routers/inventory/receive.py` 또는 `counts.py` | `services/integrity.py` | `TransactionType.ADJUSTMENT` | 강제조정은 PIN 필요 |
| 부서 이동 (transfer) | `routers/inventory/transfer.py` | `services/inventory.py` | `TransactionType.TRANSFER` | |
| 실사 (count) | `routers/counts.py` | — | `models.py::StockCount` | |
| 생산 (production) | `routers/production.py`, `routers/queue.py` | `services/queue.py` | `models.py::QueueBatch`, `ProductionRecord` | |
| 예약 (reservation) | `routers/stock_requests.py` | `services/stock_requests.py` | `models.py::StockRequest` | `pending_quantity` 증가 |
| 폐기 (scrap/disposal) | `routers/scrap.py` | — | `models.py::ScrapRecord` | `waste` 용어 혼용 |
| 분실 (loss) | `routers/loss.py` | — | `models.py::LossRecord` | |
| 편차 (variance) | `routers/variance.py` | — | `models.py::VarianceRecord` | |
| BOM | `routers/bom.py` | `services/bom.py` | `models.py::BomItem` | |
| 출하패키지 (package) | `routers/ship_packages.py` | — | `models.py::ShipPackage` | |
| 부서 (department) | `routers/departments.py` | — | `models.py::Department` | `color_hex` 컬럼 |
| 직원 (employee) | `routers/employees.py` | — | `models.py::Employee` | PIN 포함 |
| 공정 (process_type) | `routers/codes.py` | `services/codes.py` | `models.py::ProcessType`, `schemas.py::ErpCode*` | |
| 옵션코드 (option_code) | `routers/codes.py` | `services/codes.py` | `models.py::OptionCode` | `VARCHAR(2)` vs `String(10)` 불일치 버그 |
| 제품기호 (product_symbol) | `routers/codes.py` | `services/codes.py` | `models.py::ProductSymbol` | ERD.md에서 `ProductModel`로 잘못 표기됨 |
| 알림 (alert) | `routers/alerts.py` | — | `models.py::Alert` | 안전재고 미만 트리거 |
| 감사 로그 (audit) | `routers/admin_audit.py` | `services/audit.py` | `models.py::AdminAuditLog` | |
| 시스템 설정 (settings) | `routers/settings.py` | `services/pin_auth.py` | — | PIN 평문 저장 버그 |

## 프론트엔드 매핑

| 도메인 용어 | 데스크톱 컴포넌트 | 모바일 컴포넌트 | lib/api.ts 타입 | 비고 |
|---|---|---|---|---|
| 품목 (item) | `DesktopInventoryView.tsx`, `ItemDetailSheet.tsx` | `mobile/screens/InventoryScreen*` | `Item`, `ItemUpdate` | `erp_code` 필드 포함 |
| 재고 (inventory) | `DesktopInventoryView.tsx` | `mobile/screens/InventoryScreen*` | `InventoryLocation` | |
| 입출고 (warehouse) | `DesktopWarehouseView.tsx`, `_warehouse_*/` | `mobile/io/WarehouseWizard.tsx` | `WarehouseTransaction` 계열 | |
| 내역 (history) | `DesktopHistoryView.tsx`, `_history_sections/` | `mobile/screens/HistoryScreen.tsx` | `TransactionRecord` 계열 | |
| 관리자 (admin) | `DesktopAdminView.tsx`, `_admin_sections/` | `mobile/screens/admin/AdminShell` | — | |
| 부서 (department) | `DepartmentsContext.tsx`, `legacyUi.ts` | `mobile/primitives/` | `Department` | 🟠 색상 5곳 중복 |
| 상태 (status) | `common/StatusPill.tsx` | `mobile/primitives/StatusBadge.tsx` | `Tone` | 🟠 Tone 정의 불일치 |
| 거래 타입 | `legacyUi.ts::transactionLabel` | 산재 | `TransactionType` | 11개 타입 |
| PIN 잠금 | `PinLock.tsx`, `login/ErpLoginGate.tsx` | `mobile/screens/admin/` | — | 보안 취약 |

## 코드 식별자 ↔ 한국어 불일치 핫스팟

| 코드 식별자 | 코드 의미 | UI 라벨 현황 | 개선 방향 |
|---|---|---|---|
| `warehouse_qty` | 창고 현재 수량 | 혼용 | UI: "창고 수량" 통일 |
| `pending_quantity` | 예약/미확정 수량 | 혼용 | UI: "예약 수량" 통일 |
| `process_type_code` | 공정 구분 코드 | 혼용 | UI: "공정" 통일 |
| `scrap` (라우터명) | 폐기 | 혼용 | UI: "폐기" 통일 |
| `erp_code` | 품목 코드 (4-part) | "ERP 코드" | UI: "품목 코드"로 변경 후보 (단, 함수명/컬럼명은 유지) |
| `adjustment` | 재고 조정 | 혼용 | UI: "조정" / 강제조정 PIN 필요 시 "강제조정" |

---

## 10. 다음 작업

- `MES-NAME-002~005` — 문서 vs 코드 드리프트 4건 → `docs/research/2026-05-01-doc-drift.md`
