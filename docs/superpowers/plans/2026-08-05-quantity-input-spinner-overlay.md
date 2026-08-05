# 공통 수량 입력 스피너 오버레이 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**GOAL:** 공통 QuantityInput에 네이티브 증감 버튼을 오버레이로 복원하고 모든 사용처에서 숫자의 시각적 중앙 위치를 유지한다.

**Goal:** 공통 업무 수량 입력 21곳에 브라우저 기본 증감 버튼을 다시 표시하되, 기존 숫자 중심과 `QuantityStepper`의 빠른 조절 버튼 배치를 보존한다.

**Architecture:** `QuantityInput`의 단일 `<input type="number">` 구조와 각 사용처의 값·범위 계약은 그대로 둔다. 전역 `.quantity-input` 규칙에서 네이티브 스피너를 복원하고 오른쪽에 절대 배치해 텍스트 정렬 영역을 차지하지 않도록 한다.

**Tech Stack:** Next.js, React, TypeScript, CSS, Vitest, Testing Library, Chromium

---

## Execution Strategy

**추천 모델: GPT-5.6 Luna** - 공통 CSS 한 곳과 그 계약 테스트만 수정하는 좁고 기계적인 UI 작업입니다.

**추천 추론 수준: 중간** - 네이티브 브라우저 스피너의 배치와 실제 화면 회귀를 함께 확인해야 합니다.

**팀 구성: 불필요** - 테스트, CSS 구현, 브라우저 검증이 순차 의존하므로 단독 실행이 효율적입니다.

---

## 파일 구조

- Modify: `frontend/app/globals.css` — 공통 수량 입력의 네이티브 스피너 표시와 오버레이 배치를 정의한다.
- Modify: `frontend/app/mes/_components/common/__tests__/QuantityInput.test.tsx` — 전역 CSS가 숫자 중앙과 네이티브 오버레이 계약을 함께 지키는지 검증한다.
- Modify: `frontend/app/mes/_components/_warehouse_v2/__tests__/QuantityStepper.test.tsx` — 과거의 스피너 숨김 기대를 제거하고 공통 입력과 빠른 조절 버튼 유지 계약을 검증한다.
- Verify only: `frontend/app/mes/_components/common/QuantityInput.tsx` — 단일 number input과 공통 클래스 구조가 유지되는지 확인한다.
- Verify only: `frontend/app/mes/_components/_warehouse_v2/QuantityStepper.tsx` — 기존 `-10/-1/+1/+10` 버튼과 중앙 입력 구조가 유지되는지 확인한다.

### Task 1: 스피너 오버레이 CSS 계약 테스트 `[GPT-5.6 Luna] [순차]`

**Files:**
- Modify: `frontend/app/mes/_components/common/__tests__/QuantityInput.test.tsx`
- Read: `frontend/app/globals.css:870`

- [x] **Step 1: 전역 수량 입력 CSS를 읽는 테스트 도우미를 추가한다**

```tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function quantityInputStyles(): string {
  return readFileSync(resolve(process.cwd(), "app", "globals.css"), "utf8");
}
```

- [x] **Step 2: 네이티브 스피너가 레이아웃을 차지하지 않는 계약 테스트를 작성한다**

```tsx
it("overlays the native spinner without moving the centered number", () => {
  const css = quantityInputStyles();
  const inputRule = css.match(/\.quantity-input\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const spinnerRule = css.match(
    /\.quantity-input::\-webkit-inner-spin-button\s*\{([\s\S]*?)\}/,
  )?.[1] ?? "";

  expect(inputRule).toContain("position: relative");
  expect(inputRule).toContain("appearance: auto");
  expect(inputRule).toContain("text-align: center");
  expect(spinnerRule).toContain("position: absolute");
  expect(spinnerRule).toContain("inset-inline-end:");
  expect(spinnerRule).toContain("appearance: auto");
});
```

- [x] **Step 3: 새 테스트가 현재 구현에서 RED인지 확인한다**

Run:

```powershell
Set-Location frontend
npx vitest run app/mes/_components/common/__tests__/QuantityInput.test.tsx
```

Expected: `position: relative` 또는 `appearance: auto` 기대가 실패한다. 기존 CSS의 `appearance: textfield`와 `appearance: none` 때문에 실패해야 한다.

### Task 2: 네이티브 스피너 오버레이 구현 `[GPT-5.6 Luna] [순차]`

**Files:**
- Modify: `frontend/app/globals.css:870`
- Test: `frontend/app/mes/_components/common/__tests__/QuantityInput.test.tsx`
- Test: `frontend/app/mes/_components/_warehouse_v2/__tests__/QuantityStepper.test.tsx`

- [x] **Step 1: 입력 자체의 숫자 중앙 정렬을 유지하면서 스피너 기준점을 만든다**

```css
.quantity-input {
  position: relative;
  appearance: auto;
  color-scheme: light;
  border-color: var(--c-border);
  background: var(--c-s2);
  color: var(--c-text);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

:root[data-theme="dark"] .quantity-input {
  color-scheme: dark;
}
```

- [x] **Step 2: 안쪽 네이티브 스피너만 오른쪽 최상단 레이어에 절대 배치한다**

```css
.quantity-input::-webkit-inner-spin-button {
  /* Keep the native control above, not inside, the centered text layout. */
  position: absolute;
  inset-block: 4px;
  inset-inline-end: 4px;
  z-index: 1;
  margin: 0;
  appearance: auto;
}
```

The outer native spinner container is not hidden. This preserves the existing `text-align: center`, width, padding, radius, focus ring, disabled opacity, min/max/step, and all caller event handlers. No JSX wrapper or custom increment buttons are introduced.

- [x] **Step 3: 공통 입력 테스트가 GREEN인지 확인한다**

Run:

```powershell
Set-Location frontend
npx vitest run app/mes/_components/common/__tests__/QuantityInput.test.tsx
```

Expected: 모든 `QuantityInput` 테스트가 통과한다.

- [x] **Step 4: 기존 빠른 조절 버튼 계약이 유지되는지 확인한다**

기존 테스트의 `without native spinners` 기대를 `quantity-input` 공통 클래스와 `-10/-1/+1/+10` 버튼 유지 기대값으로 바꾼다. 이번 요구와 충돌하는 Tailwind 스피너 숨김 클래스는 기대하지 않는다.

Run:

```powershell
Set-Location frontend
npx vitest run app/mes/_components/_warehouse_v2/__tests__/QuantityStepper.test.tsx
```

Expected: `-10/-1/+1/+10` 버튼과 입력 동작 테스트가 모두 통과한다.

### Task 3: 실제 Chromium 화면과 영향 영역 검증 `[GPT-5.6 Luna] [순차]`

**Files:**
- Verify: `frontend/app/globals.css`
- Verify: `frontend/app/mes/_components/common/QuantityInput.tsx`
- Verify: `frontend/app/mes/_components/_warehouse_v2/QuantityStepper.tsx`

- [x] **Step 1: 정적 품질 검사를 실행한다**

Run:

```powershell
Set-Location frontend
npx eslint app/mes/_components/common/__tests__/QuantityInput.test.tsx app/mes/_components/common/QuantityInput.tsx app/mes/_components/_warehouse_v2/QuantityStepper.tsx --max-warnings=0
npx tsc --noEmit
```

Expected: 두 명령 모두 오류 없이 종료한다.

- [x] **Step 2: 프로덕션 CSS 컴파일을 확인한다**

Run:

```powershell
Set-Location frontend
npm run build
```

Expected: Next.js 프로덕션 빌드가 성공하며 CSS 의사 요소 선언 오류가 없다.

- [x] **Step 3: 입출고 4단계의 `기준 수량`을 Chromium에서 확인한다**

Open: `http://192.168.0.63:3001/mes?tab=warehouse&step=4`

Verify:

- 입력 오른쪽에 브라우저 기본 위·아래 화살표가 보인다.
- 위 화살표 클릭 시 `1 → 2`, 아래 화살표 클릭 시 `2 → 1`로 돌아온다.
- 숫자 `1`의 수평 중심은 변경 전과 동일하게 입력 상자의 중앙에 있다.
- 입력 상자 크기와 `-10/-1/+1/+10` 버튼의 위치·순서는 바뀌지 않는다.
- 비활성·최소값·최대값·step 계약은 기존 number input 동작을 유지한다.
- 확인 후 값은 원래 값으로 복원하고 저장하지 않는다.

- [x] **Step 4: 라이트·다크 표면에서 가림과 겹침을 확인한다**

Verify: 두 테마에서 화살표가 입력 배경과 구분되고, 숫자나 focus-visible 테두리를 가리지 않는다. 테마를 바꿨다면 확인 후 원래 테마로 복원한다.

- [x] **Step 5: 변경 범위와 공백 오류를 최종 확인한다**

Run:

```powershell
git diff --check
git diff -- frontend/app/globals.css frontend/app/mes/_components/common/__tests__/QuantityInput.test.tsx
```

Expected: 공백 오류가 없고, 변경은 공통 CSS 계약과 해당 테스트에만 한정된다. 커밋과 푸시는 수행하지 않는다.
