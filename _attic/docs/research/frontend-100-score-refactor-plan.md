# 프론트엔드 100점 리팩토링 진단 리포트 — 2026-05-04

> **작성:** 2026-05-04 (월)
> **브랜치:** `feat/hardening-roadmap`
> **목적:** 1단계 진단. 실제 리팩토링은 본 리포트의 "안전 순서" 섹션을 따라 단계별 진행.

---

## 1. 현재 점수 (작업 전 기준)

| 카테고리 | 점수 (100 만점) | 비고 |
|---|---|---|
| Feature boundary 명확성 | **45** | `legacy/_components/` 단일 트리, feature 경계 약함 |
| API layer 분리도 | **55** | api-core 분리됨. 도메인 / 타입 / API 객체 한 파일 (1431줄) |
| Type layer 분리도 | **35** | api.ts 안에 200+ 타입 혼재 |
| 디자인 시스템 일관성 | **70** | mes-format/department/status 도입. wrapper 일부, 중복 잔존 |
| 거대 컴포넌트 축소 | **40** | DesktopWarehouseView 837 / Admin 631 / 모바일 HistoryScreen 577 |
| custom hook 분리 | **60** | exhaustive-deps disable 18곳, 데이터 hook 일부만 |
| 중복 제거 | **65** | format=wrapper, color=차이 발견(W2 보류), tx=드리프트 |
| import 경로 안정성 | **75** | `@/lib/api` 광범위 사용. api 분리시 호환 wrapper 필요 |
| 테스트 가능성 | **65** | mes-* 단위 테스트 존재. api-core / 통합 미작성 |
| CI build 안정성 | **80** | lint+tsc+vitest+build 4단계 통과 가능 |
| AI 인계 용이성 | **70** | 다수 보고서 (drift, deprecation, roadmap) 존재 |
| **합산** | **610 / 1100 ≈ 55점** | |

---

## 2. 100점 기준 점수표

| 카테고리 | 100점 기준 |
|---|---|
| Feature boundary | `frontend/features/<도메인>/` 명확. 이동 90% 완료 |
| API layer | `lib/api/<도메인>.ts` 분리 + barrel re-export. api.ts 200줄 이하 |
| Type layer | `lib/api/types.ts` 단일 — 도메인별 타입 흩어짐 0 |
| 디자인 시스템 | `lib/mes/` 단일 디렉터리. legacyUi 의 헬퍼 100% wrapper |
| 거대 컴포넌트 | 250줄 초과 0. 1개 파일 1책임 |
| custom hook | exhaustive-deps disable 5건 이하. 모두 사유 주석 |
| 중복 제거 | TX-DRIFT 통일. employeeColor 단일 소스. 모바일/데스크톱 동일 tone |
| import 경로 | barrel 안정. `@/lib/api` `@/lib/mes` 를 통한 import 90% |
| 테스트 | api-core/error parser/url builder/format/dept/status 모두 커버 |
| CI build | build 평균 60초 이내, 캐시 적용 |
| AI 인계 | 모든 디렉터리 README 또는 진단 보고서 존재 |

---

## 3. 현재 구조 문제 TOP 20

| # | 문제 | 영향 | 위험 |
|---|---|---|---|
| 1 | `lib/api.ts` 1431줄 단일 파일 (212 export/메소드) | 유지보수, 타입 추적, 바뀔 위험 | C |
| 2 | api.ts 안 타입 정의 200+ 줄 — 도메인별 타입 미분리 | type safety | B |
| 3 | `DesktopWarehouseView.tsx` 837줄 / useState 다수 | 거대 컴포넌트 | C |
| 4 | `DesktopAdminView.tsx` 631줄 (DeptManagementPanel 분리 후에도) | 동일 | B |
| 5 | `AdminBomSection.tsx` 631줄 | 동일 | C |
| 6 | `mobile/screens/HistoryScreen.tsx` 577줄 | 동일 | C |
| 7 | `WarehouseWizardSteps.tsx` 543줄 | 동일 | C |
| 8 | `legacyUi.ts` 347줄 — 색상/포맷/거래/erp_code 헬퍼 혼재 | 디자인 시스템 분산 | B |
| 9 | `_components/` 평면 트리 — feature boundary 부재 | 탐색성 | B |
| 10 | `exhaustive-deps disable` 18곳 — stale closure 잠재 | 잠재 버그 | C |
| 11 | TransactionType 3-way 드리프트 (W8 보고) | 화면 영문 노출 | B |
| 12 | `employeeColor` wrapper 보류 (부서명 정규화 충돌, W2) | 단일 소스 미달 | B |
| 13 | StatusPill / StatusBadge 동일 tone source 미통일 (W4 일부) | 디자인 일관성 | A |
| 14 | `legacyUi.formatNumber` wrapper 만 — 39 호출처 직접 import 미전환 | 점진 부담 | A |
| 15 | api-core / error parser 단위 테스트 없음 | 회귀 안전망 | B |
| 16 | 다수 page.tsx (admin/inventory/history/bom/operations) — redirect/unused 분류 부재 | 죽은 코드 | A |
| 17 | mobile/desktop 분기 CSS dual mount (1024px) — 메모리/API 이중 호출 | 성능 | C |
| 18 | `parseError` 가 16곳 직접 사용 — `postJson` 통합 미진 | 코드 중복 | B |
| 19 | Storybook / 컴포넌트 카탈로그 부재 | 테스트성 | B |
| 20 | API 응답 타입과 백엔드 schemas drift 검출 자동화 없음 | 회귀 위험 | C |

---

## 4. 절대 건드리면 안 되는 파일/식별자

### Frozen 식별자
- `items.erp_code` (DB 컬럼)
- `formatErpCode()`, `ErpCode` 클래스
- `ErpLoginGate` 컴포넌트
- localStorage 키 `dexcowin_erp_operator`, `dexcowin_erp_boot_id`
- CSS 클래스 `erp-card-anim`, `erp-letter`
- 파일명 `ERP_Master_DB.csv`, `erp.db`
- 디렉터리 `Hw-03/ERP`, `C:/ERP/`

### Frozen 디렉터리
- `_archive/`, `frontend/_archive/`, `backend/_archive/`
- `_backup/`, `backups/`
- `vault/`

### Frozen route
- `frontend/app/legacy/page.tsx` 동작
- `frontend/app/page.tsx` (entry point)

### Frozen API
- 모든 `/api/...` path
- payload field 이름 / response shape

---

## 5. 안전한 리팩토링 순서 (이번 라운드)

본 라운드는 "wrapper / re-export / 디렉터리 생성" 위주로만 안전히 진행. 실제 파일 이동은 1~2개의 작은 도메인만.

| 단계 | 작업 | 위험 | 변경 영향 | 이번 라운드? |
|---|---|---|---|---|
| 2 | `lib/api/` 디렉터리 + `core.ts` re-export + `types.ts` 분리 (타입만 이동) + `index.ts` barrel | B | api.ts 가 barrel 로 변환 | **Yes** |
| 3 | `lib/mes/` 디렉터리 + 기존 mes-* 를 mes/ 로 re-export | A | 기존 import 100% 호환 | **Yes** |
| 4 | `frontend/features/` 디렉터리 + index.ts 만 (이동 0) | A | import 영향 0 | **Yes** |
| 5 | DesktopAdminView 의 `OverviewBar` / `SidebarButton` / `SectionHeader` 분리 | B | 호출 시그니처 동일 | **Yes** |
| 6 | exhaustive-deps disable 18곳 분류 보고서 + 가장 안전한 1~2건 정리 | B~C | 동작 영향 가능 | 부분 |
| 7 | api-core / mes-status 추가 테스트 | A | 테스트만 | **Yes** |
| 8 | route boundary 보고서 작성 (수정 0) | A | 문서 | **Yes** |
| 9 | 최종 점수표 작성 | A | 문서 | **Yes** |

### 다음 라운드로 넘기는 작업

- DesktopWarehouseView 837줄 분해
- AdminBomSection 631줄 분해
- HistoryScreen / WarehouseWizardSteps 모바일 분해
- TX-DRIFT-001 적용 (백엔드 정본 16개 통일)
- employeeColor 부서명 정규화 정합화 + wrapper 위임
- `app/legacy/_components/` → `frontend/features/` 실제 파일 이동
- mobile/desktop dual mount 해소
- API 도메인 파일 9개 추가 분리 (items/inventory/employees/etc.)
- `parseError` 직접 사용 16곳 → `postJson` 통합

---

## 6. 작업별 위험도 / 검증 명령

| 단계 | 위험 | 검증 명령 |
|---|---|---|
| 2 (API 분리 시작) | B | `npx tsc --noEmit` + grep 으로 외부 import 영향 0 확인 |
| 3 (mes/ 디렉터리) | A | `npx tsc --noEmit` |
| 4 (features 빈 디렉터리) | A | git ls-files 로 디렉터리 인식 |
| 5 (DesktopAdmin 컴포넌트 3개 분리) | B | `npx tsc --noEmit` + 변경 파일 검색으로 회귀 0 |
| 6 (exhaustive-deps 분류) | B | grep 카운트 / 선택적 lint |
| 7 (테스트) | A | `npm test` (회사 PC) |
| 8, 9 (문서) | A | 마크다운 시각 |

---

## 7. 롤백 기준

| 지표 | 임계 | 대응 |
|---|---|---|
| 변경분 신규 tsc 에러 ≥ 1 | 회귀 의심 | 즉시 직전 커밋 revert |
| 외부 `@/lib/api` import 깨짐 | 호환 깨짐 | 즉시 wrapper 보강 |
| 회사 PC `npm test` 실패 | 동작 영향 | 단계 정지, 보고 |
| `npm run build` 실패 | 빌드 회귀 | 단계 정지 |
| 화면 시각 변화 (색상 / 라벨) | 사용자 영향 | 즉시 롤백 + 보고서 (W2 모델) |

---

## 8. 이번 브랜치 (Round-3) 실행 항목

| ID | 단계 | 산출물 |
|---|---|---|
| R3-1 | 본 진단 리포트 | `docs/research/frontend-100-score-refactor-plan.md` |
| R3-2 | API types 분리 | `frontend/lib/api/types.ts` + `core.ts` re-export + `index.ts` barrel |
| R3-3 | mes 디렉터리 도입 | `frontend/lib/mes/{format,department,status,index}.ts` (re-export) |
| R3-4 | features 디렉터리 | `frontend/features/mes/{shared,admin,inventory,warehouse,history,mobile,app-shell}/index.ts` |
| R3-5 | DesktopAdminView 분리 (3개) | `_admin_sections/{OverviewBar,SidebarButton,SectionHeader}.tsx` |
| R3-6 | exhaustive-deps 분류 보고서 | `docs/research/frontend-exhaustive-deps-audit.md` |
| R3-7 | api-core 테스트 | `frontend/lib/api/__tests__/core.test.ts` |
| R3-8 | route 보고서 | `docs/research/frontend-route-boundary-report.md` |
| R3-9 | 최종 점수표 | `docs/research/frontend-100-score-final-review.md` |

각 단계마다 **개별 커밋 + 푸시**.

---

## 9. 다음 브랜치로 넘길 작업

**Round-4 후보 (별도 브랜치 / 별도 PR):**

1. DesktopWarehouseView 분해 (837줄 → 5~7개 파일)
2. AdminBomSection 분해
3. HistoryScreen / WarehouseWizardSteps 모바일 분해
4. TX-DRIFT-001 (백엔드 16종 정본 통일)
5. `app/legacy/_components/` → `frontend/features/` 실제 이동 (Tier 1~5)
6. API 도메인 9개 분리 (items/employees/inventory/admin/bom/packages/queue/alerts/counts/stock-requests)
7. mobile/desktop dual mount 해소 (`useMediaQuery`)
8. PIN 보안 PR-1 ~ PR-6 (`pin-security-migration-plan.md`)
9. employeeColor 정규화 정합화

본 라운드는 위험 회피 + 디렉터리 / re-export / 작은 컴포넌트 분리 중심으로 마감한다.
