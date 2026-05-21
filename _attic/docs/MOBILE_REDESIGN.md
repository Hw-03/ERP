# 모바일 UI 전체 개편 계획

> 전체 계획 정본: 이 파일 (구현 기준)
> Claude가 goal-driven 방식으로 순서대로 실행하고 자율 검증합니다.

## Context

현재 MES 시스템은 이미 `MobileShell`이 구현되어 있고 (`lg:hidden` ↔ `DesktopLegacyShell lg:flex`로 분리), 대부분의 화면도 구현되어 있다. 하지만 두 가지 문제가 있다:

1. **화면 너비 미활용**: `MobileShell`에 `sm:max-w-[430px]` + `sm:bg-black` 제한이 걸려 있고, 각 화면이 `px-4` 패딩으로 가로 공간을 낭비함
2. **미구현 기능**: 불량 격리("데스크탑 사용" 토스트만), BOM Workbench(`PlaceholderScreen`)

목표: 화면 넓게 활용 + 미구현 기능 2개 완성

---

## 작업 범위 및 파일 목록

### Phase 1 — 기반 너비 해제 (2개 파일)

**변경 파일:**
- `frontend/app/legacy/_components/mobile/MobileShell.tsx`
- `frontend/lib/ui/BottomSheet.tsx`

**변경 내용:**

```
MobileShell.tsx:
  - 최상위 div: sm:bg-black sm:max-w-[430px] sm:shadow-[...] 제거
  - 결과: 어떤 화면 크기에서도 full-width

BottomSheet.tsx:
  - max-w-[430px] → max-w-full (또는 제거)
  - 결과: BottomSheet도 화면 전체 폭 사용
```

---

### Phase 2 — 화면별 레이아웃 조정 (7개 파일)

모든 화면에서 `px-4` → `px-3`, `gap-4` → `gap-3`, `gap-2` → `gap-1.5`로 밀도 향상. 로직 변경 없음.

#### 2-1. HomeScreen
파일: `frontend/app/legacy/_components/mobile/screens/HomeScreen.tsx`

| 현재 | 변경 |
|------|------|
| `px-4 py-4` | `px-3 py-3` |
| `gap-4` (섹션 간) | `gap-3` |
| `QuickActionGrid columns={2}` | `grid-cols-2 sm:grid-cols-4` 반응형 |
| HistoryLogRow `px-4` | `px-3` |

#### 2-2. InventoryScreen
파일: `frontend/app/legacy/_components/mobile/screens/InventoryScreen.tsx`  
파일: `frontend/app/legacy/_components/mobile/screens/_inventory_parts/InventoryStickyHeader.tsx`

| 현재 | 변경 |
|------|------|
| `px-4 pt-3` (목록) | `px-3 pt-3` |
| KPI `grid-cols-3 gap-2` | `gap-1.5` |
| StickyHeader `px-4` | `px-3` |
| SummaryChipBar `px-4` | `px-3` |

#### 2-3. HistoryScreen
파일: `frontend/app/legacy/_components/mobile/screens/HistoryScreen.tsx`

| 현재 | 변경 |
|------|------|
| `px-4 pb-6 pt-3` | `px-3 pb-6 pt-3` |
| KPI 수치: `inSum/outSum`(수량합) | `receiveCount/shipCount`(건수) — 데스크탑과 통일 |
| KPI `gap-2` | `gap-1.5` |
| HistoryLogRow `px-4` | `px-3` |

#### 2-4. WeeklyReportScreen
파일: `frontend/app/legacy/_components/mobile/screens/WeeklyReportScreen.tsx`

| 현재 | 변경 |
|------|------|
| `px-4 py-4` | `px-3 py-3` |
| KPI `gap-2` | `gap-1.5` |
| 매트릭스 음수마진 `-mx-4` | `-mx-3` |
| `ProductionMatrixCard w-[160px]` | `w-[180px]` (더 넓게) |
| GroupCard/ItemDeltaRow `px-4` | `px-3` |

#### 2-5. AdminHomeScreen
파일: `frontend/app/legacy/_components/mobile/screens/admin/AdminHomeScreen.tsx`  
파일: `frontend/app/legacy/_components/mobile/screens/admin/AdminShell.tsx`

| 현재 | 변경 |
|------|------|
| `px-4 py-4 gap-3` | `px-3 py-3 gap-2` |
| 섹션 콘텐츠 `px-4 pt-4` | `px-3 pt-3` |

#### 2-6. MoreScreen
파일: `frontend/app/legacy/_components/mobile/screens/MoreScreen.tsx`

| 현재 | 변경 |
|------|------|
| `px-4 py-4 gap-4` | `px-3 py-3 gap-3` |
| MoreMenuRow `px-4 py-4` | `px-3 py-3` |
| 담당자 카드 `px-4 py-4` | `px-3 py-3` |

#### 2-7. IoHubScreen — 레이아웃 조정 부분
파일: `frontend/app/legacy/_components/mobile/screens/_io_parts/IoHubScreen.tsx`

| 현재 | 변경 |
|------|------|
| `ComposeLanding` 카드 `px-4` | `px-3` |
| SegmentedControl `px-4 pt-2 pb-2` | `px-3 pt-2 pb-2` |

---

### Phase 3 — 미구현 기능 완성 (3개 파일)

#### 3-1. BOM Workbench 모바일 연결

현황: `MoreScreen`에서 BOM Workbench 클릭 → `PlaceholderScreen` ("Phase 6, 데스크탑에서 사용")

목표: 클릭 시 Admin 탭의 BOM 섹션으로 딥링크 (AdminBomSection이 이미 완전 구현됨)

**변경 파일: `frontend/app/legacy/_components/mobile/screens/MoreScreen.tsx`**
```ts
// 현재
{ label: "BOM 워크벤치", ..., action: () => setSub({ kind: "placeholder", key: "bom" }) }

// 변경: admin 탭으로 이동 + BOM 섹션 자동 선택
{ label: "BOM 워크벤치", ..., action: () => onChangeTab("admin") }
```

단순화: PIN 인증은 AdminShell 내 PinLock에서 처리되므로 MoreScreen 변경은 1줄.

#### 3-2. 불량 격리 (defective-register) 모바일 구현

현황: `IoHubScreen` `ComposeLanding`에서 `defective-register` 선택 시 `showToast("데스크탑에서 처리해 주세요")` 후 종료

목표: 데스크탑과 동일한 `IoComposeView`를 불량 격리 초기 상태로 열기

**변경 파일 1: `frontend/app/legacy/_components/_warehouse_v2/useIoWorkState.ts`**
```ts
// 현재: initialWorkType 없음
export function useIoWorkState() { ... }

// 변경: initialWorkType?: IoWorkType 파라미터 추가
export function useIoWorkState(initialWorkType?: IoWorkType) {
  const [workType, setWorkType] = useState<IoWorkType | null>(initialWorkType ?? null);
  ...
}
```

**변경 파일 2: `frontend/app/legacy/_components/_warehouse_v2/IoComposeView.tsx`**
```ts
// 현재 props에 defaultWorkType 없음
export function IoComposeView({ globalSearch, operator, ... })

// 변경: defaultWorkType prop 추가, useIoWorkState에 전달
export function IoComposeView({ globalSearch, operator, defaultWorkType, ... }) {
  const workState = useIoWorkState(defaultWorkType);
  ...
}
```

**변경 파일 3: `frontend/app/legacy/_components/mobile/screens/_io_parts/IoHubScreen.tsx`**
```ts
// 현재 subView 없음, defective-register에서 showToast만

// 변경:
type SubView = "landing" | "wizard" | "defect";
const [subView, setSubView] = useState<SubView>("landing");

// ComposeLanding의 defective-register case:
case "defective-register":
  setSubView("defect"); // 토스트 제거
  break;

// 렌더 추가:
{tab === "compose" && subView === "defect" && (
  <IoComposeView
    globalSearch=""
    operator={operator}
    items={items}          // useItems() 또는 상위에서 주입
    onStatusChange={() => {}}
    onSubmitSuccess={() => setSubView("landing")}
    defaultWorkType="defect"
  />
)}
```

items 공급: `IoHubScreen` 내부에서 `useItems()` (또는 동등한 훅) 직접 호출.

---

## 에이전트 팀 구조

Claude가 실행자 역할만 맡고, **판정은 독립 에이전트 3개**가 담당합니다.

- **Review 에이전트**: PNG 스크린샷 시각 판정 + measurements.json 수치 판정
- **Accessibility 에이전트**: axe-core WCAG AA 구조 검증
- **Performance 에이전트**: Lighthouse FPS/CLS/LCP 측정

---

## 정량적 평가 기준 (VALIDATION_CRITERIA)

모든 기준은 측정 명령어로 검증 가능.

### Padding 기준
| 측정 대상 | 기대값 | 기준 |
|---|---|---|
| 모든 화면 컨테이너 padding-left | **12px** | 11≤Math.round(px)≤13 → ✅ |
| 모든 화면 컨테이너 padding-right | **12px** | 11≤Math.round(px)≤13 → ✅ |

### 터치 타겟 기준
| UI 요소 | 최소 height |
|---|---|
| 하단 탭바 버튼 | 48px |
| InventoryScreen ItemRow | 56px |
| MoreMenuRow 항목 | 52px |
| ComposeLanding 작업유형 카드 | 64px |
| AdminHomeScreen 섹션 카드 | 56px |

### 텍스트 클리핑 기준
- ❌: 텍스트가 카드 우측 경계에서 `...` 없이 갑자기 잘림
- ✅: `...` 으로 끝나거나 여백 안에서 완전 표시

### Full-width 기준 (Phase 1 핵심)
| 측정 대상 | 기대값 |
|---|---|
| MobileShell 최상위 div 너비 (768px) | **768px** |
| BottomSheet 너비 (768px) | **768px** |

---

## 단계 진행 조건

### 판정 분류
| 기호 | 의미 |
|---|---|
| ✅ | 기준 충족 → 진행 |
| ⚠️ | 기준 미달이지만 UX 치명적 아님 → 기록 후 진행 |
| ❌ | 기준 미달, UX 치명적 → 수정 후 재검증 |

### Phase별 진행 조건
```
Phase 1: MobileShell + BottomSheet width 768px ✅
Phase 2: padding 12px ✅, 터치타겟 ≥ 48px ✅, 텍스트 클리핑 ❌
Phase 3: BOM/불량격리 ✅, TypeScript 0건 ✅
```

---

## 재시도 프로토콜 (RETRY_PROTOCOL)

**원칙: 사용자 개입 없음.** Claude가 모든 재시도와 판단을 자율 처리.

```
[Task 실패 시]
  1. Review 에이전트 피드백 수신
  2. ❌ 항목 구체적 수정 지시 파악
  3. Claude가 코드 수정 실행
  4. Playwright 스크린샷 재생성
  5. Review 에이전트 재검증
  6. ✅면 진행, ❌면 재시도

[최대 시도]
  - Task당 최대 5회
  - 5회 후에도 ❌면 ⚠️로 다운그레이드 후 진행
  - 이 결정은 Claude가 자율 판단

[⚠️ 누적]
  - 무제한 기록하고 계속 진행
  - 최종 PR 코멘트에 정리

[의견 불일치]
  - Claude가 더 엄격한 기준(❌) 채택 후 진행
```

---

## 자동화 검증 도구

### 1. Playwright 스크린샷
파일: `frontend/scripts/mobile-screenshot.mjs`

393px (phone) + 768px (tablet), 전체 7화면 캡처.

### 2. axe-core 접근성 스캔
파일: `frontend/scripts/mobile-a11y.mjs`

WCAG AA 구조 위반 보고.

### 3. CSS 계산값 → measurements.json
Playwright `page.evaluate()`로 computed style 측정 후 저장.

**판정 우선순위**: JSON 수치가 정본 — PNG 시각이 "괜찮아도" JSON 수치 위반 시 ❌.

### 4. pixelmatch 회귀 비교
Phase 1 완료 후 baseline 저장 → Phase 2/3 체크 시 비교.

### 5. Lighthouse 성능 측정
FPS/CLS/LCP 측정:
- FPS: baseline 대비 5% 이상 하락 → ❌ (상대값)
- CLS: 0 초과 → ❌ (절대값)
- LCP: ≥ 2.5s → ❌ (절대값)

### 6. TypeScript + Lint
```powershell
cd frontend; npx tsc --noEmit      # 0건
cd frontend; npx next lint --max-warnings=0  # 0건
```

---

## 작업 순서 (자율 체크포인트)

```
[사전] Playwright + axe-core 스크립트 작성
[Phase 1] MobileShell/BottomSheet width 해제 → 체크포인트 1 ✅
[Phase 2] 7개 화면 padding 조정 (순차) → 체크포인트 2 ✅
[Phase 3] BOM + 불량격리 구현 → 체크포인트 3 ✅
[최종] PR 생성 및 merge
```

---

## Branch/PR 전략

```
브랜치: feat/mobile-ui-overhaul (단일 브랜치)

커밋 시점:
  - Phase 0: Playwright 스크립트
  - Phase 1: MobileShell/BottomSheet 수정
  - Phase 2: Task별 7개 커밋 (TypeScript 통과 직후)
  - Phase 3: Task별 2개 커밋

커밋 메시지 형식:
  "2026-05-XX mobile: Task X-Y — 요약"

PR: feat/mobile-ui-overhaul → main (Phase 3 완료 후 1개)
```

---

## 엣지 케이스

Review 에이전트는 기본 데이터뿐 아니라 아래 시나리오도 확인:

| 케이스 | 판정 기준 |
|---|---|
| 긴 품목명 (30자+) | truncate(...) 또는 완전 표시. clipping 없음 |
| 빈 상태 | EmptyState 컴포넌트 표시 |
| 로딩 상태 | skeleton 또는 spinner 표시 |
| 큰 숫자 (9,999,999) | 숫자 잘리지 않음 |
| 한글 + 영문 혼용 | 텍스트 overflow 없음 |

---

## 최종 Merge 기준

체크포인트 3 전부 합격 후:

1. 합격 기록 정리 (에이전트 판정 PR 코멘트 첨부)
2. 문서 업데이트 (docs/주간보고.md)
3. PR 생성 (feat/mobile-ui-overhaul → main)
4. CI 전체 통과 확인 → main merge 자동 진행
