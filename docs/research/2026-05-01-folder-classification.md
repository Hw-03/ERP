# 폴더 전체 분류표 — 2026-05-01

> **작업 ID:** MES-TREE-001 / MES-TREE-002  
> **작성일:** 2026-05-01 (금)  
> **기준 브랜치:** `feat/hardening-roadmap`  
> (초기 분석은 `claude/analyze-dexcowin-mes-tGZNI` 에서 시작했으나 fast-forward 머지 후 통일. 이 브랜치는 폐기됨.)  
> **수정 여부:** 없음 (읽기 전용 분석)  
> **탐색 깊이:** 루트 기준 4단계

---

## 분류 기준

| 기호 | 분류 | 설명 |
|---|---|---|
| 🟢 활성 | 현재 사용 중인 주요 경로 | 건드리면 화면/서버 영향 |
| 🔵 wrapper | re-export 또는 redirect 전용 | 실제 구현 없음 |
| 🟡 legacy | 의도적으로 보존된 구식 코드 | 참조 목적 |
| 🔴 절대금지 | CLAUDE.md "Do Not Edit" 명시 | 수정 절대 불가 |
| ⚫ unused 후보 | 활성 코드에서 사용처 미확인 | 제거 전 grep 필수 |
| 🟠 중복 후보 | 같은 기능이 2곳 이상 구현됨 | 통합 설계 필요 |
| 🔷 MES 전환 후보 | 시스템명 ERP 잔재 있음 | UI 라벨만 변경 대상 |
| 📦 보존 | 운영 데이터/산출물/히스토리 | 삭제 금지 |

---

## 루트 직속

| 경로 | 분류 | 설명 |
|---|---|---|
| `_archive/` | 🔴 절대금지 | CLAUDE.md 명시. `reference/files/` 포함 |
| `backend/` | 🟢 활성 | FastAPI 서버 |
| `frontend/` | 🟢 활성 | Next.js 앱 |
| `data/` | 📦 보존 | CSV 소스 (`ERP_Master_DB.csv` 등) |
| `docker/` | 🟢 활성 | `docker-compose.yml`, `docker-compose.nas.yml` |
| `docs/` | 🟢 활성 | 운영 문서 |
| `scripts/` | 🟢 활성 | 운영/마이그레이션/개발 스크립트 |
| `outputs/` | 📦 보존 | 산출물 (`bom_planner/`, `inventory_cleanup/`) |
| `.dev/` | 📦 보존 | 개발 보조 도구 |
| `CLAUDE.md` | 🟢 활성 | 세션 규칙 |
| `README.md` | 🟢 활성 | 프로젝트 진입점 |
| `start.bat` | 🟢 활성 | 로컬 실행 스크립트 |
| `MES_MOBILE_CLAUDE_CODE_EXECUTION_PLAN.md` | 📦 보존 | 이번 주말 실행 플랜 |
| `deep-research-report.md` | 📦 보존 | 분석 보고서 |

---

## frontend/

| 경로 | 분류 | 설명 |
|---|---|---|
| `frontend/_archive/` | 🔴 절대금지 | CLAUDE.md 명시 |
| `frontend/_archive/legacy-unused/` | 🔴 절대금지 | 폐기 코드 |
| `frontend/_archive/standalone-app-routes/` | 🔴 절대금지 | admin/bom/history/inventory/operations 구버전 |
| `frontend/app/` | 🟢 활성 | Next.js App Router 진입점 |
| `frontend/app/page.tsx` | 🔵 wrapper | `./legacy/page` re-export |
| `frontend/app/layout.tsx` | 🟢 활성 | 루트 레이아웃 |
| `frontend/app/error.tsx` | 🟢 활성 | 에러 페이지 |
| `frontend/app/global-error.tsx` | 🟢 활성 | 글로벌 에러 |
| `frontend/app/legacy/` | 🟢 활성 | 실제 메인 UI 트리 |
| `frontend/app/legacy/page.tsx` | 🟢 활성 | ⚠ 진입점 — 절대 주의 |
| `frontend/app/legacy/_components/` | 🟢 활성 | Desktop*/Mobile*/legacyUi.ts 등 180+ 파일 |
| `frontend/app/admin/page.tsx` | 🔵 wrapper | `redirect("/")` — 실구현 없음 |
| `frontend/app/inventory/page.tsx` | 🔵 wrapper | `redirect("/")` — 실구현 없음 |
| `frontend/app/history/page.tsx` | 🔵 wrapper | `redirect("/")` — 실구현 없음 |
| `frontend/app/alerts/page.tsx` | ⚫ unused 후보 | 내용 미확인 — grep 필요 |
| `frontend/app/bom/page.tsx` | ⚫ unused 후보 | 내용 미확인 — grep 필요 |
| `frontend/app/counts/page.tsx` | ⚫ unused 후보 | 내용 미확인 — grep 필요 |
| `frontend/app/operations/page.tsx` | ⚫ unused 후보 | 내용 미확인 — grep 필요 |
| `frontend/app/queue/page.tsx` | ⚫ unused 후보 | 내용 미확인 — grep 필요 |
| `frontend/components/` | ⚫ unused 후보 | AppHeader/CategoryCard/UKAlert — `_archive/standalone-app-routes/`에서만 import 확인됨. 활성 코드 사용처 없음 |
| `frontend/lib/` | 🟢 활성 | `api.ts` (48KB 타입+fetch) |
| `frontend/public/` | 📦 보존 | 이미지 에셋 |
| `frontend/scripts/` | 📦 보존 | 프론트엔드 빌드 보조 |

---

## frontend/app/legacy/_components/ 세부

| 경로 | 분류 | 설명 |
|---|---|---|
| `Desktop*.tsx` (7개) | 🟢 활성 | 데스크톱 메인 UI |
| `legacyUi.ts` | 🟢 활성 | 색상/부서/상태 정의 — 🟠 중복 후보 (부서 색상 5곳 산재) |
| `DepartmentsContext.tsx` | 🟢 활성 | 부서 데이터 컨텍스트 — 🟠 중복 후보 |
| `Toast.tsx` | 🟢 활성 | 토스트 알림 |
| `PinLock.tsx` | 🟢 활성 | PIN 잠금 — ⚠ 보안 취약 (평문/0000) |
| `FilterPills.tsx` | 🟢 활성 | 필터 칩 |
| `AlertsBanner.tsx` | 🟢 활성 | 알림 배너 |
| `BarcodeScannerModal.tsx` | 🟢 활성 | 바코드 스캐너 모달 |
| `BottomSheet.tsx` | 🟢 활성 | 바텀시트 |
| `ItemDetailSheet.tsx` | 🟢 활성 | 품목 상세 |
| `SelectedItemsPanel.tsx` | 🟢 활성 | 선택 품목 패널 |
| `ThemeToggle.tsx` | 🟢 활성 | 다크모드 토글 |
| `_archive/` | 🔴 절대금지 | CLAUDE.md 명시 (구식 Tab 컴포넌트 등) |
| `_admin_sections/` | 🟢 활성 | 관리자 12개 섹션 |
| `_admin_hooks/` | 🟢 활성 | 관리자 훅 |
| `_history_sections/` | 🟢 활성 | 내역 6개 섹션 |
| `_inventory_sections/` | 🟢 활성 | 재고 6개 섹션 |
| `_warehouse_steps/` | 🟢 활성 | 입출고 위저드 단계 |
| `_warehouse_sections/` | 🟢 활성 | 입출고 섹션 |
| `_warehouse_hooks/` | 🟢 활성 | 입출고 훅 |
| `_warehouse_modals/` | 🟢 활성 | 입출고 모달 |
| `_warehouse_helpers/` | 🟢 활성 | 입출고 헬퍼 |
| `_hooks/` | 🟢 활성 | 공통 훅 |
| `common/` | 🟢 활성 | StatusPill 등 6개 — 🟠 중복 후보 (StatusBadge와 중복) |
| `login/` | 🟢 활성 | ErpLoginGate, LoginIntro, useCurrentOperator |
| `mobile/` | 🟢 활성 | MobileShell 트리 |
| `mobile/screens/` | 🟢 활성 | Inventory/History/Admin 화면 |
| `mobile/primitives/` | 🟢 활성 | StatusBadge 등 23개 — 🟠 중복 후보 |
| `mobile/io/` | 🟢 활성 | WarehouseWizard, DeptWizard |

---

## backend/

| 경로 | 분류 | 설명 |
|---|---|---|
| `backend/_archive/` | 🔴 절대금지 | CLAUDE.md 명시 |
| `backend/app/main.py` | 🟢 활성 | FastAPI 진입점 — ⚠ 절대 주의 |
| `backend/app/models.py` | 🟢 활성 | SQLAlchemy ORM |
| `backend/app/schemas.py` | 🟢 활성 | Pydantic 스키마 |
| `backend/app/database.py` | 🟢 활성 | SQLite WAL + NullPool |
| `backend/app/_logging.py` | 🟢 활성 | 로거 (`erp` → 🔷 MES 전환 후보 B등급) |
| `backend/app/routers/` | 🟢 활성 | 19개 라우터 |
| `backend/app/routers/inventory/` | 🟢 활성 | 9개 인벤토리 서브 라우터 |
| `backend/app/services/` | 🟢 활성 | 13개 서비스 (`stock_math.py` 핵심) |
| `backend/app/utils/erp_code.py` | 🟢 활성 | ⚠ 파일명 변경 금지 (CLAUDE.md) |
| `backend/tests/` | 🟢 활성 | pytest |
| `backend/bootstrap_db.py` | 🟢 활성 | ⚠ raw DDL — 함부로 실행 금지 |
| `backend/seed.py` | 🟢 활성 | 시드 데이터 |
| `backend/sync_excel_stock.py` | 🟢 활성 | 엑셀 동기화 |

---

## scripts/

| 경로 | 분류 | 설명 |
|---|---|---|
| `scripts/ops/` | 🟢 활성 | backup/restore/healthcheck 배치 — 🔷 MES 전환 후보 (주석) |
| `scripts/migrations/` | 📦 보존 | 과거 마이그레이션 스크립트 (재실행 금지) |
| `scripts/dev/` | 🟢 활성 | generate_devlog.py 등 개발 도구 |
| `scripts/restore_and_update_erp_code.py` | 📦 보존 | 일회성 복구 스크립트 |

---

## docs/

| 경로 | 분류 | 설명 |
|---|---|---|
| `docs/AI_HANDOVER.md` | 🟢 활성 | 세션 인수인계 |
| `docs/ARCHITECTURE.md` | 🟢 활성 | 아키텍처 — 🔷 MES 전환 후보 (A-10) |
| `docs/CODEX_PROGRESS.md` | 📦 보존 | 개발 이력 |
| `docs/ERD.md` | 🟢 활성 | ERD — 코드와 드리프트 확인 필요 |
| `docs/OPERATIONS.md` | 🟢 활성 | 운영 가이드 — 🔷 `/health/detailed` 필드 드리프트 |
| `docs/ONBOARDING.md` | 🟢 활성 | 온보딩 |
| `docs/USER_GUIDE.md` | 🟢 활성 | 사용자 가이드 |
| `docs/GLOSSARY.md` | 🟢 활성 | 용어 사전 (기존) |
| `docs/ITEM_CODE_RULES.md` | 🟢 활성 | 품목 코드 규칙 |
| `docs/BACKEND_REFACTOR_PLAN.md` | 📦 보존 | 리팩터 계획서 |
| `docs/FRONTEND_HOOKS_PLAN.md` | 📦 보존 | 훅 계획서 |
| `docs/API_CHANGELOG.md` | 🟢 활성 | API 변경 이력 |
| `docs/MOBILE_SCAN_TESTING.md` | 📦 보존 | 테스트 가이드 |
| `docs/design/` | 📦 보존 | 로그인 디자인 시스템 에셋 |
| `docs/regression*/` | 📦 보존 | 회귀 테스트 스크린샷 |
| `docs/research/` | 🟢 활성 | 분석 노트 (이번 주말 산출물 위치) |
| `docs/주간보고.md` | 🟢 활성 | 주간 보고 |

---

## 보존 폴더 명시 (MES-TREE-002)

> 아래 폴더는 **절대 수정/삭제/이동 금지**.

| 폴더 | 이유 |
|---|---|
| `_archive/` | CLAUDE.md "Do Not Edit" |
| `frontend/_archive/` | CLAUDE.md "Do Not Edit" |
| `backend/_archive/` | CLAUDE.md "Do Not Edit" |
| `frontend/app/legacy/_components/_archive/` | CLAUDE.md "Do Not Edit" |
| `backups/` (있으면) | DB 백업 — 운영 데이터 |
| `vault/` | `vault-sync` 브랜치 전용 — `main` 미포함 |
| `docs/regression*/` | 회귀 테스트 근거 |
| `scripts/migrations/` | 과거 마이그레이션 — 재실행 금지이지만 기록 보존 |

---

## unused 후보 요약 (grep 확인 필요)

| 경로 | 근거 | 우선도 |
|---|---|---|
| `frontend/app/alerts/page.tsx` | admin/inventory/history와 달리 redirect 여부 미확인 | 중 |
| `frontend/app/bom/page.tsx` | 위 동일 | 중 |
| `frontend/app/counts/page.tsx` | 위 동일 | 중 |
| `frontend/app/operations/page.tsx` | 위 동일 | 중 |
| `frontend/app/queue/page.tsx` | 위 동일 | 중 |
| `frontend/components/AppHeader.tsx` | `_archive/standalone-app-routes/`에서만 import 확인 | 높음 |
| `frontend/components/CategoryCard.tsx` | 위 동일 | 높음 |
| `frontend/components/UKAlert.tsx` | 위 동일 | 높음 |

→ 상세 분석: `MES-TREE-003`

---

## 중복 후보 요약

| 기능 | 위치 A | 위치 B | 추가 |
|---|---|---|---|
| 부서 색상 | `legacyUi.ts::employeeColor` | `DepartmentsContext.tsx::getColor` | 3곳 더 (총 5곳) |
| 상태 뱃지 | `common/StatusPill.tsx` | `mobile/primitives/StatusBadge.tsx` | Tone 정의 불일치 |
| 토스트 | `Toast.tsx` | 산재 추정 | grep 필요 |
| 모달 | `common/ConfirmModal?` | `_warehouse_modals/` | grep 필요 |

→ 상세 통합 설계: `MES-COMP-001~002`

---

## 다음 작업

- `MES-TERM-001` — 표준 용어 사전 25개 → `docs/research/2026-05-01-erp-residue-map.md` 추가 섹션
