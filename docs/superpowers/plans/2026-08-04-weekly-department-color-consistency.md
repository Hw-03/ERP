# 주간보고 부서색 일관성 수정 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**GOAL:** 주간보고에서 부서색과 증감 상태색을 분리해, 카드와 생산 매트릭스가 관리자 부서색 및 다크모드 표시 규칙을 일관되게 따르게 한다.

**Goal:** 감소한 조립 공정도 카드 정체성은 파란 부서색으로 유지하고, 감소 수치만 빨강으로 표시한다.

**Architecture:** 동결 예외는 `WeeklyGroupCards`와 `WeeklyProductionMatrix` 두 표시 컴포넌트로 한정한다. 두 컴포넌트는 `useDeptColorLookup()`을 통해 DB 원본색과 테마별 표시 변환을 받고, 증감은 숫자 색만 의미색으로 표현한다.

**Tech Stack:** React, TypeScript, Vitest, Testing Library

---

## Execution Strategy

**추천 모델: GPT-5.6 Terra** - 동결 예외의 표시 규칙과 부서색 데이터 경로를 함께 검증해야 합니다.

**추천 추론 수준: 높음** - 상태색과 부서색의 책임을 분리하고 테마 회귀를 확인해야 합니다.

**팀 구성: 단독** - 동일한 두 컴포넌트와 테스트가 순차적으로 연결됩니다.

---

### Task 1: 주간보고 부서색 회귀 테스트 `[GPT-5.6 Terra | 순차]`

**Files:**

- Create: `frontend/app/mes/_components/_weekly_sections/__tests__/WeeklyGroupCards.test.tsx`
- Create: `frontend/app/mes/_components/_weekly_sections/__tests__/WeeklyProductionMatrix.test.tsx`

- [ ] **Step 1: 감소한 조립 카드의 부서색 테스트를 작성한다.**

```tsx
vi.mock("../../DepartmentsContext", () => ({
  useDeptColorLookup: () => () => "#3b82f6",
}));

it("keeps an assembly card blue when its weekly delta is negative", () => {
  render(<WeeklyGroupCards groups={[assemblyDecrease]} selected="AF" onSelect={() => undefined} />);
  expect(screen.getByRole("button", { name: /조립/ })).toHaveStyle({ borderColor: "#3b82f6" });
  expect(screen.getByText("-8")).toHaveStyle({ color: "var(--c-red)" });
});
```

- [ ] **Step 2: 관리자 지정 부서색을 생산 매트릭스가 쓰는 테스트를 작성한다.**

```tsx
vi.mock("../../DepartmentsContext", () => ({
  useDeptColorLookup: () => (name: string) => (name === "조립" ? "#123456" : "#475569"),
}));

it("uses the shared department display color for the assembly matrix column", () => {
  render(<WeeklyProductionMatrix rows={[matrixRow]} />);
  expect(screen.getByRole("columnheader", { name: "조립" }).getAttribute("style")).toContain("#123456");
});
```

- [ ] **Step 3: 대상 테스트를 실행해 현재 동작에서 실패를 확인한다.**

Run: `npm test -- app/mes/_components/_weekly_sections/__tests__/WeeklyGroupCards.test.tsx app/mes/_components/_weekly_sections/__tests__/WeeklyProductionMatrix.test.tsx`

Expected: 조립 감소 카드의 빨간 테두리와 생산 매트릭스의 fallback 색 때문에 실패한다.

### Task 2: 부서 정체성과 증감 상태를 분리한다 `[GPT-5.6 Terra | 순차]`

**Files:**

- Modify: `frontend/app/mes/_components/_weekly_sections/WeeklyGroupCards.tsx`
- Modify: `frontend/app/mes/_components/_weekly_sections/WeeklyProductionMatrix.tsx`

- [ ] **Step 1: 공정 카드가 공통 부서색 조회를 사용하도록 바꾼다.**

```tsx
import { useDeptColorLookup } from "../../DepartmentsContext";

const getDeptColor = useDeptColorLookup();
const accentColor = getDeptColor(g.dept_name);

const deltaColor = g.delta > 0 ? LEGACY_COLORS.green : g.delta < 0 ? LEGACY_COLORS.red : ZERO_FADE;
```

카드 배경, 선택 테두리, 왼쪽 바, 공정 코드 배지는 `accentColor`만 사용한다. `deltaColor`은 증감 숫자에만 사용한다.

- [ ] **Step 2: 생산 매트릭스가 같은 공통 조회를 사용하도록 바꾼다.**

```tsx
import { useDeptColorLookup } from "../../DepartmentsContext";

const getDeptColor = useDeptColorLookup();
const deptColor = getDeptColor(c.dept);
```

헤더와 데이터 셀의 기존 `color-mix` 비율은 유지하고, 입력 색상만 fallback 직접 호출에서 공통 표시색으로 바꾼다.

- [ ] **Step 3: 대상 테스트를 다시 실행해 통과를 확인한다.**

Run: `npm test -- app/mes/_components/_weekly_sections/__tests__/WeeklyGroupCards.test.tsx app/mes/_components/_weekly_sections/__tests__/WeeklyProductionMatrix.test.tsx`

Expected: 두 파일의 테스트가 모두 통과한다.

### Task 3: 동결 예외 검증 `[GPT-5.6 Terra | 순차]`

**Files:**

- Verify: `frontend/app/mes/_components/_weekly_sections/WeeklyGroupCards.tsx`
- Verify: `frontend/app/mes/_components/_weekly_sections/WeeklyProductionMatrix.tsx`

- [ ] **Step 1: lint와 프런트엔드 전체 게이트를 실행한다.**

Run: `npm run lint:strict` and `powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode frontend`

Expected: 종료 코드 0.

- [ ] **Step 2: 3002 주간보고에서 조립(AF) 카드와 생산 매트릭스를 확인한다.**

Expected: 조립 카드의 부서 강조는 파란 계열이며, `-8` 수치만 빨강으로 남는다. 관리자 부서색 변경값도 두 영역에 같은 계열로 반영된다.

- [ ] **Step 3: 커밋은 사용자 요청 전 수행하지 않는다.**
