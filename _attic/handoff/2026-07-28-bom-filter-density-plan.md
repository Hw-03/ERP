# BOM 필터 밀도 조정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**GOAL:** BOM 상·하위 품목 필터의 칩 간격을 통일하고 표준 데스크톱 폭에서 하위 필터 가로 스크롤을 없앤다.

**Goal:** 필터 의미와 동작을 유지하면서 표준 관리자 BOM 화면의 상·하위 필터를 같은 밀도로 정돈한다.

**Architecture:** 기존 `BomParentList`와 `BomChildAddBox`의 필터 마크업은 유지한다. Tailwind 간격 클래스만 최소 변경하고, 더 좁은 폭을 위한 하위 행의 가로 스크롤 폴백은 보존한다.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest, Testing Library

---

## Execution Strategy

**추천 모델: GPT-5.6 Luna** — 두 컴포넌트의 제한된 스타일 클래스와 회귀 테스트만 수정하는 좁은 작업이다.

**추천 추론 수준: 중간** — 실제 폭 측정값을 바탕으로 스크롤 임계값과 두 패널의 시각 일관성을 함께 확인해야 한다.

**팀 구성: 불필요** — 테스트가 구현보다 먼저 필요한 단일 순차 변경이며 같은 파일군을 다룬다.

---

### Task 1: 필터 밀도 회귀 테스트 `[GPT-5.6 Luna] [순차]`

**Files:**
- Modify: `frontend/app/mes/_components/_admin_sections/_bom_workbench/__tests__/BomTableLists.test.tsx`

- [x] **Step 1: 압축된 공통 칩 문법을 요구하는 테스트 작성**

  상위 필터 행에는 `items-center`, `flex-nowrap`, `gap-1.5`를 요구하고 각 칩에는 `whitespace-nowrap`, `px-2`, `py-1`, `text-xs`를 요구한다. 하위 전체 행에는 `gap-1`, 단계·공정 그룹에는 `gap-1.5`를 요구한다. 공정 그룹에는 `ml-1.5`, `border-l`, `pl-3`을 요구하고 바깥 래퍼에는 `shrink-0`을 요구해 `ml-auto`가 남는 폭을 그룹 사이에 몰아넣지 못하게 한다. 하위 스크롤 컨테이너의 `overflow-x-auto`는 계속 요구한다.

- [x] **Step 2: 테스트가 기존 10px 패딩과 6px 간격 때문에 실패하는지 확인**

  Run: `cd frontend; npx vitest run app/mes/_components/_admin_sections/_bom_workbench/__tests__/BomTableLists.test.tsx`

  Expected: 새 간격 클래스 단언만 실패하고 기존 필터 교집합·선택 테스트는 통과한다.

### Task 2: 상·하위 필터 간격 통일 `[GPT-5.6 Luna] [순차]`

**Files:**
- Modify: `frontend/app/mes/_components/_admin_sections/_bom_workbench/BomParentList.tsx`
- Modify: `frontend/app/mes/_components/_admin_sections/_bom_workbench/BomChildAddBox.tsx`

- [x] **Step 1: 상위 필터 행 압축**

  필터 행을 `flex flex-nowrap items-center gap-1.5`로 바꾸고 칩을 `whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold transition-colors`로 맞춘다. 건수의 `ml-auto` 정렬은 유지한다.

- [x] **Step 2: 하위 필터 행 압축**

  전체 행은 `gap-1`, 두 그룹은 `gap-1.5`로 두고 모든 칩의 좌우 패딩을 `px-2`로 줄인다. 공정 그룹은 `ml-1.5 ... border-l pl-3`, 바깥 래퍼는 `shrink-0`으로 바꾼다. `overflow-x-auto`, `w-max`, `min-w-full`, 단계 왼쪽·공정 오른쪽 순서는 유지한다.

- [x] **Step 3: 관련 테스트와 타입 검사 실행**

  Run: `cd frontend; npx vitest run app/mes/_components/_admin_sections/_bom_workbench/__tests__/BomTableLists.test.tsx`

  Run: `cd frontend; npx tsc --noEmit`

  Expected: 두 명령 모두 exit code 0.

### Task 3: 실제 폭과 최종 프런트 게이트 검증 `[GPT-5.6 Luna] [순차]`

**Files:**
- Verify only: `frontend/app/mes/_components/_admin_sections/_bom_workbench/BomParentList.tsx`
- Verify only: `frontend/app/mes/_components/_admin_sections/_bom_workbench/BomChildAddBox.tsx`

- [x] **Step 1: 인앱 브라우저의 표준 관리자 BOM 화면에서 폭 측정**

  하위 필터 스크롤 컨테이너에서 `scrollWidth <= clientWidth`인지 확인한다. 상·하위 칩의 계산된 글자 크기·높이·좌우 패딩이 각각 12px·26px·8px로 일치하고, 칩 사이 간격은 6px인지 확인한다. 공정 필터 오른쪽 잔여 폭은 반올림 오차 수준인지 확인한다.

- [x] **Step 2: 시각·동작 확인**

  상위 필터의 건수가 오른쪽에 유지되고, 단계 필터가 왼쪽, 구분선, 공정 필터가 오른쪽 순서인지 확인한다. 단계와 공정 필터를 눌러 교집합 동작이 유지되는지 읽기 전용 화면 상태로 확인한다.

- [x] **Step 3: 최종 프런트 게이트 실행**

  Run: `powershell -ExecutionPolicy Bypass -File .\\scripts\\dev\\verify_local.ps1 -Mode frontend`

  Expected: strict lint, type check, frontend tests and coverage가 모두 exit code 0.

프로젝트 규칙에 따라 커밋과 푸시는 사용자가 별도로 요청하지 않는 한 수행하지 않는다.
