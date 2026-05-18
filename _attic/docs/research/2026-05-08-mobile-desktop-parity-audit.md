# 모바일 ↔ 데스크탑 기능 Parity Audit (2026-05-08)

> **목적**: DEXCOWIN MES 모바일을 "데스크탑 축소판"이 아니라 현장 작업자용 별도 UX로 전면 개편하기 위한 사전 조사. 이 문서는 코드 수정 전에 데스크탑/모바일 기능 차이를 명확히 한 뒤 단계별 계획(Phase 1~7)으로 연결한다.

**관련 plan 파일**: `C:\Users\user\.claude\plans\proud-soaring-moler.md`

---

## 0. 활성 Render Path (검증 완료)

| 책임 | 실제 파일 (절대 경로) | 핵심 라인 |
|---|---|---|
| Next.js entry | `c:/ERP/frontend/app/legacy/page.tsx` | `LegacyPage` L30, `LegacyBody` L48 |
| 모바일/데스크탑 분기 | 같은 파일 | L100 `lg:hidden`, L138 `DesktopLegacyShell` |
| 탭 상태 | `LegacyBody` 내부 useState + URL 쿼리 | L51-55 `initialTab`, L73-80 `changeTab` |
| 권한 강제 이동 | 같은 파일 | L83-88 |
| 모바일 Shell + 하단 nav | `c:/ERP/frontend/app/legacy/_components/mobile/MobileShell.tsx` | `TabId` L13, `ALL_TABS` L15-20, 권한 필터 L39-46 |
| 작업자 세션 | `c:/ERP/frontend/app/legacy/_components/login/useCurrentOperator.ts` | `Operator` L11, `clearCurrentOperator()` L63 |
| 권한 매트릭스 | `c:/ERP/frontend/app/legacy/_components/_warehouse_steps/_constants.ts` | `WORK_TYPES` L31-37, `canEnterIO` L89, `workTypesForOperator` L95-107 |
| 알림 시트(이미 있음) | `c:/ERP/frontend/app/legacy/_components/mobile/AlertsSheet.tsx` | 전체 |
| Mobile primitives | `c:/ERP/frontend/app/legacy/_components/mobile/primitives/index.ts` | export 18종 |

**핵심**: `MobileBottomNav.tsx`라는 별도 파일은 **존재하지 않음** — 하단 nav는 `MobileShell.tsx` 내부에서 직접 렌더(L95-142). `LegacyBody`도 별도 파일 아님(`page.tsx`:48 함수). 모바일/데스크탑 분기는 Tailwind `lg:hidden`만 사용.

---

## 1. 데스크탑 기능 인벤토리

### 1.1 재고/대시보드 (`DesktopInventoryView.tsx`)
- **표시**: KPI 카드(전체/저재고/품절/보안재고), 키워드+부서+모델+KPI 필터, 우측 슬라이드 패널(예약/위치 분포/최근 거래 10건), 생산가능 용량 패널
- **액션**: 검색, 필터, 클릭→입출고 자동 이동, 우측 패널 토글

### 1.2 입출고 (`DesktopWarehouseView.tsx`)
**5개 작업유형** (`_warehouse_steps/_constants.ts:31-37` 검증):
1. `raw-io` (in/out/return) — 공급업체 입출고
2. `warehouse-io` (wh-to-dept/dept-to-wh) — 창고↔부서 이동
3. `dept-adjustment` (production/disassembly/correction) — 부서 재고 조정
4. `package-out` — 패키지 출하
5. `defective-register` — 불량 격리 (CAUTION_WORK_TYPES `_constants.ts:39`)

**4-탭 구조**: 요청 작성(compose) / 장바구니(draft) / 내 요청 / 승인함(창고 정·부 전용)
- Draft 자동 저장+복원, 권한 체크(`workTypesForOperator`)
- 단계: 담당자 선택 → 작업유형 → 품목 → 수량 → 승인 요청

**권한 매트릭스** (`_constants.ts:95-107` 검증):
| operator | 작업유형 |
|---|---|
| 창고 primary/deputy | 5종 모두 |
| 조립/출하 부서 | warehouse-io, dept-adjustment, package-out, defective-register |
| 기타 생산부서 (튜브/고압/진공/튜닝) | warehouse-io, dept-adjustment, defective-register |

### 1.3 내역 (`DesktopHistoryView.tsx`)
- 통계(필터된 거래 합계), 유형/기간/검색 필터, 달력/리스트 뷰 토글
- 우측 상세 패널: **메타 수정**(참고/메모/부서/작업자, `productionApi.metaEditTransaction`), **수량 보정**(`productionApi.quantityCorrectTransaction` — RECEIVE/SHIP만, 보정 거래 자동 생성), 수정 이력, 동 품목 최근 5건
- 참고번호 복사

### 1.4 주간보고 (`DesktopWeeklyReportView.tsx`)
- 주차 선택, 모델×공정 매트릭스, 공정별 변화(순변동/생산/출고)
- 선택 공정 → 부서별 품목 변화 카드(전주재고/현주변동/현주재고)
- A~F 공정 탭, 단일 API: `weeklyApi.getWeeklyReport()`

### 1.5 관리자 (`DesktopAdminView.tsx`)
- PIN 잠금
- **6 섹션**: 품목 / 직원 / 모델 / 패키지 / 부서 / 설정
- 우측 통계 패널, 데이터 리셋(위험)

### 1.6 BOM Workbench (`_admin_sections/_bom_workbench/`)
- Edit / WhereUsed 2모드
- 부서별 탭, 부모 후보 리스트
- 자식 추가, 수량 인라인 편집, 삭제
- **미배치 원자재** 패널
- 즉시 저장(드래프트 없음)

### 1.7 상단/로그인
- `DesktopTopbar`: 작업자 드롭다운, 동기화, PIN 변경 모달, 로그아웃 확인 모달
- `OperatorLoginCard`: 부서→직원→PIN 3단계, popstate 지원

---

## 2. 모바일 현재 상태

### 2.1 탭 (4개)
`MobileShell.tsx:13` — `"inventory" | "warehouse" | "dept" | "admin"`

| 탭 | 화면 파일 | 완성도 | 비고 |
|---|---|---|---|
| inventory | `mobile/screens/InventoryScreen.tsx` | 강 | StickyHeader/SelectionBanner 분리, KPI/필터/다중선택, 일괄입출고 연계 |
| warehouse | `mobile/io/warehouse/WarehouseWizardScreen.tsx` | 중 | 3단계, 창고↔부서·외부→창고만 |
| dept | `mobile/io/dept/DeptWizardScreen.tsx` | 중 | 4단계, 부서간 이동·패키지 |
| admin | `mobile/screens/admin/AdminShell.tsx` | 중 | items/employees/bom/packages/settings 5섹션 |
| (history) | `mobile/screens/HistoryScreen.tsx` | 강 | InventoryScreen에서 임시 전환(showHistory) — 정식 탭 아님 |

### 2.2 Mobile primitives (18종)
`mobile/primitives/index.ts` — IconButton, StatusBadge, KpiCard, SectionHeader, SheetHeader, FilterChip, FilterChipRow, Stepper, StickyFooter, WizardProgress, WizardHeader, PersonAvatar, ItemRow, EmptyState, InlineSearch, AsyncState, AsyncSkeletonRows, SummaryChipBar, SectionCard, SectionCardRow, PrimaryActionButton.

### 2.3 명백히 빠진 것
- **홈/대시보드**: 없음 (진입 시 inventory가 기본)
- **주간보고**: 없음
- **상단 담당자 메뉴(PIN 변경/로그아웃)**: PIN 변경은 admin→settings 깊숙이, 명시적 로그아웃 UI 부재
- **입출고 작업유형 5종 중 모바일에 노출된 것**: `warehouse-io`, `dept-adjustment` 일부만. raw-io(공급업체 in/out/return), package-out, defective-register, dept-adjustment의 production/disassembly/correction 세부 모드 미지원
- **입출고 4-탭(작성/이어쓰기/내 요청/승인함)**: 없음 (DRAFT 자동복원만 reducer 차원에서 동작, UI 가시성 없음)
- **승인함**: 없음
- **거래 메타/수량 수정**: 없음
- **BOM Workbench(WhereUsed/미배치)**: AdminBomSection은 단순 편집만

---

## 3. 누락 기능 표 (Desktop → Mobile)

| # | 기능 | 데스크탑 위치 | 모바일 현재 | 모바일 적용 방식 | 우선순위 | 위험도 |
|---|---|---|---|---|---|---|
| 1 | 홈/대시보드 | (inventory가 대시보드 역할) | 없음 | 신규 HomeScreen | **P1** | 🟢 |
| 2 | 주간보고 | DesktopWeeklyReportView | 없음 | WeeklyReportScreen + 주차 sheet + 공정 카드 | P3 | 🟢 |
| 3 | 작업유형: 공급업체 반품(raw-io return) | _warehouse_sections | 없음 | 작업유형 카드 + Confirm 빨간 경고 | P2 | 🟡 |
| 4 | 작업유형: 부서 조정(생산/분해/보정) | dept-adjustment | 없음 | dept Wizard에 모드 추가 | P2 | 🟡 |
| 5 | 작업유형: 패키지 출하 | package-out | 없음 | 작업유형 카드 추가 | P2 | 🟡 |
| 6 | 작업유형: 불량 격리 | defective-register | 없음 | Confirm 단계 빨간 전체 경고 + 명시적 토글 | P2 | 🔴 |
| 7 | 입출고 4-탭(compose/draft/내요청/승인함) | _warehouse_sections | DRAFT reducer만 | IoHubScreen 슬라이드 탭 | P2 | 🟢 |
| 8 | 승인함(창고 정/부) | warehouse approval | 없음 | Phase 3C 실 구현 | P2 | 🟢 |
| 9 | 거래 메타 수정 | DesktopHistoryView | 없음 | 내역 상세 시트 "수정" (관리자 한정, `metaEditTransaction`) | P3 | 🟡 |
| 10 | 거래 수량 보정 | DesktopHistoryView | 없음 | **모바일 미노출** (사용자 결정 C) | — | 🔴 |
| 11 | BOM Workbench (Edit/WhereUsed/미배치) | _bom_workbench | 단순 편집만 | 부서 탭 + 자식 sheet + 미배치 sheet (Phase 6) | P3 | 🟡 |
| 12 | 관리자: 모델 관리 | DesktopAdminView | 없음 | Phase 6 (읽기 우선) | P4 | 🟡 |
| 13 | 관리자: 부서 관리 | DesktopAdminView | 없음 | Phase 6 (읽기 우선) | P4 | 🟡 |
| 14 | 관리자: 데이터 리셋 | settings | 없음 | **모바일 미노출** | — | 🔴 |
| 15 | 상단 담당자 메뉴(PIN/로그아웃) | DesktopTopbar | 묻혀있음 | 더보기 상단 카드 + OperatorMenuSheet | **P1** | 🟢 |
| 16 | 로그아웃 확인 모달 | DesktopTopbar | 없음 | 빨간 PrimaryActionButton sheet | **P1** | 🟢 |
| 17 | 재고 우측 패널(예약/위치/최근거래) | DesktopInventoryView | 상세 시트 일부 | ItemDetailSheet 탭 추가 | P2 | 🟢 |
| 18 | 생산가능 용량 패널 | inventory | 없음 | 홈 카드로 이전(`getProductionCapacity`) | P2 | 🟢 |
| 19 | 동기화 버튼 | Topbar | 없음 | 화면별 IconButton | P2 | 🟢 |

P1 = Phase 1 (즉시) / P2 = Phase 2~3 / P3 = Phase 4~5 / P4 = Phase 6.

---

## 4. 모바일 IA (확정안)

### 4.1 하단 네비 5탭 + 더보기

```
┌────────────────────────────────────────────┐
│ 홈   │ 재고  │ 입출고 │ 내역  │ 더보기 │
└────────────────────────────────────────────┘
```

### 4.2 더보기 화면 구성
- 상단: 담당자 카드(PersonAvatar + 이름/부서/역할 배지) → 탭하면 PIN 변경/로그아웃 sheet
- 섹션 1 — 업무: 주간보고(Phase 5 전엔 Placeholder), 승인함(권한 시·Phase 3C 전엔 Placeholder), 내 요청(Phase 3A 전엔 Placeholder)
- 섹션 2 — 관리: 관리자(기존 admin), BOM Workbench(Phase 6 전엔 Placeholder)
- 섹션 3 — 시스템: 동기화, 앱 정보
- 하단: 로그아웃 (빨간색)

### 4.3 IA 다이어그램

```
LegacyPage (page.tsx)
└─ ErpLoginGate
   └─ LegacyBody
      ├─ MobileShell (lg:hidden)
      │  └─ activeTab switch:
      │     ├─ home       → HomeScreen          ★Phase 1
      │     ├─ inventory  → InventoryScreen
      │     ├─ warehouse  → WarehouseWizardScreen
      │     ├─ dept       → DeptWizardScreen
      │     ├─ history    → HistoryScreen       ★Phase 1 (정식 탭화)
      │     ├─ more       → MoreScreen          ★Phase 1
      │     └─ admin      → AdminShell
      └─ DesktopLegacyShell (hidden, lg에서만)
```

---

## 5. Phase 별 구현 계획 (요약)

| Phase | 범위 | 위험 |
|---|---|---|
| 0 | 본 audit 문서 | 🟢 |
| 1 | 5탭 + Home + More + OperatorMenuSheet + Placeholder + 신규 primitives 3종 | 🟢 |
| 2 | 재고 상세(요약/위치/최근거래) + KPI 데스크 동기화 + IME 가드 | 🟢 |
| 3A | IO Hub Shell + 작성/이어쓰기/내요청/승인함 슬라이드 탭 + 작업유형 카드 그리드 | 🟡 |
| 3B | raw-io(in/out/return) + warehouse-io 정리 | 🟡 |
| 3C | dept-adjustment + package-out + defective-register + 승인함 실 구현 | 🔴 |
| 4 | 내역: 메타 수정(관리자) + 수정 이력 탭 | 🟡 |
| 5 | 주간보고 화면 | 🟢 |
| 6 | 관리자/BOM(데스크탑 Workbench 확정 후 모바일 축약) | 🟡 |
| 7 | 로그인/PIN/담당자 메뉴 정리 (Phase 1 OperatorMenuSheet 다듬기) | 🟢 |

상세는 plan 파일 §5 참조.

---

## 6. 위험도 분류

### 🟢 안전
Phase 0, Phase 1, Phase 2, Phase 5, Phase 7. 신규 추가 + 시각 보강이 주이므로 데스크탑 회귀 없음.

### 🟡 시각 회귀 / 권한 분기 필요
Phase 3A·3B, Phase 4, Phase 6.

### 🔴 위험 동작 포함
- Phase 3C (`defective-register`는 되돌릴 수 없음, `raw-io return`도 강한 영향)
- 거래 수량 보정 / DB 리셋 / 모델·부서 쓰기 — **모바일 미노출 유지**

---

## 7. 사용자 확정 결정사항 (2026-05-08)
- ✅ 하단 네비: 5탭 + 더보기
- ✅ 입출고 작업유형: 5종 모두 모바일 노출 (위험 동작은 Confirm 경고 강화)
- ✅ 내역 수정: 메타만 모바일 (수량 보정은 데스크탑 전용)
- ✅ BOM 모바일: 조회 + 간단 편집 (대량 매핑은 데스크탑 권장)

---

## 8. Phase 1 즉시 진행 범위 (이 audit 다음 작업)

### 수정 파일 (절대 경로)
- `c:/ERP/frontend/app/legacy/_components/mobile/MobileShell.tsx` — `TabId` / `ALL_TABS` 확장
- `c:/ERP/frontend/app/legacy/page.tsx` — `TAB_TITLES` / `VALID_MOBILE_TABS` / 라우팅 switch
- `c:/ERP/frontend/app/legacy/_components/mobile/primitives/index.ts` — 새 primitive export

### 신규 파일
- `mobile/screens/HomeScreen.tsx`
- `mobile/screens/MoreScreen.tsx`
- `mobile/screens/_more_parts/OperatorMenuSheet.tsx`
- `mobile/screens/_more_parts/PlaceholderScreen.tsx`
- `mobile/screens/_home_parts/HomeKpiRow.tsx`
- `mobile/screens/_home_parts/QuickActionGrid.tsx`
- `mobile/primitives/MoreMenuRow.tsx`
- `mobile/primitives/KpiRow.tsx`
- (QuickActionGrid는 _home_parts에 두고 더보기에서도 import)

### 검증
1. `cd frontend && npx tsc --noEmit`
2. `npm run lint`
3. `npm run build`
4. iPhone SE(375)/14(390)/Android(412) 폭
5. `/legacy?tab=home` 진입 → 5탭 노출 → 더보기 → PIN 변경/로그아웃 sheet

### 건드리지 않는 영역
- `_components/Desktop*.tsx`, `_inventory_sections/`, `_warehouse_sections/`, `_warehouse_steps/`, `_history_sections/`, `_weekly_sections/`, `_admin_sections/` — 데스크탑 tree
- `frontend/lib/api/`, `frontend/lib/mes/` — API/유틸 시그니처 변경 없음 (사용만)
- `backend/`, DB, OpenAPI

---

## 9. 다음 작업

이 문서 작성 후 즉시 Phase 1 진행. Phase 1 완료 후 사용자 확인을 받고 Phase 2 시작.
