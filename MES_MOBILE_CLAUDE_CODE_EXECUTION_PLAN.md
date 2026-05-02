# MES Mobile Claude Code Execution Plan

> **작성일:** 2026-04-30 (목, 야간)
> **대상 기간:** 2026-05-01(금) ~ 2026-05-03(일)
> **공식명:** DEXCOWIN MES (ERP 아님)
> **근거 보고서:** `C:/ERP/deep-research-report.md`
> **사용 환경:** 모바일 Claude Code 웹 (PC 부재 환경)

---

## 1. 결론 요약

### 모바일 Claude Code에서 바로 가능한 작업
- 보고서 분석 / 문서 정리 / 잔재 목록화 / 폴더 분류표 작성
- 표준 용어 사전·매핑표 작성
- UI/UX 개선 요구사항 다이어그램화
- 관리자 모드 재설계안 (계획만, 코드 수정은 보류)
- 다음 주 후속 프롬프트 작성

### 서버 확인이 필요한 작업 (월요일 회사 PC)
- 입고/출고/조정/부서이동 화면 실제 동선 검증
- 관리자 모드 PIN 흐름·실사·강제조정 실행 검증
- API 응답 필드명 ↔ 프론트 타입 정합성 검증 (실제 호출)
- Dockerfile/포트 통일 후 NAS 배포 재현 검증
- DB 마이그레이션 (`option_code` 길이) 실행 검증

### 3일 목표
- **금**: 보고서·코드를 모바일에서 다 훑고 잔재·중복·드리프트를 “목록”으로 만든다
- **토**: 공통 모듈·관리자 재설계·작업 백로그를 “설계 문서”로 만든다
- **일**: 진행 순서·월요일 체크리스트를 “실행 큐”로 동결한다

### 3일을 넘길 경우 확장 계획
- 4~7일차: 위 산출물 기반으로 모바일에서 B등급 (UI 문구/주석/문서) 변경 시도
- 2주차: 회사 PC에서 C등급 (컴포넌트 분리/공통화) 실작업
- 4주차 이후: D등급 (API/DB/PIN/배포) 영향 분석 후 단계적 작업

### 가장 먼저 할 작업 5개
1. **MES-NAME-001** — ERP 잔재 grep 매핑 (모바일, A등급)
2. **MES-TREE-001** — 프로젝트 폴더 전체 분류표 작성 (활성/보존/금지)
3. **MES-TERM-001** — 표준 용어 사전 작성 (DEXCOWIN MES 기준 25개)
4. **MES-COMP-001** — 부서 색상 5개 산재 위치 통합 설계 (계획만)
5. **MES-ADMIN-001** — 관리자 모드 10개 영역 분리안 다이어그램화

---

## 2. 작업 원칙

| # | 원칙 | 이유 |
|---|---|---|
| 1 | 코드 수정 전 PLAN 우선 | 모바일에서는 diff 검토 비용이 큼 |
| 2 | 전체 치환 금지 (ERP→MES sed) | DB `erp_code`, `formatErpCode`, 레포 `Hw-03/ERP`가 살아있음 |
| 3 | 서버 실행 금지 | uvicorn, npm run dev, start.bat 모두 금지 |
| 4 | DB 접속 금지 | bootstrap/migration 실행 금지 |
| 5 | 위험도 분류(A/B/C/D) 후 진행 | 모바일에서 D등급 진행 시 회복 불가 |
| 6 | 한 번에 하나의 작업만 | 컨텍스트 폭발 방지 |
| 7 | 작업 후 반드시 diff 요약 | 잘못된 변경 즉시 발견 |
| 8 | 테스트 불가 시 정적 검증으로 대체 | grep / 타입체크 / import 경로 |

---

## 3. 현재 프로젝트 이해 요약

### 명칭
- **공식명**: DEXCOWIN MES (`README.md`, `backend/app/main.py:62`, `CLAUDE.md`)
- **deprecated 명칭**: ERP (시스템명으로 사용 금지)
- **변경 금지 식별자** (ERP 글자가 박혀있어도 그대로 둘 것):
  - DB 컬럼 `items.erp_code`
  - 함수 `formatErpCode()` (`frontend/lib/api.ts:147`)
  - 깃허브 레포명 `Hw-03/ERP`
  - 디렉터리명 `C:/ERP/`

### 프론트엔드 구조 (실제 메인)
```
frontend/
├── app/
│   ├── page.tsx                       (legacy/page로 re-export)
│   ├── legacy/
│   │   ├── page.tsx                   (실제 메인 진입점)
│   │   └── _components/
│   │       ├── DesktopLegacyShell.tsx (데스크톱 셸)
│   │       ├── DesktopSidebar.tsx     (4탭: dashboard/warehouse/history/admin)
│   │       ├── DesktopTopbar.tsx
│   │       ├── DesktopInventoryView.tsx
│   │       ├── DesktopWarehouseView.tsx
│   │       ├── DesktopHistoryView.tsx
│   │       ├── DesktopAdminView.tsx
│   │       ├── legacyUi.ts            (색상/부서/상태 정의)
│   │       ├── DepartmentsContext.tsx
│   │       ├── mobile/                (모바일 UI 별도 트리)
│   │       │   ├── MobileShell.tsx
│   │       │   ├── screens/           (Inventory/History/Admin)
│   │       │   ├── primitives/        (StatusBadge, KpiCard 등 23개)
│   │       │   └── tokens.ts
│   │       ├── _admin_sections/       (관리자 12개)
│   │       ├── _history_sections/     (내역 6개)
│   │       ├── _inventory_sections/   (재고 6개)
│   │       ├── _warehouse_*/          (입출고 hooks/steps/sections/modals)
│   │       ├── _archive/              ⚠ 수정 금지
│   │       ├── common/                (StatusPill 등 6개)
│   │       └── _hooks/
│   ├── admin/, inventory/, history/    (라우트만 있고 메인 흐름 미사용)
│   └── layout.tsx
├── lib/
│   └── api.ts                          (48KB, 타입+fetch 래퍼)
└── components/                         (AppHeader, CategoryCard, UKAlert)
```

### 백엔드 구조
```
backend/
├── app/
│   ├── main.py                          (FastAPI title="DEXCOWIN MES")
│   ├── models.py                        (SQLAlchemy ORM)
│   ├── schemas.py                       (Pydantic)
│   ├── database.py                      (SQLite WAL + NullPool)
│   ├── routers/                         (19개 라우터)
│   ├── services/                        (12개 서비스, stock_math.py 포함)
│   ├── utils/erp_code.py                ⚠ 이름 변경 금지
│   └── _logging.py
├── bootstrap_db.py                       (raw DDL + try/except skip)
└── seed_packages.py
```

### 메인 진입 흐름
```
브라우저
  └─ Next.js / (= /legacy)
      └─ legacy/page.tsx (LegacyPage)
          ├─ DepartmentsProvider
          ├─ ErpLoginGate
          ├─ WarehouseWizardProvider + DeptWizardProvider
          └─ LegacyBody
              ├─ < lg : MobileShell (모바일 4탭)
              └─ ≥ lg : DesktopLegacyShell (데스크톱 4탭)
```

### 건드리면 위험한 파일
- `backend/app/routers/items.py` — `process_type_code` 누락 버그 영역
- `backend/bootstrap_db.py` — raw DDL, broad except, option_code VARCHAR(2)
- `backend/app/services/pin_auth.py` + `routers/settings.py` — PIN 평문/SHA-256/기본 0000
- `backend/app/routers/stock_requests.py` — 인가 경계 약함
- `frontend/lib/api.ts` — 타입 계약 변경 시 전 화면 영향
- `frontend/app/legacy/page.tsx` — 진입점 (잘못 건드리면 전 화면 다운)

### 절대 수정 금지 폴더
- `_archive/`, `_backup/` (없음, `backend/_archive`만 존재)
- `frontend/_archive/`
- `backend/_archive/`
- `backups/` (DB 백업)
- `vault/` (vault-sync 브랜치 전용, main 미포함)

---

## 4. 작업 분류 체계

### A등급 — 모바일에서 바로 가능한 저위험 작업
- 문서 정리 (별도 분석 노트 작성)
- README 명칭 정리 “초안” (실제 파일 수정 아님)
- UI 문구 후보 정리 (목록만)
- ERP 잔재 목록화 (grep 결과 정리)
- 중복 컴포넌트 목록화
- 파일 역할표 작성
- 후속 프롬프트 작성

### B등급 — 모바일에서 수정 가능하지만 diff 검토 필수
- 단순 UI 문구 변경 (한국어 라벨 1개씩)
- 주석/문서 명칭 변경 (`docs/*.md` ERP→MES 표기)
- 깨진 문자열 수정
- 공통 상수 파일 추가 (신규 파일만, 기존 미수정)
- 타입 import 정리 (1파일 1줄)

### C등급 — 코드 수정 가능하나 서버 확인 전까지 보류
- 컴포넌트 분리 (Desktop*View 같은 거대 파일)
- 관리자 모드 구조 변경
- 입출고 화면 UI 구조 변경
- API 타입 분리 (`lib/api.ts` 분할)
- 공통 상태 뱃지 추출 (`StatusPill` ↔ `StatusBadge`)
- 폴더명 변경 (`_components/` 하위)

### D등급 — 모바일 작업 금지 / 월요일 회사 PC 필수
- API path 변경 (`/api/*` 경로)
- DB 테이블/컬럼명 변경 (`items.erp_code` 등)
- migration 실행 (`bootstrap_db.py`)
- PIN 인증 구조 변경 (PIN 평문 → bcrypt/argon2)
- 권한/역할 체계 변경
- 배포 설정 변경 (Dockerfile 8000→8010, --reload 제거)
- Docker/포트 통일
- 대규모 리팩토링 (디렉터리 이동)
- 깃허브 레포명 변경

---

## 5. ERP → MES 전환 실행계획

| 작업 ID | 대상 | 작업 내용 | 위험도 | 모바일 | 서버확인 | 선행조건 | 산출물 |
|---|---|---|---|---|---|---|---|
| MES-NAME-001 | `start.bat` L14/23/27 | `[ERP]` 로깅 텍스트 `[MES]`로 변경 후보 정리 | A→B | ✓ | × | 없음 | 변경 라인 목록 |
| MES-NAME-002 | `frontend/components/AppHeader.tsx` | ERP 잔재 검색 (있으면 후보 노트) | A | ✓ | × | grep | 잔재 라인 목록 |
| MES-NAME-003 | `docs/ARCHITECTURE.md` L13 | 폴더 구조도 ERP 표기 → 디렉터리명은 보존, 시스템명만 MES로 | A→B | ✓ | × | 없음 | 변경 diff 후보 |
| MES-NAME-004 | `docs/ERD.md` `ProductModel`/`QueueBatchItem` 명칭 | 현재 코드(`ProductSymbol`/`QueueLine`)와 정합화 | A→B | ✓ | × | models.py 비교 | diff 후보 |
| MES-NAME-005 | `docs/OPERATIONS.md` `/health/detailed` 필드명 | 코드 실제 필드(`db`,`rows`,`open_queue_batches`,`last_transaction_at`)로 정정 | A→B | ✓ | × | main.py:246 비교 | diff 후보 |
| MES-NAME-006 | `DesktopLegacyShell.tsx:18` `DEFAULT_STATUS` | 현재 "DEXCOWIN MES System" — 그대로 유지 (변경 불필요 확인) | A | ✓ | × | 없음 | 확인 노트 |
| MES-NAME-007 | `formatErpCode()` (`lib/api.ts:147`) | **변경 금지** (DB 컬럼 `erp_code` 때문) | D | × | ✓ | 영향 분석 후 | 변경 금지 확정 노트 |
| MES-NAME-008 | DB 컬럼 `items.erp_code` | **변경 금지** (전 시스템 영향) | D | × | ✓ | Alembic 도입 후 | 변경 금지 확정 노트 |
| MES-NAME-009 | 깃허브 레포명 `Hw-03/ERP` | **별도 결정** (CI URL/clone 경로 영향) | D | × | ✓ | 사용자 결정 | 의사결정 노트 |
| MES-NAME-010 | `legacy` 명칭 처리 방향 | 진입점 라우팅이라 변경 시 위험. 유지 권장. | C | × | ✓ | 논의 | 의사결정 노트 |

### 5-1. 변경 가능 (A/B등급)
- UI 한국어 라벨 (사용자 노출 문구만)
- 문서 시스템명 표기 (`# DEXCOWIN MES` 통일)
- 주석 “# ERP backend” → “# MES backend”

### 5-2. 변경 금지 (D등급, 월요일 영향분석 필수)
- API path `/api/*`
- DB 테이블/컬럼명
- 함수 `formatErpCode`, `erp_code` 컬럼
- 디렉터리 `C:/ERP/`, `backend/`, `frontend/`
- 깃허브 레포 `Hw-03/ERP`

---

## 6. MES 용어 표준화 실행계획

| 기존 용어 | MES 표준 용어 | 유지/변경 | 확인 파일 | 변경 위험도 | 이유 |
|---|---|---|---|---|---|
| ERP | MES | 변경 (시스템명만) | README.md, main.py | A | 공식명 |
| erp_code | erp_code | 유지 | items 테이블, lib/api.ts | D | DB 컬럼 |
| item | 품목 (한글 라벨) | UI 한정 변경 | UI 라벨 | A | 일관성 |
| product | 제품 (완성품) | UI 한정 변경 | UI 라벨 | A | item과 구분 |
| material | 자재 (원자재) | UI 한정 변경 | UI 라벨 | A | 의미 구분 |
| inventory | 재고 | UI 한정 변경 | inventory.* | A | 한국어 |
| stock | 재고 (inventory 동의어) | UI 한정 변경 | stock_math.py | B | 코드 식별자는 유지 |
| warehouse | 창고 | UI 한정 변경 | UI 라벨 | A | |
| department | 부서 | UI 한정 변경 | departments.py | A | |
| inbound | 입고 | UI 한정 변경 | inventory/receive.py | A | |
| outbound | 출고 | UI 한정 변경 | inventory/ship.py | A | |
| adjustment | 조정 | UI 한정 변경 | UI 라벨 | A | |
| count | 실사 | UI 한정 변경 | counts.py | A | |
| audit | 감사 | UI 한정 변경 | admin_audit.py | A | |
| production | 생산 | UI 한정 변경 | production.py | A | |
| reservation | 예약 | UI 한정 변경 | stock_requests.py | A | |
| confirm | 확정 | UI 한정 변경 | UI 라벨 | A | |
| cancel | 취소 | UI 한정 변경 | UI 라벨 | A | |
| loss | 분실 | UI 한정 변경 | loss.py | A | |
| waste | 폐기 (=disposal) | UI 한정 변경 | scrap.py | A | scrap과 통합 표기 검토 |
| disposal | 폐기 | UI 한정 변경 | scrap.py | A | |
| BOM | BOM (그대로) | 유지 | bom.py | A | 표준 용어 |
| package | 출하패키지 | UI 한정 변경 | ship_packages.py | A | |
| legacy | (그대로 유지) | D | legacy 디렉터리 | D | 라우트 영향 |
| admin | 관리자 | UI 한정 변경 | UI 라벨 | A | |

### 적용 원칙
- **UI 한국어 라벨만** 위 표대로 통일
- **코드 식별자**(함수명, 변수명, 타입명, 파일명, API path)는 영문 유지
- **DB 컬럼명**은 절대 변경 금지

---

## 7. 폴더/파일트리 간소화 실행계획

| 파일/폴더 | 현재 역할 | 문제점 | 제안 작업 | 위험도 | 모바일 | 비고 |
|---|---|---|---|---|---|---|
| `frontend/app/page.tsx` | `./legacy/page` re-export | 진입점 wrapper | 유지 | D | × | 메인 진입 |
| `frontend/app/legacy/page.tsx` | 실제 메인 진입 | 분기 로직 응집 | 유지 | D | × | |
| `frontend/app/legacy/_components/` | 메인 UI 모음 | 180+ 파일 비대 | 점진 분리 (C) | C | × | 위험 |
| `frontend/app/legacy/_components/_archive/` | 구식 Tab 컴포넌트 | 미사용 | 보존 (수정 금지) | — | × | ⚠ |
| `frontend/_archive/` | 폐기 코드 | 미사용 | 보존 (수정 금지) | — | × | ⚠ |
| `backend/_archive/` | 폐기 스크립트 | 미사용 | 보존 (수정 금지) | — | × | ⚠ |
| `backups/` | DB 백업 파일 | 운영 산출물 | 보존 (수정 금지) | — | × | ⚠ |
| `vault/` | Obsidian vault | vault-sync 전용 | 보존 (main 미포함) | — | × | ⚠ |
| `outputs/` | 산출물 | git status 변경 있음 | 사용자 확인 필요 | B | ✓ | |
| `frontend/app/admin/`, `inventory/`, `history/` | 별도 라우트 | 메인 미사용 가능성 | 사용 여부 분석 (A) | A | ✓ | grep 필요 |
| `frontend/components/AppHeader.tsx` | 헤더 | 사용처 불분명 | import 추적 (A) | A | ✓ | |
| `frontend/components/CategoryCard.tsx` | 카드 | 사용처 불분명 | import 추적 (A) | A | ✓ | |
| `frontend/components/UKAlert.tsx` | 알림 | 사용처 불분명 | import 추적 (A) | A | ✓ | |
| `docs/research/` | 기술 조사 | 양호 | 유지 | — | × | |
| `docs/regression/` | 회귀 스크린샷 | 양호 | 유지 | — | × | |
| `scripts/ops/` | 운영 스크립트 | 양호 | 유지 | — | × | |

### 분류 요약
- **활성 파일**: `app/legacy/_components/Desktop*`, `mobile/MobileShell` 트리, `lib/api.ts`, `backend/app/{main,models,schemas,database}.py`, `routers/*`, `services/*`
- **wrapper 파일**: `app/page.tsx` (legacy/page re-export)
- **legacy 파일**: `app/legacy/_components/_archive/InventoryTab.tsx` 등 (보존)
- **archive 파일**: `_archive/`, `frontend/_archive/`, `backend/_archive/`
- **unused 후보**: `frontend/app/admin|inventory|history/` 별도 라우트 (분석 필요)
- **중복 후보**: 부서 색상 5개 파일, StatusPill/StatusBadge 2개 파일
- **이름 변경 후보**: 시스템명 표기만 (디렉터리/파일명 변경 X)
- **MES 전환 후보**: UI 라벨만
- **절대 건드리면 안 되는 파일**: 보존 폴더 + DB 마이그레이션 + bootstrap_db.py

---

## 8. 컴포넌트 공통화 실행계획

| 공통화 대상 | 현재 구현 후보 | 중복 위험 | 권장 공통 파일 | 바로 수정 가능 | 선행 분석 |
|---|---|---|---|---|---|
| 부서 색상 | `legacyUi.ts::employeeColor`, `DepartmentsContext.tsx::getColor`, `useAdminDepartments.ts::COLOR_PALETTE`, `historyShared.ts::PROCESS_TYPE_META`, `adminShared.ts::bomCategoryColor` | 높음(5곳) | `frontend/lib/mes-department.ts` | C (계획만) | DB color_hex 우선순위 |
| 부서 라벨 | `legacyUi.ts` switch | 중 | `frontend/lib/mes-department.ts` | C | |
| 부서 아이콘 | 산재 추정 | 중 | 위 동일 | C | grep 필요 |
| 직원 표시 | `legacyUi.ts` | 중 | `frontend/lib/mes-employee.ts` | C | |
| 카테고리 색상 | `adminShared.ts::bomCategoryColor` | 낮음 | `frontend/lib/mes-category.ts` | C | |
| 재고 상태 표시 | `common/StatusPill.tsx`, `mobile/primitives/StatusBadge.tsx` | 높음(2곳) | `frontend/lib/mes-status.ts` | C | Tone 매핑 통일 |
| 거래 타입 표시 (입고/출고/조정/생산/폐기/손실/반품/예약) | `legacyUi.ts::transactionLabel` 11개 | 낮음 | 위 동일 | A | 단일 소스 |
| 버튼 스타일 | Tailwind 클래스 산재 | 중 | `frontend/lib/mes-ui.ts` (계획만) | C | |
| 카드 스타일 | 산재 | 중 | 위 동일 | C | |
| 검색창 | 산재 | 중 | `mobile/primitives/SearchInput?` | C | |
| 필터 pill | 산재 | 중 | 신규 | C | |
| 모달 | `common/ConfirmModal` 등 | 중 | `frontend/lib/mes-modal.ts` | C | |
| 바텀시트 | mobile 추정 | 중 | mobile primitives 통합 | C | |
| Toast | 추정 산재 | 중 | 단일화 | C | grep 필요 |
| empty state | `common/EmptyState`? | 낮음 | 유지 | A | |
| loading state | 산재 | 중 | 단일화 | C | |
| error state | 산재 | 중 | 단일화 | C | |
| table row | Desktop*View 내부 | 중 | 점진 분리 | C | |
| list row | mobile screens 내부 | 중 | 점진 분리 | C | |
| 관리자 form | `_admin_sections/` | 중 | 패턴 통일 | C | |
| dropdown | 산재 | 중 | 단일화 | C | |
| 수량 입력 | warehouse steps 내부 | 중 | `mobile/primitives/QtyStepper?` | C | |
| 날짜/시간 표시 | 산재 | 중 | `frontend/lib/mes-format.ts` | A | 신규 파일 |
| 숫자 포맷 | 산재 | 중 | 위 동일 | A | |
| API 에러 처리 | `lib/api.ts` 내부 | 낮음 | 유지 | — | |
| 권한/PIN 잠금 흐름 | `ErpLoginGate`, `OperatorLoginCard` | 중 | 유지 (재설계 시 검토) | D | |

### 권장 공통 모듈 구조 (계획만, 실제 생성 X)
```
frontend/lib/
├── mes-format.ts        # 날짜/시간/숫자 포맷
├── mes-status.ts        # StatusTone 통합 (info/ok/warn/danger/muted/neutral)
├── mes-department.ts    # 부서 색상/라벨 단일 소스
├── mes-category.ts      # 카테고리 색상
└── mes-employee.ts      # 직원 표시 헬퍼
```

또는 기존 구조 확장:
```
frontend/app/legacy/_components/legacyUi.ts  # 유지 + 확장
frontend/app/legacy/_components/shared/      # 신규 (공통 hooks/types)
```

---

## 9. UI/UX 개선 실행계획

### 분석 대상 화면
1. 입출고 화면 (`DesktopWarehouseView`, `mobile/io/WarehouseWizard`)
2. 입출고 내역 화면 (`DesktopHistoryView`, `mobile/screens/HistoryScreen`)
3. 관리자 모드 (`DesktopAdminView`, `mobile/screens/admin/AdminShell`)
4. 실사/강제조정 (`counts.py` 연동 화면)
5. 알림 (`alerts.py` 연동 화면)
6. 생산/예약/확정/취소/폐기/손실/편차 화면
7. 모바일 화면 (`MobileShell` 4탭)
8. 데스크톱 화면 (`DesktopLegacyShell` 4탭)

### 평가 기준 (10항목)
- [ ] 50~60대 현장 사용자가 설명 없이 쓸 수 있는가
- [ ] 버튼 의미가 즉시 이해되는가 (한국어 단어 단순)
- [ ] 실수 방지 장치가 있는가 (확인 모달, 음수 차단)
- [ ] 위험 작업에 확인 절차가 있는가 (강제조정 PIN)
- [ ] 글씨와 터치 영역이 충분한가 (최소 44px)
- [ ] 데스크톱 화면 폭을 낭비하지 않는가
- [ ] 검색/필터 흐름이 빠른가
- [ ] 입력 후 결과 피드백이 명확한가 (Toast/배너)
- [ ] 관리자 기능이 한 화면에 뭉쳐 있지 않은가
- [ ] MES 제품 정체성이 명확한가 (DEXCOWIN MES 표기)

> 대시보드는 최소 수정 대상으로 둔다 (사용자 지시).

---

## 10. 관리자 모드 재설계 계획

### 재설계 구조안 (10개 영역)

| # | 영역 | 현재 파일 | 문제점 | 새 화면 구조 | 필요 공통 | 위험 | 서버확인 | 후속 프롬프트 |
|---|---|---|---|---|---|---|---|---|
| 1 | 관리자 홈 | `DesktopAdminView` 진입부 | 메뉴 평면 나열 | 카드 그리드(영역 9개로 진입) | KpiCard | C | × | P-ADM-01 |
| 2 | 품목/자재 마스터 | `_admin_sections/items*` 추정 | 거대 폼 | 검색→리스트→상세 분리 | 공통 form | C | ✓ | P-ADM-02 |
| 3 | 공정/옵션/제품기호 관리 | `codes.py` 연동 | 각자 산재 | 코드마스터 단일 화면 | tabs | C | ✓ | P-ADM-03 |
| 4 | 부서/직원 관리 | `useAdminDepartments` | 색상 5곳 산재 | 부서·색상·직원 한 화면 | mes-department | C | ✓ | P-ADM-04 |
| 5 | 재고 기준값/안전재고 | `min_stock`, `alerts.py` | 분리 안 됨 | 품목별 안전재고 일괄 | table | C | ✓ | P-ADM-05 |
| 6 | 실사/강제조정 | `counts.py` | PIN 연동 약함 | 실사 → 차이 → 조정 워크플로 | wizard | C | ✓ | P-ADM-06 |
| 7 | 손실/폐기/편차 기록 | `loss.py`, `scrap.py`, `variance.py` | 분리됨 | 한 메뉴에 탭 3개 | tabs | C | ✓ | P-ADM-07 |
| 8 | 시스템 설정 | `settings.py` | PIN 평문 위험 | 일반/PIN/CORS 분리 | form | D | ✓ | P-ADM-08 |
| 9 | 권한/PIN 관리 | `pin_auth.py`, `employees.py` | 보안 취약 | 직원·역할·PIN 분리 | secure form | D | ✓ | P-ADM-09 |
| 10 | 감사 로그/작업 내역 | `admin_audit.py`, `transaction_logs` | 별도 페이지 부재 | 검색/필터/CSV 내보내기 | table+filter | C | ✓ | P-ADM-10 |

### 재설계 원칙
- 한 화면에 한 책임만
- 위험 작업(권한/PIN/실사 조정)은 항상 추가 확인 단계
- 모바일에서도 사용 가능하도록 최소 1열 구성
- 데스크톱은 2~3열 활용

---

## 11. 입출고 화면 개선 계획

### 현장 사용자 동선 분석 관점
1. **가장 많이 누르는 버튼 = 입고/출고**
   - 메인에서 한 번에 닿을 것
   - 부서 선택은 직원 정보로 자동 채움 후보
2. **입고/출고/조정/부서이동 4종 명확 분리**
   - 입고 (창고로 들어옴)
   - 출고 (창고에서 나감)
   - 조정 (실사 차이 보정)
   - 부서이동 (부서간 위치 이동)
3. **수량 입력 실수 방지**
   - +/- 스텝퍼
   - 최대 수량 안내
   - 음수 입력 차단
4. **재고 부족 경고**
   - 가용재고 < 요청 수량 → 빨간 배너
   - 안전재고 미만 → 노란 경고
5. **예약재고/가용재고 표시**
   - `pending_quantity` (예약), `available` (가용)
   - 화면 상단 항상 노출
6. **최근 작업 피드백**
   - 작업 후 Toast + 최근 5건 리스트
7. **모바일 터치 UX**
   - 44px 이상 버튼
   - 키패드 자동 표시
8. **데스크톱 빠른 입력 UX**
   - Tab 키 흐름
   - Enter 확정

### 적용 파일
- 데스크톱: `DesktopWarehouseView.tsx`, `_warehouse_steps/*`, `_warehouse_sections/*`
- 모바일: `mobile/io/WarehouseWizard.tsx`, `mobile/io/DeptWizard.tsx`

---

## 12. 입출고 내역 화면 개선 계획

### 개선 관점
- **검색**: 품목명/코드/ERP코드/바코드/직원명 통합 검색
- **필터**: 거래 타입 (입고/출고/조정/생산/폐기/손실/반품/예약/취소)
- **기간 선택**: 오늘/7일/30일/사용자 지정
- **부서별 보기**: 부서 칩 선택
- **품목별 보기**: 클릭 시 그 품목 내역만
- **작업자별 보기**: 직원 선택
- **상태별 보기**: DRAFT/SUBMITTED/RESERVED/COMPLETED/CANCELLED
- **취소/정정 이력**: 원거래 ↔ 정정거래 연결 표시
- **감사 로그**: `admin_audit_logs` 별도 탭
- **엑셀/CSV 내보내기**: `services/export_helpers.py` 활용
- **50~60대 사용자 표현**: “2025년 4월 30일” 형식, 색상 라벨 + 한글

### 적용 파일
- 데스크톱: `DesktopHistoryView.tsx`, `_history_sections/*`
- 모바일: `mobile/screens/HistoryScreen.tsx`
- 백엔드: `routers/inventory/transactions.py`, `services/export_helpers.py`

---

## 13. 백엔드 안전성 점검 계획

### 분석 대상
- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/database.py`
- `backend/app/routers/*.py` (19개)
- `backend/app/services/*.py` (12개)

### 점검 항목
| # | 항목 | 위험도 | 비고 |
|---|---|---|---|
| 1 | 라우터 구조 | 양호 | prefix 분리 잘 됨 |
| 2 | 서비스 레이어 | 양호 | `stock_math.py` 단일 소스 |
| 3 | 모델/스키마 크기 | 중 | 풍부함 vs 마이그레이션 부담 |
| 4 | ERP 명칭 잔재 | 낮음 | `formatErpCode` 등은 의도적 유지 |
| 5 | MES 용어 일관성 | 중 | `inventory` vs `stock` 혼용 |
| 6 | 입출고 로직 안전성 | 중 | 트랜잭션 점검 필요 |
| 7 | 생산 예약/확정/취소 | 중 | `queue.py`, `production.py` 흐름 |
| 8 | 실사/편차/손실/폐기 | 중 | 강제조정 PIN 흐름 |
| 9 | API 응답 ↔ 프론트 타입 | 높음 | `update_item` 계약 깨짐 |
| 10 | 트랜잭션 처리 | 중 | `_tx.py` 활용도 점검 |
| 11 | 음수 수량 방지 | 높음 | 모든 입출고 검증 필요 |
| 12 | 중복 차감 방지 | 높음 | `pending_quantity` 흐름 |
| 13 | 예약재고 ↔ 가용재고 불일치 | 높음 | `stock_math.py` 단일 소스 검증 |
| 14 | 운영 데이터 손상 가능 API | 높음 | `/api/counts` 강제조정, `bootstrap_db.py` |
| 15 | 관리자 PIN 외 보호 | 높음 | 세션/JWT 도입 검토 |

### 즉시 수정 필요 (월요일 이후)
1. `update_item`에 `process_type_code` 추가 (`items.py:415-444`, `schemas.py:41-51`)
2. `option_code` 길이 통일 (`bootstrap_db.py:72` `VARCHAR(2)` → `VARCHAR(10)`)
3. 관리자 PIN 평문 → bcrypt/argon2id (`settings.py`)
4. `/api/settings/integrity/inventory` GET 쿼리스트링 PIN → 헤더/POST body
5. `OPERATIONS.md` `/health/detailed` 필드명 갱신

---

## 14. 금토일 3일 실행 로드맵

### 금요일 (2026-05-01) — 조사와 분류
**목표:** 보고서를 코드와 1:1로 대조해 “잔재·중복·드리프트 목록”을 만든다.

**할 일:**
- [ ] MES-NAME-001: ERP 잔재 grep 매핑 (모든 파일)
- [ ] MES-NAME-002~005: 문서 vs 코드 드리프트 5개 위치 확정
- [ ] MES-TREE-001: 폴더 분류표 작성
- [ ] MES-TERM-001: 표준 용어 사전 25개
- [ ] MES-COMP-001: 부서 색상 5개 산재 위치 라인 단위 매핑

**산출물:**
- `docs/research/2026-05-01-erp-residue-map.md` (새 노트)
- `docs/research/2026-05-01-folder-classification.md` (새 노트)
- 표준 용어 사전 (위 노트에 포함)

**모바일에서 가능한 작업:** 위 5개 모두 (모두 A등급)

**수정 금지:** 코드, 기존 문서, `_archive`, `vault`

**Claude Code 프롬프트:** `P-FRI-01` ~ `P-FRI-05` (17번 섹션)

**완료 기준:**
- ERP 잔재 35개 위치 확보
- 폴더 분류표에 활성/보존/금지 표시
- 부서 색상 5개 모두 라인 번호 수준 매핑

---

### 토요일 (2026-05-02) — 설계와 프롬프트화
**목표:** 공통 모듈·관리자 재설계·작업 백로그를 “설계 문서”로 만든다.

**할 일:**
- [ ] MES-COMP-001~004: 공통 모듈 4종 설계서 (실제 파일 생성 X)
- [ ] MES-ADMIN-001~002: 관리자 모드 10개 영역 다이어그램
- [ ] MES-WAREHOUSE-001~002: 입출고 화면 동선 안
- [ ] MES-HISTORY-001~002: 내역 화면 필터/검색 요구사항
- [ ] MES-UI-001~004: 화면별 평가 결과
- [ ] MES-BE-001~004: 백엔드 수정 계획 (실행은 월요일)

**산출물:**
- `docs/research/2026-05-02-common-modules-design.md`
- `docs/research/2026-05-02-admin-redesign.md`
- `docs/research/2026-05-02-warehouse-history-redesign.md`
- `docs/research/2026-05-02-backend-fix-plan.md`

**모바일에서 가능한 작업:** 모두 A등급 (설계 문서만)

**수정 금지:** 코드, 기존 문서, 보존 폴더

**Claude Code 프롬프트:** `P-SAT-01` ~ `P-SAT-06`

**완료 기준:**
- 공통 모듈 4개 설계서 완료
- 관리자 모드 10개 영역 모두 다이어그램화
- 백엔드 수정 계획에 실행 명령(D등급) 포함

---

### 일요일 (2026-05-03) — 최종 순서 확정과 월요일 체크리스트
**목표:** 진행 순서·월요일 회사 PC 체크리스트를 “실행 큐”로 동결한다.

**할 일:**
- [ ] 작업 백로그 35개 우선순위 재정렬
- [ ] 월요일 회사 PC 직접 확인 체크리스트 확정
- [ ] 다음 주 후속 프롬프트 5개 작성
- [ ] 산출물 3종 (금/토/일 노트) 한 페이지 요약
- [ ] 위험도별 분리: 모바일 가능 / 회사 PC 필요

**산출물:**
- `docs/research/2026-05-03-execution-queue.md`
- `docs/research/2026-05-03-monday-checklist.md`
- `docs/research/2026-05-03-next-week-prompts.md`

**모바일에서 가능한 작업:** 모두 A등급

**수정 금지:** 코드, 기존 문서, 보존 폴더

**Claude Code 프롬프트:** `P-SUN-01` ~ `P-SUN-04`

**완료 기준:**
- 진행 순서 표 (작업 ID, 의존성, 예상 소요)
- 월요일 체크리스트 35개
- 다음 주 프롬프트 5개

---

### 4~7일차 확장 계획 (월~목)
- **월(05-04)**: 회사 PC에서 D등급 확인 (PIN, Dockerfile, option_code, update_item)
- **화(05-05)**: B등급 시작 (UI 한국어 라벨 5건)
- **수(05-06)**: B등급 (문서 표기 정리 5건)
- **목(05-07)**: C등급 시작 (공통 모듈 1개 신규 생성)

### 2주차 확장 계획 (05-08 ~ 05-15)
- 공통 모듈 (color/status/format) 통합 적용
- 관리자 모드 1개 영역 시범 분리
- 입출고 화면 1개 동선 개선
- CI에 build/artifact 추가
- Alembic baseline 도입 검토

### 월요일 회사에서 직접 확인할 작업
(상세는 19번 섹션)

---

## 15. 작업 백로그 (35개)

| ID | 작업명 | 설명 | 위험 | 예상 | 모바일 | 서버 | 선행 | 완료 기준 |
|---|---|---|---|---|---|---|---|---|
| MES-NAME-001 | ERP 잔재 grep 매핑 | 모든 파일에서 `ERP\|Erp\|erp` 검색 후 위치 표 | A | 1h | ✓ | × | — | 35+ 위치 확보 |
| MES-NAME-002 | 시스템명 표기 통일 후보 | "DEXCOWIN MES" 표기 누락 위치 | A | 30m | ✓ | × | 001 | 후보 목록 |
| MES-NAME-003 | docs/ERD.md ↔ models.py 정합성 | `ProductSymbol`/`QueueLine` 명칭 비교 | A | 30m | ✓ | × | — | diff 후보 |
| MES-NAME-004 | docs/OPERATIONS.md 헬스 필드 정정 | `/health/detailed` 필드명 정정 | A | 30m | ✓ | × | main.py:246 비교 | diff 후보 |
| MES-NAME-005 | 깃허브 레포명 변경 의사결정 | 영향(CI/clone) 분석 노트 | A | 30m | ✓ | × | — | 결정 노트 |
| MES-TERM-001 | 표준 용어 사전 25개 | 한국어 라벨 매핑 | A | 1h | ✓ | × | — | 사전 완성 |
| MES-TERM-002 | 사전 ↔ 코드 매핑표 | 어떤 파일이 어떤 용어 쓰는지 | A | 1h | ✓ | × | 001 | 매핑표 |
| MES-TREE-001 | 폴더 전체 분류표 | 활성/wrapper/legacy/archive/금지 | A | 1.5h | ✓ | × | — | 분류표 |
| MES-TREE-002 | 보존 폴더 명시 | `_archive`/`vault`/`backups` 등 | A | 30m | ✓ | × | — | 목록 |
| MES-TREE-003 | unused 후보 분석 | `app/admin\|inventory\|history/` 사용처 | A | 1h | ✓ | × | — | 분석 노트 |
| MES-UI-001 | DesktopAdminView 다이어그램 | 현재 구조 시각화 | A | 1h | ✓ | × | — | 다이어그램 |
| MES-UI-002 | 입출고 동선 다이어그램 | 50~60대 관점 | A | 1h | ✓ | × | — | 다이어그램 |
| MES-UI-003 | 입출고 내역 요구사항 | 검색/필터/기간 | A | 1h | ✓ | × | — | 요구사항 |
| MES-UI-004 | 모바일/데스크톱 분기 점검 | lg breakpoint 영향 | A | 30m | ✓ | × | — | 노트 |
| MES-UI-005 | 평가 기준 10항 적용 | 8개 화면 모두 | A | 2h | ✓ | × | UI-001~003 | 평가표 |
| MES-ADMIN-001 | 10개 영역 분리안 | 다이어그램 + 책임 | A | 2h | ✓ | × | UI-001 | 분리안 |
| MES-ADMIN-002 | 관리자 후속 프롬프트 5개 | P-ADM-01~05 | A | 1h | ✓ | × | ADMIN-001 | 프롬프트 |
| MES-WAREHOUSE-001 | 입고/출고/조정/부서이동 분리 UX | 4종 명확화 | A | 1.5h | ✓ | × | UI-002 | UX 안 |
| MES-WAREHOUSE-002 | 예약/가용 재고 표시 | 위치 후보 | A | 30m | ✓ | × | — | 노트 |
| MES-HISTORY-001 | 검색·필터 컴포넌트 후보 | 단일 검색창 + 칩 필터 | A | 1h | ✓ | × | UI-003 | 후보 |
| MES-HISTORY-002 | CSV/Excel 내보내기 점검 | `export_helpers.py` 활용 | A | 30m | ✓ | × | — | 점검 |
| MES-COMP-001 | 부서 색상 통합 설계 | `mes-department.ts` 신규 | C | 1h | ✓계획만 | × | — | 설계서 |
| MES-COMP-002 | StatusPill/StatusBadge 통합 | Tone 매핑 통일 | C | 1h | ✓계획만 | × | — | 설계서 |
| MES-COMP-003 | 모달/바텀시트/Toast 매핑 | 산재 위치 정리 | A | 1h | ✓ | × | — | 노트 |
| MES-COMP-004 | 거래 타입 라벨/색상 단일 | `legacyUi.ts::transactionLabel` 확장 | A | 30m | ✓ | × | — | 설계 |
| MES-COMP-005 | 날짜/숫자 포맷 통합 | `mes-format.ts` 신규 (계획) | A | 30m | ✓ | × | — | 설계 |
| MES-BE-001 | update_item 버그 수정 계획 | `items.py:415-444` + 스키마 | A | 30m | ✓계획만 | ✓ | — | 수정 계획 |
| MES-BE-002 | option_code 길이 정합화 | `bootstrap_db.py:72` 2→10 | A | 30m | ✓계획만 | ✓ | — | 수정 계획 |
| MES-BE-003 | OPERATIONS.md 헬스 필드 정정 | 실제 코드 필드 반영 | A→B | 30m | ✓ | × | NAME-004 | 정정 계획 |
| MES-BE-004 | Dockerfile 8000→8010 + prod 모드 | --reload 제거 | A→D | 30m | ✓계획만 | ✓ | — | 수정 계획 |
| MES-BE-005 | PIN 평문 → bcrypt 계획 | `settings.py`, `pin_auth.py` | A→D | 1h | ✓계획만 | ✓ | — | 수정 계획 |
| MES-BE-006 | /api/settings/integrity GET PIN 제거 | POST/헤더로 이전 | A→D | 30m | ✓계획만 | ✓ | — | 수정 계획 |
| MES-QA-001 | 정적 검증 grep 명령 모음 | 18번 섹션 활용 | A | 30m | ✓ | × | — | 명령 모음 |
| MES-QA-002 | 월요일 회사 PC 체크리스트 | 19번 섹션 | A | 1h | ✓ | × | — | 체크리스트 |
| MES-QA-003 | 다음 주 후속 프롬프트 5개 | 4~7일차 + 2주차 | A | 1h | ✓ | × | — | 프롬프트 |

총 **35개**.

---

## 16. 작업 순서 (재정렬)

**정렬 기준:** 서버 무관 → 저위험 → AI 혼란 제거 → 기반 → UI변경 → 백엔드/DB

### 금요일 진행 큐
1. MES-NAME-001 (ERP 잔재 grep)
2. MES-TREE-001 (폴더 분류)
3. MES-TREE-002 (보존 폴더 명시)
4. MES-TERM-001 (용어 사전)
5. MES-TERM-002 (사전 ↔ 코드 매핑)
6. MES-NAME-002~005 (드리프트 4건)
7. MES-COMP-001 (부서 색상 5곳 매핑)

### 토요일 진행 큐
8. MES-UI-001~005 (화면 분석 + 다이어그램)
9. MES-ADMIN-001~002 (관리자 재설계)
10. MES-WAREHOUSE-001~002 (입출고 동선)
11. MES-HISTORY-001~002 (내역 화면)
12. MES-COMP-002~005 (공통 모듈 설계)
13. MES-BE-001~006 (백엔드 수정 계획)
14. MES-TREE-003 (unused 분석)

### 일요일 진행 큐
15. MES-QA-001 (정적 검증 명령)
16. MES-QA-002 (월요일 체크리스트)
17. MES-QA-003 (다음 주 프롬프트)
18. 작업 큐 동결 + 산출물 통합 요약

### 월요일 이후 (회사 PC)
19. MES-BE-001~006 실행 (D등급)
20. MES-COMP-001~002 신규 파일 생성 (C등급)
21. UI 라벨 변경 (B등급) 5~10건씩

---

## 17. Claude Code 실행 프롬프트 (16개)

### P-FRI-01 — ERP 잔재 grep 매핑

```text
너는 MES 프로젝트의 코드 감사관이다.
이번 작업은 "DEXCOWIN MES" 공식명 정착을 위해 ERP 잔재를 모든 파일에서 식별하는 것이다.

금지사항:
- 서버 실행 금지
- DB 접속 금지
- 전체 치환 금지
- 코드/문서 수정 금지
- 깃 커밋 금지

해야 할 일:
1. 프로젝트 전체에서 `ERP|Erp|erp` 패턴 grep
2. DB 컬럼 `items.erp_code`, 함수 `formatErpCode`, 디렉터리 `C:/ERP/`, 레포 `Hw-03/ERP`는 "변경 금지" 표시로 분류
3. 시스템명/문서/주석/UI 라벨에 박힌 ERP는 "변경 후보"로 분류
4. 위치를 파일:라인 형식으로 노트에 정리

산출물:
- `docs/research/2026-05-01-erp-residue-map.md` 신규 노트

완료 후 보고 형식:
- 변경 파일: (없음, 신규 노트 1개)
- 변경 요약: ERP 잔재 N개 위치 매핑
- 위험도: A
- 다음 작업: MES-TREE-001
```

### P-FRI-02 — 폴더 전체 분류표 작성

```text
너는 MES 프로젝트의 디렉터리 정리 담당자다.
이번 작업은 프로젝트 전체 폴더를 활성/wrapper/legacy/archive/금지로 분류하는 것이다.

금지사항:
- 파일 이동/삭제 금지
- 코드 수정 금지
- 서버 실행 금지

해야 할 일:
1. `C:/ERP/` 루트부터 4단계 깊이까지 트리 캡처
2. 각 폴더를 다음으로 분류: 활성 / wrapper / legacy / archive / unused 후보 / 중복 후보 / 이름 변경 후보 / MES 전환 후보 / 절대 금지
3. `_archive/`, `_backup/`, `frontend/_archive/`, `backend/_archive/`, `backups/`, `vault/`는 "절대 금지"로 명시
4. unused 후보 (예: frontend/app/admin|inventory|history/)는 사용처 grep 표시

산출물:
- `docs/research/2026-05-01-folder-classification.md`

완료 후 보고 형식:
- 변경 파일: (없음)
- 변경 요약: 폴더 N개 분류 완료
- 위험도: A
- 다음 작업: MES-TERM-001
```

### P-FRI-03 — 표준 용어 사전 25개

```text
너는 MES 프로젝트의 용어 표준화 담당자다.
이번 작업은 "DEXCOWIN MES" 기준 한국어 라벨 25개를 사전화하는 것이다.

금지사항:
- 코드 식별자(함수/변수/타입/파일명/API path) 변경 금지
- DB 컬럼명 변경 금지
- 전체 치환 금지

해야 할 일:
1. ERP/MES/item/product/material/inventory/stock/warehouse/department/inbound/outbound/adjustment/count/audit/production/reservation/confirm/cancel/loss/waste/disposal/BOM/package/legacy/admin 25개 정리
2. 각 용어에 대해: 한국어 라벨, 유지/변경, 확인 파일, 위험도, 이유
3. UI 라벨만 변경 (코드는 영문 유지)

산출물:
- `docs/research/2026-05-01-erp-residue-map.md`에 추가 섹션

완료 후 보고 형식:
- 변경 파일: (없음, 노트만 추가)
- 변경 요약: 용어 사전 25개 완성
- 위험도: A
- 다음 작업: MES-COMP-001
```

### P-FRI-04 — 부서 색상 5개 산재 매핑

```text
너는 MES 프로젝트의 디자인 시스템 정리 담당자다.
이번 작업은 부서 색상이 산재한 5곳을 라인 단위로 매핑하는 것이다.

금지사항:
- 코드 수정 금지
- 새 파일 생성 금지

해야 할 일:
1. 다음 5개 파일/패턴을 grep:
   - frontend/app/legacy/_components/legacyUi.ts (employeeColor)
   - frontend/app/legacy/_components/DepartmentsContext.tsx (getColor)
   - frontend/app/legacy/_components/_admin_sections/useAdminDepartments.ts (COLOR_PALETTE, pickAutoColor)
   - frontend/app/legacy/_components/_history_sections/historyShared.ts (PROCESS_TYPE_META)
   - frontend/app/legacy/_components/_admin_sections/adminShared.ts (bomCategoryColor)
2. 각 색상 정의 위치를 파일:라인 형식으로 정리
3. DB color_hex 우선순위 확인

산출물:
- `docs/research/2026-05-01-color-redundancy.md`

완료 후 보고 형식:
- 변경 파일: (없음, 신규 노트)
- 변경 요약: 부서 색상 N개 위치 매핑
- 위험도: A (실제 통합은 C, 회사 PC)
- 다음 작업: P-SAT-01 (공통 모듈 설계)
```

### P-FRI-05 — 문서 ↔ 코드 드리프트 4건 정리

```text
너는 MES 프로젝트의 문서 정합성 담당자다.
이번 작업은 보고서가 지적한 문서 vs 코드 드리프트 4건을 정리하는 것이다.

금지사항:
- 문서 수정 금지 (이번엔 노트만)
- 코드 수정 금지

해야 할 일:
1. docs/OPERATIONS.md `/health/detailed` 필드명 ↔ backend/app/main.py:246 비교
2. docs/ERD.md `ProductModel`/`QueueBatchItem` ↔ backend/app/models.py 비교
3. start.bat `[ERP]` 로깅 ↔ DEXCOWIN MES 표기 비교
4. docs/ARCHITECTURE.md L13 폴더 구조도 ↔ 실제 트리 비교
5. 각 항목에 변경 후보 라인 표시

산출물:
- `docs/research/2026-05-01-doc-drift.md`

완료 후 보고 형식:
- 변경 파일: (없음, 신규 노트)
- 변경 요약: 드리프트 4건 정리
- 위험도: A→B (실제 문서 수정은 회사 PC)
- 다음 작업: P-SAT-01
```

### P-SAT-01 — 공통 모듈 4종 설계서

```text
너는 MES 프로젝트의 프론트엔드 아키텍트다.
이번 작업은 공통 모듈 4종 설계서를 만드는 것이다 (실제 파일 생성은 X).

금지사항:
- 새 파일 생성 금지 (설계 문서만)
- 기존 파일 수정 금지
- import 변경 금지

해야 할 일:
1. mes-department.ts: 부서 색상/라벨/아이콘 단일 소스 (DB color_hex 우선)
2. mes-status.ts: StatusTone 통합 (info/ok/warn/danger/muted/neutral)
3. mes-format.ts: 날짜/시간/숫자 포맷 (한국어, 50~60대 가독성)
4. mes-ui.ts: 버튼/카드/입력 스타일 (Tailwind 클래스 상수)
5. 각 모듈에 export API 시그니처 + 사용 예시 + 마이그레이션 절차 (현 코드 → 새 모듈)

산출물:
- `docs/research/2026-05-02-common-modules-design.md`

완료 후 보고 형식:
- 변경 파일: (없음, 설계 문서)
- 변경 요약: 공통 모듈 4종 설계 완료
- 위험도: A (실제 적용은 C, 회사 PC)
- 다음 작업: P-SAT-02
```

### P-SAT-02 — 관리자 모드 10개 영역 재설계

```text
너는 MES 프로젝트의 관리자 모드 재설계 담당자다.
이번 작업은 관리자 모드를 10개 영역으로 분리하는 다이어그램과 책임 정의를 만드는 것이다.

금지사항:
- 코드 수정 금지
- 신규 파일 생성 금지 (설계 문서만)

해야 할 일:
1. 다음 10개 영역으로 분리:
   홈 / 품목·자재 / 공정·옵션·제품기호 / 부서·직원 / 재고 기준값 / 실사·강제조정 / 손실·폐기·편차 / 시스템 설정 / 권한·PIN / 감사 로그
2. 각 영역에 대해: 현재 파일 / 문제점 / 새 화면 구조 / 필요 공통 컴포넌트 / 위험도 / 서버 확인 필요 / 후속 프롬프트 ID
3. mermaid 다이어그램으로 메뉴 트리 시각화

산출물:
- `docs/research/2026-05-02-admin-redesign.md`

완료 후 보고 형식:
- 변경 파일: (없음)
- 변경 요약: 관리자 10개 영역 재설계 완료
- 위험도: A
- 다음 작업: P-SAT-03
```

### P-SAT-03 — 입출고 화면 동선 개선

```text
너는 MES 프로젝트의 UX 디자이너다.
이번 작업은 입출고 화면을 50~60대 현장 사용자 관점으로 동선 개선안을 만드는 것이다.

금지사항:
- 코드 수정 금지
- 디자인 파일 생성 금지 (텍스트 설계만)

해야 할 일:
1. 입고/출고/조정/부서이동 4종 동선 분리 안
2. 수량 입력 실수 방지(스텝퍼/음수 차단/최대 수량 안내)
3. 재고 부족 경고(가용 < 요청 시 빨간 배너)
4. 예약재고/가용재고 화면 상단 노출
5. 작업 후 Toast + 최근 5건 피드백
6. 모바일 44px / 데스크톱 Tab+Enter 흐름
7. 적용 파일 매핑(Desktop/Mobile)

산출물:
- `docs/research/2026-05-02-warehouse-redesign.md`

완료 후 보고 형식:
- 변경 파일: (없음)
- 변경 요약: 입출고 화면 동선 개선안 완료
- 위험도: A (적용은 C, 회사 PC)
- 다음 작업: P-SAT-04
```

### P-SAT-04 — 입출고 내역 화면 개선

```text
너는 MES 프로젝트의 UX 디자이너다.
이번 작업은 입출고 내역 화면 검색·필터·내보내기 개선안을 만드는 것이다.

금지사항:
- 코드 수정 금지
- 데이터베이스 쿼리 실행 금지

해야 할 일:
1. 통합 검색(품목명/코드/ERP코드/바코드/직원명)
2. 거래 타입 필터(9종 칩)
3. 기간 선택(오늘/7일/30일/사용자 지정)
4. 부서/품목/작업자/상태별 보기
5. 취소·정정 이력 연결 표시
6. CSV/Excel 내보내기(`services/export_helpers.py` 활용)
7. 50~60대 표현(2025년 4월 30일 형식)

산출물:
- `docs/research/2026-05-02-history-redesign.md`

완료 후 보고 형식:
- 변경 파일: (없음)
- 변경 요약: 내역 화면 개선안 완료
- 위험도: A
- 다음 작업: P-SAT-05
```

### P-SAT-05 — 백엔드 수정 계획 (실행은 월요일)

```text
너는 MES 프로젝트의 백엔드 안전성 점검 담당자다.
이번 작업은 보고서가 지적한 백엔드 결함 6건의 수정 계획을 만드는 것이다 (실행은 월요일 회사 PC).

금지사항:
- 코드 수정 금지
- DB 접속 금지
- migration 실행 금지

해야 할 일:
1. update_item에 process_type_code 추가 (items.py:415-444 + schemas.py:41-51)
2. option_code 길이 통일 (bootstrap_db.py:72 VARCHAR(2)→VARCHAR(10) + ALTER 검토)
3. 관리자 PIN 평문/기본값 문제 — bcrypt/argon2id 전환 계획 수립 (settings.py, pin_auth.py) ⚠ 실제 전환 실행은 별도 PR/단계로 분리
4. /api/settings/integrity/inventory GET 쿼리 PIN → POST body/헤더로 이전 (settings.py)
5. Dockerfile/포트/production 모드 불일치 — 8000→8010 + --reload 제거 + prod CMD
6. OPERATIONS.md /health/detailed 필드명 불일치 — 실제 코드 필드명으로 정정
7. 각 항목에 변경 라인, 영향 범위, 테스트 시나리오, 롤백 절차

산출물:
- `docs/research/2026-05-02-backend-fix-plan.md`

완료 후 보고 형식:
- 변경 파일: (없음)
- 변경 요약: 백엔드 수정 계획 6건
- 위험도: D (월요일 회사 PC 실행)
- 다음 작업: P-SAT-06
```

### P-SAT-06 — 작업 백로그 우선순위 재정렬

```text
너는 MES 프로젝트의 PM이다.
이번 작업은 35개 작업 백로그를 진행 순서로 재정렬하는 것이다.

금지사항:
- 코드 수정 금지

해야 할 일:
1. 정렬 기준: ① 서버 무관 ② 저위험 ③ AI 혼란 제거 ④ 기반 ⑤ UI변경 ⑥ 백엔드/DB
2. 각 작업의 의존성(선행 조건) 명시
3. 모바일 가능 vs 회사 PC 필요 분리
4. 예상 소요 시간 합계

산출물:
- `docs/research/2026-05-02-execution-queue-draft.md`

완료 후 보고 형식:
- 변경 파일: (없음)
- 변경 요약: 35개 백로그 재정렬
- 위험도: A
- 다음 작업: P-SUN-01
```

### P-SUN-01 — 정적 검증 명령 모음

```text
너는 MES 프로젝트의 QA 담당자다.
이번 작업은 서버 실행 없이 가능한 정적 검증 명령을 모으는 것이다.

금지사항:
- 명령 실제 실행 금지 (예시만)
- 서버 실행 금지

해야 할 일:
1. grep 검색 명령 (ERP/erp/Erp, legacy, department color, status badge)
2. 파일명 확인 명령
3. import 경로 확인 명령
4. 타입명 검색 명령
5. 중복 문자열 검색 명령
6. 문서 링크 확인 명령
7. dead code 후보 검색
8. TODO/FIXME 검색
9. eslint-disable 검색
10. any 타입 검색
11. 명령은 Windows bash + ripgrep 기준

산출물:
- `docs/research/2026-05-03-static-checks.md`

완료 후 보고 형식:
- 변경 파일: (없음)
- 변경 요약: 정적 검증 명령 N개
- 위험도: A
- 다음 작업: P-SUN-02
```

### P-SUN-02 — 월요일 회사 PC 체크리스트

```text
너는 MES 프로젝트의 회귀 검증 담당자다.
이번 작업은 월요일 회사 PC에서 직접 확인할 항목을 체크리스트화하는 것이다.

금지사항:
- 코드 수정 금지
- 서버 실행 금지

해야 할 일:
1. 화면 진입 (메인/모바일/데스크톱)
2. 입고/출고/조정/부서이동 4종 실행
3. 생산 예약/확정/취소 실행
4. 실사/강제조정 실행
5. 폐기/손실/편차 기록
6. 관리자 모드 모든 영역 진입
7. PIN/권한 흐름
8. 데이터 손상 여부 (transaction_logs/admin_audit_logs 비교)
9. 로그/내역 반영 여부
10. 각 항목에 예상 결과 + 실패 시 롤백 절차

산출물:
- `docs/research/2026-05-03-monday-checklist.md`

완료 후 보고 형식:
- 변경 파일: (없음)
- 변경 요약: 체크리스트 35+ 항목
- 위험도: A (실행은 월요일)
- 다음 작업: P-SUN-03
```

### P-SUN-03 — 다음 주 후속 프롬프트 5개

```text
너는 MES 프로젝트의 다음 주 작업 설계자다.
이번 작업은 4~7일차 + 2주차 후속 프롬프트 5개를 작성하는 것이다.

금지사항:
- 코드 수정 금지

해야 할 일:
1. 화(05-05) UI 한국어 라벨 변경 5건 (B등급) 프롬프트
2. 수(05-06) 문서 표기 정리 5건 (B등급) 프롬프트
3. 목(05-07) 공통 모듈 mes-department.ts 신규 생성 (C등급) 프롬프트
4. 2주차 시작 — 관리자 모드 1개 영역 분리 (C등급) 프롬프트
5. 2주차 끝 — Alembic baseline 도입 (D등급) 프롬프트
6. 각 프롬프트는 17번 섹션 형식 통일
7. P-MON-01 (백엔드 6건 실제 수정) 최종 정리하여 이 산출물에 포함 — 월요일 첫 실행 정본으로 명시

산출물:
- `docs/research/2026-05-03-next-week-prompts.md`

완료 후 보고 형식:
- 변경 파일: (없음)
- 변경 요약: 후속 프롬프트 5개
- 위험도: A
- 다음 작업: P-SUN-04
```

### P-SUN-04 — 산출물 통합 요약

```text
너는 MES 프로젝트의 주간 보고 담당자다.
이번 작업은 금/토/일 산출물(N개 노트)을 한 페이지로 통합 요약하는 것이다.

금지사항:
- 기존 노트 수정 금지
- 코드 수정 금지

해야 할 일:
1. 금: erp-residue-map / folder-classification / color-redundancy / doc-drift
2. 토: common-modules-design / admin-redesign / warehouse-redesign / history-redesign / backend-fix-plan / execution-queue-draft
3. 일: static-checks / monday-checklist / next-week-prompts
4. 한 페이지 요약: 산출물 목록 / 핵심 결정 / 다음 1 작업

산출물:
- `docs/research/2026-05-03-weekend-summary.md`

완료 후 보고 형식:
- 변경 파일: (없음)
- 변경 요약: 통합 요약 1페이지
- 위험도: A
- 다음 작업: 월요일 회사 PC에서 P-MON-01 (백엔드 수정 6건)
```

### P-ADM-01 — (보너스) 관리자 홈 카드 그리드 설계

```text
너는 MES 프로젝트의 관리자 홈 디자이너다.
이번 작업은 관리자 홈을 9개 카드 그리드로 설계하는 것이다.

금지사항:
- 코드 수정 금지

해야 할 일:
1. 9개 카드: 품목/자재 · 공정·옵션·제품기호 · 부서·직원 · 재고 기준값 · 실사·강제조정 · 손실·폐기·편차 · 시스템 설정 · 권한·PIN · 감사 로그
2. 각 카드: 아이콘 / 제목 / 짧은 설명 / 진입 경로
3. 모바일 1열, 태블릿 2열, 데스크톱 3열
4. 카드 색상은 mes-department.ts 부서 색상과 분리

산출물:
- `docs/research/2026-05-02-admin-home-grid.md`

완료 후 보고 형식:
- 변경 파일: (없음)
- 변경 요약: 9개 카드 설계
- 위험도: A
- 다음 작업: 다음 카드 설계
```

### P-MON-01 — 월요일 회사 PC 첫 실제 수정 프롬프트 (정본) — 백엔드 6건 수정 실행

```text
너는 MES 프로젝트의 백엔드 수리공이다.
이번 작업은 P-SAT-05 계획에 따라 백엔드 결함 6건을 회사 PC에서 실행하는 것이다.

전제: 회사 PC, 서버 정지 상태, DB 백업 완료(scripts/ops/backup_db.bat).

금지사항:
- 백업 없이 진행 금지
- 깃 커밋 금지 (확인 후 사용자가 직접)

해야 할 일:
1. update_item에 process_type_code 추가 (items.py + schemas.py)
2. option_code 길이 통일 (bootstrap_db.py + 필요시 마이그레이션)
3. /api/settings/integrity/inventory PIN 위치 변경
4. Dockerfile 포트/모드 정정
5. OPERATIONS.md 헬스 필드 정정
6. PIN bcrypt 전환은 별도 PR로 분리

산출물:
- 코드 수정 6건
- 마이그레이션 노트
- 회귀 테스트 결과

완료 후 보고 형식:
- 변경 파일:
- 변경 요약:
- 위험도: D (실행)
- 다음 작업: PIN bcrypt 전환 PR
```

총 **16개** 프롬프트.

---

## 18. 정적 검증 체크리스트 (명령 예시)

### grep 검색 (실행은 별도, 여기는 예시만)
```bash
# ERP 잔재 (변경 금지 식별자 제외)
rg -n "ERP|Erp|erp" --glob "!_archive" --glob "!frontend/_archive" \
   --glob "!backend/_archive" --glob "!vault" --glob "!backups"

# 변경 금지 식별자 확인 (이게 나오면 절대 건드리지 말 것)
rg -n "erp_code|formatErpCode|Hw-03/ERP"

# legacy 디렉터리 사용처
rg -n "from.*legacy|require.*legacy|import.*legacy" frontend/

# 부서 색상 산재
rg -n "employeeColor|getColor|COLOR_PALETTE|pickAutoColor|PROCESS_TYPE_META|bomCategoryColor"

# 상태 뱃지 산재
rg -n "StatusPill|StatusBadge"

# 거래 타입 라벨
rg -n "transactionLabel"

# TODO/FIXME
rg -n "TODO|FIXME|XXX"

# eslint-disable
rg -n "eslint-disable"

# any 타입
rg -n ":\s*any\b" -g "*.ts" -g "*.tsx"

# DEXCOWIN MES 표기 누락 (시스템명만)
rg -n "DEXCOWIN MES" --type md
```

### 파일명 확인
```bash
# 메인 진입점 확인
ls frontend/app/page.tsx frontend/app/legacy/page.tsx
# 핵심 컴포넌트 존재 확인
ls frontend/app/legacy/_components/Desktop*.tsx
ls frontend/app/legacy/_components/legacyUi.ts
```

### import 경로 확인
```bash
# legacyUi.ts import 사용처
rg -n "from.*legacyUi|require.*legacyUi"

# api.ts import 사용처
rg -n "from.*lib/api|require.*lib/api"
```

### 타입명 검색
```bash
# 핵심 타입 사용처
rg -n "ItemUpdate|InventoryLocation|StockRequest|ProcessType|OptionCode|ProductSymbol"
```

### 중복 문자열 검색
```bash
# DEFAULT_STATUS 매칭 두 곳
rg -n '"DEXCOWIN MES System"'
```

### 문서 링크 확인
```bash
# docs/ 내부 링크
rg -n "\]\([^)]+\)" docs/*.md
```

### dead code 후보
```bash
# _archive 외부에서 _archive를 import하는지
rg -n "_archive" --glob "!_archive" --glob "!frontend/_archive" --glob "!backend/_archive"
```

> **모두 명령 예시.** 실행은 작업 시점에 사용자 확인 후.

---

## 19. 월요일 회사에서 직접 확인 체크리스트 (35항목)

### 화면 진입
- [ ] 메인 진입(`http://localhost:3000/`) → `/legacy`로 이동 확인
- [ ] 모바일 폭(< lg) → MobileShell 표시
- [ ] 데스크톱 폭(≥ lg) → DesktopLegacyShell 표시
- [ ] DepartmentsProvider 부서 데이터 로드
- [ ] ErpLoginGate 로그인 흐름

### 입고
- [ ] 데스크톱 `Warehouse` 탭 → 입고 위저드 4단계 진행
- [ ] 수량 입력 후 `pending_quantity` 증가 확인
- [ ] 확정 후 `warehouse_qty` 증가 확인

### 출고
- [ ] 출고 위저드 4단계
- [ ] 가용재고 < 요청 수량 시 경고 노출
- [ ] 확정 후 `warehouse_qty` 감소

### 조정
- [ ] 강제조정 시 PIN 요구 확인
- [ ] `admin_audit_logs` 기록 확인

### 부서 이동
- [ ] 부서간 위치 이동
- [ ] `inventory_locations` 부서·상태 단위 이동 확인

### 생산 예약/확정/취소
- [ ] `queue.py` 워크플로 OPEN→CONFIRMED→CANCELLED
- [ ] BOM backflush 자식 자재 차감 확인

### 실사/강제조정
- [ ] `counts.py` 실사 등록
- [ ] 차이 발생 시 강제조정 흐름

### 폐기/손실
- [ ] `scrap.py` 폐기 기록
- [ ] `loss.py` 분실 기록
- [ ] `variance.py` 차이 분석

### 관리자 모드
- [ ] 관리자 홈 진입(PIN 0000 변경 후 진입 확인)
- [ ] 품목 마스터 CRUD
- [ ] 공정/옵션/제품기호 CRUD
- [ ] 부서/직원 CRUD + 색상 표시
- [ ] 재고 기준값 변경
- [ ] 시스템 설정 (PIN 변경)
- [ ] 감사 로그 조회

### PIN/권한
- [ ] 관리자 PIN 검증 (`/api/settings/verify-pin`)
- [ ] 직원 PIN 검증
- [ ] 비활성 직원 차단 확인 (현재 차단 안 되는 버그)

### 모바일 화면
- [ ] MobileShell 4탭 (inventory/warehouse/dept/admin)
- [ ] 44px 터치 영역
- [ ] 키패드 자동 표시

### 데스크톱 화면
- [ ] DesktopLegacyShell 4탭 (dashboard/warehouse/history/admin)
- [ ] Tab+Enter 흐름
- [ ] 화면 폭 활용

### 데이터 손상 여부
- [ ] transaction_logs 모든 작업 기록 확인
- [ ] admin_audit_logs 관리자 액션 기록
- [ ] inventory.warehouse_qty ↔ stock_math.py 계산 일치
- [ ] inventory.pending_quantity 잔존 미완 작업 확인

### 로그/내역 반영
- [ ] DesktopHistoryView 거래 표시
- [ ] 거래 타입별 필터
- [ ] 부서별 필터

### 백엔드 수정 검증 (P-MON-01 실행 후)
- [ ] update_item에 process_type_code 전송 → 200 OK + 필드 반영
- [ ] option_code 10자 입력 → 정상 저장
- [ ] /api/settings/integrity GET → 405 (POST로만 받음)
- [ ] Dockerfile 8010 + prod 모드 → docker compose 정상 기동

총 **35+ 항목**.

---

## 20. 최종 요약 JSON

```json
{
  "official_name": "DEXCOWIN MES",
  "deprecated_names": ["ERP (시스템명으로)"],
  "preserved_identifiers": {
    "db_columns": ["items.erp_code"],
    "functions": ["formatErpCode"],
    "directories": ["C:/ERP/", "frontend/", "backend/"],
    "github_repo": "Hw-03/ERP"
  },
  "source_report": "C:/ERP/deep-research-report.md",
  "weekend_goal": "ERP 잔재·중복·드리프트 매핑 → 공통 모듈·관리자 재설계 → 작업 큐·월요일 체크리스트",
  "work_mode": "mobile-claude-code-web",
  "forbidden_actions": [
    "코드 수정",
    "기존 문서 수정",
    "파일 이동/삭제",
    "서버 실행 (uvicorn/npm run dev/start.bat)",
    "DB 접속",
    "bootstrap/migration 실행",
    "테스트 실행",
    "전체 치환 (ERP→MES sed)",
    "git commit/push",
    "API path 변경",
    "DB 컬럼명 변경",
    "PIN 인증 구조 변경"
  ],
  "allowed_actions": [
    "파일 읽기",
    "폴더트리 확인",
    "정적 코드 분석",
    "보고서 분석",
    "신규 분석 노트 작성 (docs/research/*)",
    "신규 산출물 파일 1개 생성 (이 PLAN 파일)"
  ],
  "high_priority_tasks": [
    "MES-NAME-001 (ERP 잔재 매핑)",
    "MES-TREE-001 (폴더 분류)",
    "MES-TERM-001 (용어 사전)",
    "MES-COMP-001 (부서 색상 매핑)",
    "MES-ADMIN-001 (관리자 재설계)"
  ],
  "low_risk_tasks": "A등급 모두 (15개 이상)",
  "high_risk_tasks": [
    "MES-BE-001 update_item 수정 (D)",
    "MES-BE-002 option_code 길이 (D)",
    "MES-BE-004 Dockerfile 포트/모드 (D)",
    "MES-BE-005 PIN bcrypt (D)",
    "MES-BE-006 GET PIN 제거 (D)",
    "공통 모듈 신규 파일 생성 (C)",
    "관리자 모드 코드 분리 (C)"
  ],
  "mobile_possible_tasks": [
    "ERP 잔재 매핑",
    "폴더 분류",
    "용어 사전",
    "부서 색상 매핑",
    "공통 모듈 설계 (계획만)",
    "관리자 재설계 (계획만)",
    "입출고/내역 개선안",
    "백엔드 수정 계획",
    "정적 검증 명령 모음",
    "월요일 체크리스트",
    "다음 주 프롬프트"
  ],
  "monday_required_checks": [
    "화면 진입 모바일/데스크톱",
    "입고/출고/조정/부서이동",
    "생산 예약/확정/취소",
    "실사/강제조정",
    "폐기/손실/편차",
    "관리자 모드 10영역",
    "PIN/권한",
    "데이터 손상 점검",
    "로그/내역 반영",
    "P-MON-01 백엔드 수정 6건 실행"
  ],
  "backlog_count": 35,
  "prompt_count": 16,
  "next_prompt_recommendation": "P-FRI-01 (ERP 잔재 grep 매핑)"
}
```

---

## 부록: 사용자가 자주 하는 실수 가드레일

1. **"ERP→MES 한 번에 바꿔줘"** → 절대 금지. erp_code/formatErpCode/Hw-03/ERP가 죽음. 시스템명만 변경.
2. **"_archive 좀 정리해줘"** → 절대 금지. CLAUDE.md "Do Not Edit"에 명시.
3. **"vault도 main에 합쳐줘"** → 절대 금지. vault-sync 브랜치 전용.
4. **"서버 띄워서 확인해줘"** → 모바일 환경 금지. 회사 PC에서.
5. **"DB 한 번 손볼게"** → bootstrap_db.py raw DDL 위험. 백업 후 회사 PC.
6. **"전체 검색-치환 가능해?"** → 위험. 영향 분석 후 1파일씩.
7. **"Docker 포트 8000으로 통일하자"** → 반대 방향. start.bat이 8010이 표준이므로 8000을 8010으로 통일.
8. **"PIN 0000으로 자동 로그인 해줘"** → 보안 취약점 그대로 유지하는 거라 거절. 변경 계획만 세우고 회사 PC에서 진행.

---

**문서 끝.**
