# UI 화면 분석 — 2026-05-02

> **작업 ID:** MES-UI-001~005, MES-TREE-003  
> **작성일:** 2026-05-02 (토)  
> **기준 브랜치:** `feat/hardening-roadmap` (단일 — 초기 분석 브랜치 `claude/analyze-dexcowin-mes-tGZNI` 폐기)  
> **수정 여부:** 없음 (읽기 전용 분석)

---

## MES-UI-001 — DesktopAdminView 현재 구조

**파일:** `frontend/app/legacy/_components/DesktopAdminView.tsx` (31KB)

### 현재 8개 섹션 (SECTIONS + SETTINGS_ENTRY)

```ts
type AdminSection = "items" | "employees" | "models" | "bom" | "packages" | "export" | "settings" | "departments";

const SECTIONS = [
  { id: "models",      label: "모델",     description: "제품 모델 추가/삭제" },
  { id: "items",       label: "품목",     description: "품목 기본 정보 수정" },
  { id: "employees",   label: "직원",     description: "직원 활성 상태 관리" },
  { id: "departments", label: "부서",     description: "부서 추가/비활성화" },
  { id: "bom",         label: "BOM",      description: "부모-자식 자재 구성" },
  { id: "packages",    label: "출하묶음", description: "패키지 구성 관리" },
  { id: "export",      label: "내보내기", description: "엑셀 데이터 내보내기" },
];
const SETTINGS_ENTRY = { id: "settings", label: "설정", description: "PIN, CSV, 초기화" };
// + AdminDangerZone (별도 컴포넌트, 섹션 목록 외)
```

### 누락된 영역 (현재 관리자 화면 접근 불가)

| 누락 영역 | 현재 위치 | 문제 |
|---|---|---|
| 재고 기준값 (min_stock, 안전재고) | items 섹션 내 필드 1개 | 품목별 일괄 설정 불가 |
| 실사/강제조정 | `/counts` 별도 라우트 | 관리자 화면에서 접근 안 됨 |
| 손실/폐기/편차 | `/` 미연결 | 관리자 화면에서 접근 안 됨 |
| 권한/PIN 관리 | settings 섹션 일부 | 직원별 PIN 관리 미흡 |
| 감사 로그 | `admin_audit.py` API만 | 화면 없음 |
| 관리자 홈 (카드 그리드) | 없음 | 메뉴 평면 나열 |

### 상태 공유 구조 (문제점)

```
DesktopAdminView
  ├── useState: items, employees, packages, productModels, allBomRows, departments (6개 공유 상태)
  ├── useState: section, unlocked, adminPin, showRightPanel (UI 상태)
  └── 모든 섹션 컴포넌트에 props drilling
```
→ 거대 단일 컴포넌트 패턴. 섹션 추가 시 DesktopAdminView만 비대해짐.

---

## MES-UI-002 — 입출고 화면 현재 구조

**파일:** `frontend/app/legacy/_components/DesktopWarehouseView.tsx` (30KB)  
`frontend/app/legacy/_components/_warehouse_steps/_constants.ts`

### 현재 5가지 WorkType

```ts
type WorkType = "raw-io" | "warehouse-io" | "dept-io" | "package-out" | "defective-register";

// 실제 WORK_TYPES 정의
{ id: "raw-io",             label: "원자재 입출고",  description: "창고 입고 · 출고 · 공급업체 반품" }
{ id: "warehouse-io",       label: "창고 이동",      description: "창고↔생산부서 이동" }
{ id: "dept-io",            label: "부서 입출고",    description: "생산부서 기준 입고/출고" }
{ id: "package-out",        label: "패키지 출고",    description: "등록된 묶음 출고" }
{ id: "defective-register", label: "불량 등록",      description: "불량 격리 처리" }
```

### 역할별 접근 가능 WorkType

| 역할 | 가능한 작업 |
|---|---|
| 관리자 (admin) | raw-io, warehouse-io, dept-io, package-out, defective-register (전체) |
| 창고 담당 | warehouse-io, dept-io, package-out, defective-register |
| 일반 | warehouse-io, dept-io, defective-register |

### 현재 위저드 구조

```
Step 1: 직원 선택 (step1Done)
Step 2: 작업 유형 선택 (workType)
Step 3: 품목 선택 + 수량 입력 (selectedItems)
Step 4: 확인 (showConfirm)
Step 5: 완료
```

### 문제점

| # | 문제 | 비고 |
|---|---|---|
| W-1 | "입고"/"출고" 레이블 불명확 — raw-io/warehouse-io 구분이 50~60대에 어려움 | 현장 용어와 불일치 |
| W-2 | 예약재고(`pending_quantity`) / 가용재고(`available`) 화면 상단 미노출 | 출고 시 초과 입력 가능 |
| W-3 | 수량 음수 차단이 UI 레벨에 없음 | 서버 검증만 있음 |
| W-4 | 작업 후 피드백 Toast만 — 최근 5건 이력 미표시 | |
| W-5 | 데스크톱 Tab→Enter 흐름 미구현 | |

---

## MES-UI-003 — 입출고 내역 화면 현재 구조

**파일:** `frontend/app/legacy/_components/DesktopHistoryView.tsx` (13KB)

### 현재 필터/뷰

```ts
const [typeFilter, setTypeFilter] = useState("ALL");   // 거래 타입 (ALL/RECEIVE/SHIP/...)
const [dateFilter, setDateFilter] = useState("ALL");   // 기간 (ALL/TODAY/WEEK/MONTH)
const [search, setSearch] = useState("");              // 텍스트 검색
const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");  // 뷰 모드
```

### 현재 지원 필터

- ✅ 거래 타입별 (`typeFilter`)
- ✅ 기간별 (`dateFilter`: ALL/TODAY/WEEK/MONTH)
- ✅ 텍스트 검색 (`search`)
- ✅ 캘린더 뷰 / 리스트 뷰 전환
- ✅ EXCEPTION_TYPES 특수 필터
- ❌ 부서별 필터 없음
- ❌ 직원/작업자별 필터 없음
- ❌ 상태별 필터 없음 (DRAFT/SUBMITTED 등)
- ❌ 취소/정정 이력 연결 표시 없음
- ❌ CSV/Excel 내보내기 없음 (export_helpers.py 미연결)
- ❌ 사용자 지정 날짜 범위 없음

---

## MES-UI-004 — 모바일/데스크톱 분기 breakpoint

**파일:** `frontend/app/legacy/page.tsx:98`

```tsx
<div className="lg:hidden">       {/* < 1024px → MobileShell */}
  <MobileShell ... />
</div>
<div className="hidden lg:block"> {/* ≥ 1024px → DesktopLegacyShell */}
  <DesktopLegacyShell />
</div>
```

- **기준:** `lg` = 1024px (Tailwind 기본값)
- **메커니즘:** CSS `hidden/block` 토글 — JS 없이 CSS만으로 분기
- **주의:** 두 컴포넌트가 **동시에 마운트**됨 → 메모리/API 이중 호출 가능성
- **개선 후보:** `useMediaQuery` 훅으로 조건부 렌더링 전환 (C등급)

---

## MES-UI-005 — 10항 평가 기준 적용

| 평가 항목 | 관리자 | 입출고 | 내역 | 모바일 | 데스크톱 |
|---|---|---|---|---|---|
| 50~60대가 설명 없이 쓸 수 있는가 | ❌ 메뉴 나열 | △ WorkType 용어 어려움 | △ 캘린더 기본 | ✅ | △ |
| 버튼 의미가 즉시 이해되는가 | △ | △ raw-io 등 영문 | ✅ | ✅ | △ |
| 실수 방지 장치가 있는가 | △ PIN만 | ❌ 음수 차단 없음 | ✅ | ✅ | △ |
| 위험 작업에 확인 절차가 있는가 | ✅ PIN | ✅ 확인 모달 | — | ✅ | ✅ |
| 글씨/터치 영역 ≥ 44px | △ | △ | △ | ✅ (primitives) | △ |
| 데스크톱 폭 활용 | ❌ 좁은 사이드바 | ✅ | △ | — | △ |
| 검색/필터 흐름이 빠른가 | △ | △ | △ 필터 부족 | ✅ | △ |
| 입력 후 결과 피드백 명확 | ✅ | ✅ Toast | △ | ✅ | ✅ |
| 관리자 기능이 분산돼 있는가 | ❌ 한 화면 집중 | — | — | — | — |
| MES 정체성이 명확한가 | ✅ | ✅ | ✅ | ✅ | ✅ |

**종합 개선 우선순위:** 관리자 > 입출고 > 내역

---

## MES-TREE-003 — Unused 라우트 분석

### admin / inventory / history

| 라우트 | 내용 | 상태 |
|---|---|---|
| `frontend/app/admin/page.tsx` | `redirect("/")` | 🔵 redirect-only, 삭제 가능 |
| `frontend/app/inventory/page.tsx` | `redirect("/")` | 🔵 redirect-only, 삭제 가능 |
| `frontend/app/history/page.tsx` | `redirect("/")` | 🔵 redirect-only, 삭제 가능 |

### alerts / counts / queue — 활성 확인

| 라우트 | 참조 위치 | 상태 |
|---|---|---|
| `frontend/app/alerts/page.tsx` | `AlertsBanner.tsx:38` (href="/alerts"), `AlertsSheet.tsx:13` | 🟢 **활성** — 메인 UI에서 링크됨 |
| `frontend/app/counts/page.tsx` | `AlertsSheet.tsx:14` (href="/counts") | 🟢 **활성** — 모바일 AlertsSheet |
| `frontend/app/queue/page.tsx` | `AlertsSheet.tsx:12` (href="/queue") | 🟢 **활성** — 모바일 AlertsSheet |

### bom / operations — 미사용 확인

| 라우트 | 참조 위치 | 상태 |
|---|---|---|
| `frontend/app/bom/page.tsx` | `AppHeader.tsx:12` (href="/bom") — 단, AppHeader는 `_archive/standalone-app-routes/`에서만 사용 | ⚫ **unused** — 활성 코드 미참조 |
| `frontend/app/operations/page.tsx` | `AppHeader.tsx:10` (위 동일) | ⚫ **unused** — 활성 코드 미참조 |

### frontend/components/ 3파일

| 파일 | 참조 위치 | 상태 |
|---|---|---|
| `AppHeader.tsx` | `_archive/standalone-app-routes/` 내부만 | ⚫ **unused** |
| `CategoryCard.tsx` | `_archive/standalone-app-routes/` 내부만 | ⚫ **unused** |
| `UKAlert.tsx` | `_archive/standalone-app-routes/` 내부만 | ⚫ **unused** |

### 결론

- **삭제 가능 (redirect-only):** `app/admin/`, `app/inventory/`, `app/history/` → 단, 외부 링크 없는지 확인 후
- **미사용 (archive-only 참조):** `app/bom/`, `app/operations/`, `frontend/components/` 3개 → 삭제 전 사용자 확인 필요
- **유지 (활성):** `app/alerts/`, `app/counts/`, `app/queue/`
