# 프론트 UI 컴포넌트 재사용성 감사 보고서

**작성일:** 2026-05-04  
**감사 범위:** `frontend/app/legacy/` 전체 + `frontend/lib/mes*`, `frontend/lib/ui/`  
**목적:** 화면마다 새로 만들어지는 카드·버튼·배지·테이블을 파악하고, 공통 컴포넌트 중심으로 조립하는 구조로 바꾸기 위한 단계별 계획 수립

---

## 1. 요약

### 현재 전체 프론트 UI 재사용 수준

**전체 점수: 68/100**

- 공통 컴포넌트는 잘 만들어져 있다. EmptyState, LoadingSkeleton, StatusPill, ConfirmModal, Toast, BottomSheet 모두 완성도 높다.
- 그러나 각 화면 개발 시 기존 컴포넌트를 가져다 쓰지 않고 직접 만드는 경향이 지속되고 있다.
- 특히 FilterChip, KPI 카드, 슬라이딩 패널 같이 코드가 완전히 동일한 것도 화면별로 따로 구현되어 있다.
- 모바일 primitives(18개)는 잘 정리되어 있으나 데스크톱 common과 연결이 없다.

### 가장 큰 문제 5개

1. **FilterChip 코드 완전 복제** — `InventoryFilterBar.tsx`와 `HistoryFilterBar.tsx`에 동일한 Chip 함수가 각각 있다.
2. **슬라이딩 패널 애니메이션 복제** — 436px, 160ms, cubic-bezier 값이 두 파일에 정확히 복제되어 있다.
3. **color-mix 인라인 50회 이상** — `color-mix(in srgb, ${tone} 14%, transparent)` 패턴이 전체 코드에 흩어져 있다.
4. **KPI/통계 카드 구조 4회 반복** — 라벨+숫자+설명+tone 패턴이 화면마다 직접 만들어진다.
5. **EmptyState/LoadingSkeleton 미사용** — `HistoryTable`이 공통 컴포넌트 대신 직접 텍스트를 작성한다.

### 가장 먼저 고쳐야 할 영역 5개

1. `common/FilterChip.tsx` 추출 — 동일 코드 즉시 제거 가능, 영향 범위 작음
2. `common/SlidePanel.tsx` 추출 — 슬라이딩 패널 애니메이션 단일화
3. `lib/mes/colorUtils.ts` — `tint(tone, pct)` 헬퍼 추가로 color-mix 중복 해소
4. `HistoryTable` 로딩 텍스트 → `LoadingSkeleton` 교체 — 한 줄 변경
5. 주간보고 "이번 주" 배지 → `StatusPill` 교체 — 커스텀 span 제거

---

## 2. 현재 존재하는 공통 컴포넌트 목록

### 2.1 `frontend/app/legacy/_components/common/`

| 컴포넌트 | 역할 | 현재 사용처 | 재사용성 | 부족한 점 |
|---|---|---|---|---|
| `EmptyState` | 빈 상태 3 variant (no-data/no-search/filtered-out) | InventoryItemsTable, WeeklyDetailTable | ✅ 높음 | 모바일 별도 구현과 통합 미완 |
| `LoadingSkeleton` | 로딩 스켈레톤 3 variant (table/card/list) | DesktopWeeklyReportView, InventoryView | ✅ 높음 | HistoryTable에서 미사용 |
| `LoadFailureCard` | 실패 상황 alert (재시도 버튼 포함) | 여러 화면의 error 상태 | ✅ 높음 | 없음 |
| `StatusPill` | 상태 배지 (MesTone 5종 지원) | DesktopTopbar, 일부 화면 | ✅ 높음 | 커스텀 span으로 직접 구현하는 곳이 있음 |
| `ResultModal` | 작업 결과 모달 (성공/부분/실패) | 입출고 완료 | ✅ 높음 | 데스크톱 전용, lib/ui/로 이동 고려 |

### 2.2 `frontend/lib/ui/`

| 컴포넌트 | 역할 | 현재 사용처 | 재사용성 | 부족한 점 |
|---|---|---|---|---|
| `Toast` | 자동 닫히는 알림 (3종) | 입출고 완료, AlertsSheet | ✅ 공용 | 전역 상태 없음 — 각 페이지에서 useState 관리 |
| `ConfirmModal` | 확인/취소 모달 (tone 지원, busy 상태) | 모바일/데스크톱 입출고 | ✅ 높음 | 없음 |
| `BottomSheet` | 모바일 바텀시트 (safe-area 대응) | 필터/상세 시트 | ✅ 높음 | 없음 |

### 2.3 `frontend/lib/mes*/`

| 유틸 | 역할 | 재사용성 | 부족한 점 |
|---|---|---|---|
| `mes-format.ts` — formatQty/formatDate/formatDateTime/formatPercent/formatErpCode | 숫자·날짜 포맷 (ko-KR, null 안전) | ✅ 높음 | 없음 |
| `mes-status.ts` — MesTone, TRANSACTION_META, inferTone() | 톤 타입 + 거래 메타 (라벨/톤/색상/아이콘) | ✅ 높음 | 없음 |
| `mes-department.ts` — getDepartmentFallbackColor, normalizeDepartmentName | 부서 색상 (DB-first fallback) | ✅ 높음 | employeeColor() wrapper 정리 미완 |
| `mes/inventory.ts` — getStockState | 재고 상태 판정 | ✅ 높음 | 없음 |
| `mes/colorUtils.ts` | color-mix 헬퍼 | ❌ 없음 | **신규 필요** |

### 2.4 모바일 primitives (18개) — `mobile/primitives/`

> 모두 LEGACY_COLORS + TYPO 토큰 사용. 데스크톱 화면과 연결 없음.

| 컴포넌트 | 역할 | 데스크톱 대응 |
|---|---|---|
| `StatusBadge` | 상태 배지 (구버전 tone: ok/warn/danger/info/muted) | StatusPill (신버전) — tone 불일치 ⚠ |
| `FilterChip` | 필터 칩 (모바일 전용) | InventoryFilterBar/HistoryFilterBar의 인라인 Chip |
| `KpiCard` | KPI 카드 (label+value+color) | InventoryKpiPanel, HistoryStatsBar — 별도 구현 |
| `EmptyState` | 빈 상태 (icon+title+description+action) | `common/EmptyState.tsx` — 다른 구현 ⚠ |
| `AsyncState` | 비동기 상태 래퍼 (loading/error/empty) | 없음 |
| `SectionCard` | 섹션 카드 | 없음 |
| `IconButton` | 아이콘 버튼 (3 variant, 3 size) | 없음 (직접 구현) |
| `PrimaryActionButton` | 주요 액션 버튼 (4 intent) | 없음 |
| `ItemRow` | 품목 행 | InventoryItemRow (별도 구현) |
| `PersonAvatar` | 담당자 아바타 | 없음 |
| `InlineSearch` | 인라인 검색 입력 | HistoryFilterBar 내 직접 구현 |
| `Stepper` | 증감 입력 | WarehouseWizard 내 직접 구현 |
| `WizardHeader/WizardProgress` | 위저드 진행 표시 | 없음 |
| `SummaryChipBar` | 요약 칩 바 | 없음 |
| `StickyFooter/SheetHeader/SectionHeader` | 레이아웃 헬퍼 | 없음 |

---

## 3. 중복 UI 패턴 표

| 패턴명 | 중복 파일 | 현재 문제 | 공통화 후보 | 위험도 | 우선순위 |
|---|---|---|---|---|---|
| **FilterChip** | `InventoryFilterBar.tsx`, `HistoryFilterBar.tsx` | 동일 코드 복제, padding 차이만 | `common/FilterChip.tsx` 신규 | A (신규 추가) | 1순위 |
| **슬라이딩 패널 애니메이션** | `DesktopInventoryRightPanel.tsx`, `DesktopHistoryRightPanel.tsx` | 436px·160ms·cubic-bezier 정확 복제 | `common/SlidePanel.tsx` 신규 | A | 1순위 |
| **color-mix 인라인** | 전체 30+ 파일 (50회 이상) | `color-mix(in srgb, ${tone} 14%, ...)` 매번 직접 작성 | `tint(tone, pct)` 헬퍼 | A | 1순위 |
| **KPI/통계 카드** | `InventoryKpiPanel.tsx`, `HistoryStatsBar.tsx`, `WeeklyGroupCards.tsx`, `OverviewBar.tsx` | 라벨+숫자+설명+tone 구조 4회 반복 | `common/KpiCard.tsx` | B | 2순위 |
| **카드 기본 스타일** | 전체 화면 (7+ 파일) | rounded-[22/20/18/16px] 혼용, `className="card"` vs inline style 혼재 | `.card` CSS 클래스 표준화 | B | 2순위 |
| **상태 배지 직접 구현** | `DesktopWeeklyReportView.tsx`(줄270), 여러 화면 | `StatusPill`이 있는데 커스텀 `<span>` 작성 | `StatusPill` 사용 확대 | B | 2순위 |
| **EmptyState** | `common/EmptyState.tsx`, `mobile/primitives/EmptyState.tsx` | 데스크톱/모바일 완전히 다른 구현 | 단일 EmptyState (variant + icon 지원) | D | 5순위 |
| **테이블 헤더** | `InventoryItemsTable.tsx`, `HistoryTable.tsx`, `WeeklyDetailTable.tsx` | muted2 색상, border-b 패턴 동일하나 inline vs className 혼용 | `common/MesTableHeader.tsx` | C | 3순위 |
| **로딩 텍스트 직접 작성** | `HistoryTable.tsx` | "내역을 불러오는 중..." 직접 텍스트 | `LoadingSkeleton variant="list"` | A | 1순위 |
| **StatusBadge vs StatusPill tone** | 모바일 전체, 데스크톱 StatusPill | `"ok"/"warn"` vs `"success"/"warning"` 불일치 | `MesTone` 통합 (MES-COMP-002) | D | 5순위 |
| **포맷 함수** | 전체 화면 (formatQty 잘 쓰임) | toLocaleString 직접 호출 산발적으로 남아 있을 수 있음 | `mes-format.ts` 전면 사용 | B | 2순위 |
| **색상 하드코딩** | `historyShared.ts`, `adminShared.ts` | `#f97316` (orange) 직접 하드코딩 | `LEGACY_COLORS` 또는 CSS var 교체 | B | 2순위 |
| **Toast 전역 상태** | 모든 Toast 사용 화면 | `useState<ToastState>` 각 화면에서 별도 관리 | `useToast()` hook + Provider | C | 3순위 |
| **ResultModal 위치** | `common/ResultModal.tsx` | 데스크톱 전용, 모바일 미사용 | `lib/ui/`로 이동 + 모바일 도입 | C | 3순위 |

---

## 4. 반드시 공통화해야 할 컴포넌트 후보

### 4.1 `common/FilterChip.tsx` (Phase 1)

**왜 필요한가:** `InventoryFilterBar`와 `HistoryFilterBar`에서 동일한 Chip 함수가 각 파일 안에 정의되어 있다. padding만 다르고 구조가 완전히 같다.

**기존 중복:**
```tsx
// InventoryFilterBar.tsx — px-4 py-2
// HistoryFilterBar.tsx — px-3 py-1
function Chip({ active, label, onClick, tone }) {
  return (
    <button className="rounded-full border text-sm font-semibold"
      style={{
        background: active ? `color-mix(in srgb, ${tone} 14%, transparent)` : LEGACY_COLORS.s2,
        borderColor: active ? tone : LEGACY_COLORS.border,
        color: active ? tone : LEGACY_COLORS.muted2,
      }}
    >
```

**필요한 props:** `active`, `label`, `onClick`, `tone?`, `size?: "sm" | "md"`

**어디서 먼저 적용:** `InventoryFilterBar`, `HistoryFilterBar`

**위험도:** A — 신규 컴포넌트 추가, 기존 2개 파일 내부 Chip 함수만 교체

---

### 4.2 `common/SlidePanel.tsx` (Phase 1)

**왜 필요한가:** 우측 슬라이딩 패널 애니메이션 로직(width 436, opacity, transform)이 두 파일에 정확히 복제되어 있다. 셋째 패널이 생길 때 또 복제된다.

**기존 중복:**
```tsx
// DesktopInventoryRightPanel.tsx, DesktopHistoryRightPanel.tsx 동일
style={{
  width: isOpen ? 436 : 0,
  transition: "width 160ms cubic-bezier(0.4, 0, 0.2, 1)",
}}
// 내부 div
style={{
  opacity: isOpen ? 1 : 0,
  transform: isOpen ? "translateX(0)" : "translateX(18px)",
  transition: "opacity 260ms ease, transform 260ms ease",
}}
```

**필요한 props:** `isOpen`, `width?: number`, `children`

**어디서 먼저 적용:** `DesktopInventoryRightPanel`, `DesktopHistoryRightPanel`

**위험도:** A — 시각 변화 없음, 로직만 추출

---

### 4.3 `lib/mes/colorUtils.ts` — `tint()` (Phase 1)

**왜 필요한가:** `color-mix(in srgb, ${tone} 14%, transparent)` 패턴이 전체 코드에 50회 이상 흩어져 있다. 비율도 8%, 12%, 14%, 15%, 16%, 22%, 30%, 40% 등으로 제각각이다.

**제안 API:**
```ts
// lib/mes/colorUtils.ts
export function tint(color: string, pct: number, base = "transparent"): string {
  return `color-mix(in srgb, ${color} ${pct}%, ${base})`;
}
// 사용: tint(tone, 14) → "color-mix(in srgb, #... 14%, transparent)"
```

**위험도:** A — 순수 유틸 함수, 기존 코드 즉시 교체 불필요

---

### 4.4 `common/KpiCard.tsx` (Phase 3)

**왜 필요한가:** 라벨+숫자+설명+tone 구조가 `InventoryKpiPanel`, `HistoryStatsBar`, `WeeklyGroupCards`, `OverviewBar` 4곳에서 반복된다. 모바일 `primitives/KpiCard.tsx`와도 역할이 겹친다.

**필요한 props:** `label`, `value: number | string`, `hint?`, `tone?`, `onClick?`, `active?`

**어디서 먼저 적용:** Phase 3에서 `HistoryStatsBar` → `KpiCard` 교체

**위험도:** B~C — 기존 화면 스타일에 영향 있음, 스냅샷 비교 필요

---

### 4.5 `common/MesTableHeader.tsx` (Phase 5)

**왜 필요한가:** `InventoryItemsTable`, `HistoryTable`, `WeeklyDetailTable` 헤더가 동일한 muted2 색상, border-b 패턴을 가지나 inline/className이 혼용된다.

**제안:** `<th>` wrapper — `label`, `width?`, `align?`, `nowrap?` props

**위험도:** C — 테이블 레이아웃 변경 위험

---

## 5. 기존 컴포넌트를 그대로 재사용하면 되는 것

### EmptyState
- **잘 쓰는 곳:** `InventoryItemsTable.tsx`, `WeeklyDetailTable.tsx`
- **안 쓰는 곳:** 직접 빈 상태를 만드는 화면 (있으면 검색 필요)
- **교체법:** `<EmptyState variant="no-data" title="..." />` 또는 `variant="filtered-out"`

### LoadingSkeleton
- **잘 쓰는 곳:** `DesktopWeeklyReportView.tsx`, `DesktopInventoryView.tsx`
- **안 쓰는 곳:** `HistoryTable.tsx` (직접 "내역을 불러오는 중..." 텍스트 작성)
- **교체법:** `<LoadingSkeleton variant="list" rows={8} />`

### formatQty
- **잘 쓰는 곳:** 대부분의 화면
- **안 쓰는 곳:** 혹시 `.toLocaleString()` 직접 호출이 남아 있는 곳
- **교체법:** `import { formatQty } from "@/lib/mes/format";`

### LEGACY_COLORS
- **잘 쓰는 곳:** 전체 화면 (거의 100%)
- **문제:** `historyShared.ts`, `adminShared.ts`에서 `#f97316` 하드코딩이 남아 있음
- **교체법:** CSS var 또는 LEGACY_COLORS에 orange 추가 검토

### ConfirmModal / Toast / BottomSheet
- **현황:** `lib/ui/`로 이미 통일됨 ✅
- **사용처:** 모바일/데스크톱 공용

---

## 6. 새로 만들기보다 기존 패턴을 따라야 하는 것

| 신규 화면에서 필요한 것 | 따라야 할 기존 패턴 |
|---|---|
| KPI/통계 카드 | `HistoryStatsBar` 또는 `InventoryKpiPanel` 패턴 → Phase 3에서 `KpiCard`로 통합 |
| 선택형 카드/필터 카드 | `WeeklyGroupCards` 패턴 (active/hover/tone 기반) |
| 보고서 상세 테이블 | `WeeklyDetailTable` 또는 `HistoryTable` 패턴 |
| 우측 슬라이딩 상세 패널 | `DesktopRightPanel` + 애니메이션 → Phase 1에서 `SlidePanel`으로 통합 |
| 빈 상태 | `EmptyState` (common) — 직접 만들지 말 것 |
| 로딩 상태 | `LoadingSkeleton` (common) — animate-pulse div 직접 만들지 말 것 |
| 확인 모달 | `ConfirmModal` (lib/ui) |
| 알림 | `Toast` (lib/ui) |
| 필터 칩 | Phase 1 이후: `FilterChip` (common) |

---

## 7. 단계별 실행 계획

### Phase 0 — 감사 보고서 작성 (이번 작업)
- 코드 수정 없음
- 이 파일 작성
- **위험도:** A

---

### Phase 1 — 공통 UI primitive 최소 세트 추가
**목표:** 신규 컴포넌트 추가만. 기존 화면은 건드리지 않음.

추가할 파일:
- `frontend/app/legacy/_components/common/FilterChip.tsx`
- `frontend/app/legacy/_components/common/SlidePanel.tsx`
- `frontend/lib/mes/colorUtils.ts` (tint 함수)
- `common/index.ts` — FilterChip, SlidePanel 추가 export

동시에 교체 (영향 범위 극소):
- `HistoryTable.tsx` 로딩 텍스트 → `LoadingSkeleton variant="list"` (1줄)
- `DesktopWeeklyReportView.tsx` "이번 주" 커스텀 span → `StatusPill` (5줄)

**위험도:** A — 신규 3개, 기존 2개 파일 소규모 교체  
**예상 파일 수:** 신규 3 + 수정 2

---

### Phase 2 — 주간보고에 Phase 1 컴포넌트 적용
**목표:** 주간보고는 신규 탭이라 영향 범위가 가장 작음.

- `WeeklyGroupCards.tsx` — `tint()` 함수로 color-mix 교체
- `WeeklySummaryBand.tsx` — `tint()` 함수로 color-mix 교체
- `DesktopWeeklyReportView.tsx` — 슬라이딩 없으면 SlidePanel 생략

**위험도:** B — 화면 동작 변경 없이 내부 코드만 정리  
**예상 파일 수:** 2~3

---

### Phase 3 — 입출고 내역/대시보드 KPI 공통화
**목표:** KpiCard 컴포넌트 제작 + 적용

- `KpiCard.tsx` 신규 작성
- `HistoryStatsBar.tsx` → KpiCard 교체 (UI 스냅샷 유지 필수)
- `InventoryKpiPanel.tsx` → KpiCard 교체 (UI 스냅샷 유지 필수)

**위험도:** C — 기존 주요 화면, 시각 회귀 주의  
**예상 파일 수:** 신규 1 + 수정 2~3

---

### Phase 4 — EmptyState/LoadingSkeleton 직접 구현 제거
**목표:** 전체 화면에서 `animate-pulse`, "결과 없음" div 제거

- 검색: `animate-pulse` 직접 사용 파일 목록 확인
- 검색: 로딩/빈 상태를 직접 텍스트로 만드는 파일 목록 확인
- 영향 작은 파일부터 교체

**위험도:** B  
**예상 파일 수:** ~6

---

### Phase 5 — 테이블/우측 패널 공통화 (마지막)
**목표:** MesTableHeader, 우측 패널 SlidePanel 적용

- `InventoryFilterBar`, `HistoryFilterBar` → `FilterChip` 교체
- `DesktopInventoryRightPanel`, `DesktopHistoryRightPanel` → `SlidePanel` 교체
- `InventoryItemsTable`, `HistoryTable`, `WeeklyDetailTable` → `MesTableHeader` 교체

**위험도:** D — 핵심 기존 화면 변경, 가장 마지막에 진행  
**예상 파일 수:** 5~8

---

## 8. 위험도 분류

| 작업 | 위험도 | 이유 |
|---|---|---|
| 유틸 함수/신규 컴포넌트 추가 | **A** | 기존 화면 영향 없음 |
| 주간보고 내부 코드 정리 | **B** | 신규/독립 탭, 회귀 범위 작음 |
| HistoryStatsBar/KpiPanel KpiCard 교체 | **C** | 기존 주요 화면, 시각 회귀 위험 |
| DesktopWarehouseView 구조 변경 | **D** | 핵심 입출고 흐름, 높은 위험 |
| HistoryTable/InventoryTable 전면 교체 | **D** | 데이터 표시 핵심, 절대 한 번에 하지 않음 |
| StatusBadge/StatusPill 통합 (MES-COMP-002) | **D** | 모바일 전체 화면 영향 |

---

## 9. 바로 진행해도 되는 안전 작업

아래는 코드 리뷰 없이 바로 진행 가능한 작업이다:

1. `lib/mes/colorUtils.ts` — `tint()` 헬퍼 신규 작성 (기존 코드 영향 없음)
2. `common/FilterChip.tsx` — 신규 컴포넌트 추가 (기존 코드 영향 없음)
3. `common/SlidePanel.tsx` — 신규 컴포넌트 추가 (기존 코드 영향 없음)
4. `HistoryTable.tsx` 로딩 텍스트 1줄 → `LoadingSkeleton` (1줄 변경)
5. `DesktopWeeklyReportView.tsx` "이번 주" span → `StatusPill` (5줄 변경)
6. `#f97316` 하드코딩 → LEGACY_COLORS orange (값만 교체)
7. `common/index.ts` FilterChip, SlidePanel export 추가

---

## 10. 아직 하면 안 되는 작업

| 작업 | 이유 |
|---|---|
| 모든 테이블 한 번에 공통화 | 입출고/재고 핵심 화면 — 회귀 위험 |
| 모든 버튼 한 번에 교체 | 전체 화면 영향, 스타일 회귀 위험 |
| DesktopWarehouseView 대형 리팩터링 | 입출고 흐름 핵심 화면 |
| StatusBadge/StatusPill 동시 통합 | 모바일 전체 화면 영향 (MES-COMP-002 일정 따름) |
| EmptyState 모바일/데스크톱 통합 | 모바일 화면 전체 영향 |
| Toast 전역 Provider 도입 | 전체 화면 상태 관리 변경 |

---

## 11. 최종 권장안

위험도 낮고 결과가 눈에 보이는 순서로 추천:

### Step 1 — 코드 추가만 (기존 화면 안 건드림)
```
FilterChip.tsx + SlidePanel.tsx + colorUtils.ts 신규 작성
→ TypeScript 타입 체크 통과 확인
```

### Step 2 — 주간보고 내부 정리
```
WeeklyGroupCards, WeeklySummaryBand에서 tint() 적용
→ 주간보고 탭 화면 동작 확인
```

### Step 3 — 명확한 미사용 공통 컴포넌트 교체
```
HistoryTable 로딩 텍스트 → LoadingSkeleton
"이번 주" span → StatusPill
→ 단순 치환, 시각 차이 없음
```

### Step 4 — InventoryFilterBar / HistoryFilterBar FilterChip 교체
```
인라인 Chip → common/FilterChip
→ 두 파일만 영향, UI 동일해야 함
```

### Step 5 — 슬라이딩 패널 교체
```
DesktopInventoryRightPanel / DesktopHistoryRightPanel → SlidePanel
→ 두 파일만 영향, 애니메이션 동일해야 함
```

이후는 KpiCard 통합(Phase 3) → 테이블/EmptyState 통합(Phase 4~5) 순서.

---

## 부록: 파일 참조 경로

### 즉시 교체 대상
- `frontend/app/legacy/_components/_inventory_sections/InventoryFilterBar.tsx`
- `frontend/app/legacy/_components/_history_sections/HistoryFilterBar.tsx`
- `frontend/app/legacy/_components/_history_sections/HistoryTable.tsx`
- `frontend/app/legacy/_components/DesktopWeeklyReportView.tsx` (줄 270)
- `frontend/app/legacy/_components/_inventory_sections/DesktopInventoryRightPanel.tsx`
- `frontend/app/legacy/_components/_history_sections/DesktopHistoryRightPanel.tsx`

### 신규 생성 대상
- `frontend/app/legacy/_components/common/FilterChip.tsx`
- `frontend/app/legacy/_components/common/SlidePanel.tsx`
- `frontend/lib/mes/colorUtils.ts`

### 기존 문서 참조
- [`docs/research/2026-05-02-common-modules-design.md`](2026-05-02-common-modules-design.md) — StatusPill/Toast/BottomSheet 통합 설계
- [`docs/research/2026-05-01-color-redundancy.md`](2026-05-01-color-redundancy.md) — 색상 산재 5개 위치 분석
- [`docs/research/2026-05-04-department-naming-policy.md`](2026-05-04-department-naming-policy.md) — 부서명 정규화 정책
