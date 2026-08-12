# 데스크톱 업무 허브 카드 호버·타이포 통일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**추천 모델: GPT-5.6 Luna** — 공통 React 컴포넌트와 전역 CSS의 좁은 시각 회귀 수정입니다.

**추천 추론 수준: 중간** — 라이트·다크 테마와 세 화면 공유 영향을 함께 확인해야 합니다.

**팀 구성: 불필요** — 테스트와 구현이 같은 공통 컴포넌트에 순차적으로 의존하므로 단독 실행이 효율적입니다.

**GOAL:** 창고·불량·출하 업무 허브 카드의 라이트 모드 호버 대비를 복원하고 설명 글자를 20px로 통일한다.

**Goal:** 데스크톱 창고·불량·출하 진입 카드가 라이트·다크 모드에서 또렷한 호버 피드백을 유지하고, 모든 설명이 사용자가 지정한 창고 카드의 20px 크기로 표시되게 합니다.

**Architecture:** 세 화면이 이미 공유하는 `DesktopWorkHubCard`를 단일 수정 지점으로 유지합니다. 컴포넌트는 공통 호버 클래스를 사용하고, `globals.css`가 라이트 모드에서는 살짝 어둡게, 다크 모드에서는 기존처럼 밝게 필터를 적용합니다.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 3, Vitest, Testing Library, Next.js 14

---

## Execution Strategy

**추천 모델: GPT-5.6 Luna** — 동작 흐름이나 데이터 변경 없이 공통 스타일 계약만 교정합니다.

**추천 추론 수준: 중간** — 공유 컴포넌트의 두 테마·세 소비 화면 회귀를 판별할 수준이면 충분합니다.

**팀 구성: 불필요** — 한 컴포넌트와 인접 CSS·테스트가 같은 계약을 다루므로 병렬 편집 이점이 없습니다.

---

### Task 1: 공통 카드 스타일 계약 회귀 테스트 `[GPT-5.6 Luna] [순차]`

**Files:**
- Modify: `frontend/app/mes/_components/common/__tests__/DesktopWorkHubCard.test.tsx`
- Test: `frontend/app/mes/_components/common/__tests__/DesktopWorkHubCard.test.tsx`

- [x] **Step 1: 호버 클래스와 기본 크기 설명 타이포의 실패 테스트 추가**

```tsx
expect(card).toHaveClass("desktop-work-hub-card");
expect(card).not.toHaveClass("hover:brightness-110");
expect(screen.getByText("창고와 부서 간 재고를 이동합니다.")).toHaveClass("text-xl");
```

- [x] **Step 2: 큰 카드와 기본 카드의 설명 크기가 같은지 검증하는 테스트 추가**

```tsx
render(
  <DesktopWorkHubCard
    icon={PackageCheck}
    title="출하 관리"
    description="요청 생성부터 준비 체크, 픽업 완료까지 이어서 처리합니다."
    tone="var(--c-blue)"
    onClick={() => {}}
  />,
);

expect(
  screen.getByText("요청 생성부터 준비 체크, 픽업 완료까지 이어서 처리합니다."),
).toHaveClass("text-xl");
```

- [x] **Step 3: 대상 테스트가 현재 구현에서 올바른 이유로 실패하는지 확인**

Run: `cd frontend; npm test -- app/mes/_components/common/__tests__/DesktopWorkHubCard.test.tsx`

Expected: `desktop-work-hub-card`와 기본 카드의 `text-xl` 기대가 충족되지 않아 FAIL.

### Task 2: 테마별 호버와 설명 20px 통일 `[GPT-5.6 Luna] [순차]`

**Files:**
- Modify: `frontend/app/mes/_components/common/DesktopWorkHubCard.tsx:38-64`
- Modify: `frontend/app/globals.css`의 `@layer components` 공통 카드 스타일 영역
- Test: `frontend/app/mes/_components/common/__tests__/DesktopWorkHubCard.test.tsx`

- [x] **Step 1: 공통 카드에 전용 호버 클래스를 적용하고 고정 밝기 유틸 제거**

```tsx
className={`desktop-work-hub-card no-btn-inset flex h-full min-h-0 min-w-0 flex-col items-start justify-between gap-6 rounded-[22px] border p-7 text-left transition-all active:scale-[0.99] xl:p-8 ${className ?? ""}`}
```

- [x] **Step 2: 설명 타이포를 크기 변형과 무관한 20px로 통일**

```tsx
<span
  className="mt-auto text-xl font-black leading-tight"
  style={{ color: active ? tone : LEGACY_COLORS.muted2 }}
>
  {description}
</span>
```

- [x] **Step 3: 테마별 호버 필터 추가**

```css
.desktop-work-hub-card:hover {
  filter: brightness(0.94);
}

:root[data-theme="dark"] .desktop-work-hub-card:hover {
  filter: brightness(1.15);
}
```

- [x] **Step 4: 대상 테스트 통과 확인**

Run: `cd frontend; npm test -- app/mes/_components/common/__tests__/DesktopWorkHubCard.test.tsx`

Expected: PASS.

### Task 3: 회귀·화면 검증 `[GPT-5.6 Luna] [순차]`

**Files:**
- Verify: `frontend/app/mes/_components/common/DesktopWorkHubCard.tsx`
- Verify: `frontend/app/globals.css`
- Verify: `frontend/app/mes/_components/common/__tests__/DesktopWorkHubCard.test.tsx`

- [x] **Step 1: 프론트엔드 최종 게이트 실행**

Run: `powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode frontend`

Expected: lint, test, build를 포함한 프론트엔드 검증 PASS.

- [x] **Step 2: 라이트 모드의 세 진입 화면 확인**

브라우저에서 `/mes?tab=warehouse`, `/mes?tab=defect`, `/mes?tab=shipping`을 차례로 열어 모든 설명의 계산된 글자 크기가 `20px`인지 확인합니다. 각 카드에 호버해 계산된 필터가 `brightness(0.94)`이고 카드 경계가 주변 표면과 구분되는지 확인합니다.

- [x] **Step 3: 다크 모드 회귀 확인**

설정에서 다크 모드로 전환한 뒤 같은 세 화면에서 계산된 호버 필터가 `brightness(1.15)`이고 밝아지는 피드백이 또렷한지 확인한 후 원래 테마로 복원합니다.

- [x] **Step 4: 변경 범위와 디자인 규칙 확인**

Run: `git diff --check; git diff -- frontend/app/mes/_components/common/DesktopWorkHubCard.tsx frontend/app/mes/_components/common/__tests__/DesktopWorkHubCard.test.tsx frontend/app/globals.css`

Expected: 인라인 hex 추가, 44px 미만 클릭 영역, 동결 파일 수정, 무관한 변경이 없음. 사용자가 커밋을 요청하지 않았으므로 커밋·푸시는 수행하지 않음.
