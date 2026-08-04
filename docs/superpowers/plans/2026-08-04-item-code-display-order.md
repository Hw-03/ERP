**추천 모델: GPT-5.6 Luna** - 프런트엔드 공용 정렬 유틸과 단일 품목 관리 폼을 일관되게 수정하는 좁은 범위입니다.
**추천 추론 수준: 중간** - 슬롯·표시 순서와 저장 규칙을 분리해 동일한 기호 정렬 규칙을 보장해야 합니다.

# 품목코드 표시 정렬 통일 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**GOAL:** 품목 관리의 모델 선택과 품목코드 미리보기를 제품기호 오름차순으로 통일하고, 재사용 가능한 프런트엔드 규칙으로 보장한다.

**Goal:** 선택 모델의 슬롯·관리 화면 표시 순서·클릭 순서와 무관하게 모델 칩과 품목코드 미리보기가 실제 저장 규칙과 같은 제품기호 오름차순을 사용한다.

**Architecture:** `frontend/lib/mes/`에 순수 정렬·접두어 생성 유틸리티를 둔다. 품목 관리 폼은 이 유틸리티로 모델 칩 목록과 미리보기 접두어를 모두 계산해 화면 규칙을 한 곳에 고정한다.

**Tech Stack:** TypeScript, React, Vitest, Testing Library

---

## Execution Strategy

**추천 모델: GPT-5.6 Luna** - 변경 파일이 프런트엔드 유틸·단일 컴포넌트·테스트로 한정됩니다.

**추천 추론 수준: 중간** - 프런트엔드 표시가 백엔드 저장 규칙과 정확히 같아야 합니다.

**팀 구성: 솔로** - 공용 유틸 테스트와 컴포넌트 적용이 순차 의존하므로 병렬 작업 이점이 없습니다.

---

## File Structure

- Create: `frontend/lib/mes/item-code.ts` — 제품기호 오름차순 정렬과 모델 조합 접두어 생성의 순수 함수.
- Create: `frontend/lib/mes/__tests__/item-code.test.ts` — 표시 순서와 슬롯 순서가 달라도 기호 순서를 보장하는 회귀 테스트.
- Modify: `frontend/app/mes/_components/_admin_sections/_master_items_parts/ItemFormFields.tsx` — 공용 유틸로 모델 칩과 코드 미리보기를 계산.
- Modify: `frontend/app/mes/_components/_admin_sections/_master_items_parts/__tests__/ItemFormFields.test.tsx` — 실제 폼의 칩 순서와 코드 미리보기 회귀 테스트.

### Task 1: 제품기호 정렬 공용 유틸 `[GPT-5.6 Luna | 병렬 불가]`

**Files:**
- Create: `frontend/lib/mes/item-code.ts`
- Test: `frontend/lib/mes/__tests__/item-code.test.ts`

- [ ] **Step 1: 실패하는 순수 함수 테스트 작성**

```ts
it("슬롯과 표시 순서가 달라도 제품기호 오름차순으로 모델을 정렬한다", () => {
  const models = [
    { slot: 4, symbol: "4", model_name: "ADX4000W", is_reserved: false },
    { slot: 3, symbol: "8", model_name: "SOLO", is_reserved: false },
    { slot: 1, symbol: "3", model_name: "DX3000", is_reserved: false },
  ];

  expect(sortModelsBySymbol(models).map((model) => model.symbol)).toEqual(["3", "4", "8"]);
  expect(modelSlotsToSymbolPrefix([1, 3, 4], models)).toBe("348");
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend; npm test -- lib/mes/__tests__/item-code.test.ts`

Expected: `Failed to resolve import` 또는 `sortModelsBySymbol is not a function`.

- [ ] **Step 3: 최소 공용 유틸 구현**

```ts
import type { ProductModel } from "@/lib/api";

export function sortModelsBySymbol(models: ProductModel[]): ProductModel[] {
  return [...models].sort((left, right) =>
    (left.symbol ?? "").localeCompare(right.symbol ?? ""),
  );
}

export function modelSlotsToSymbolPrefix(slots: number[], models: ProductModel[]): string {
  const symbolBySlot = new Map(models.map((model) => [model.slot, model.symbol]));
  return slots
    .map((slot) => symbolBySlot.get(slot))
    .filter((symbol): symbol is string => typeof symbol === "string" && symbol.length > 0)
    .sort()
    .join("");
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend; npm test -- lib/mes/__tests__/item-code.test.ts`

Expected: 1 test passed.

### Task 2: 품목 관리 폼에 공용 규칙 적용 `[GPT-5.6 Luna | 병렬 불가]`

**Files:**
- Modify: `frontend/app/mes/_components/_admin_sections/_master_items_parts/ItemFormFields.tsx:67-75, 186-218`
- Test: `frontend/app/mes/_components/_admin_sections/_master_items_parts/__tests__/ItemFormFields.test.tsx`

- [ ] **Step 1: 실패하는 폼 회귀 테스트 작성**

```tsx
it("모델 칩과 품목코드 미리보기를 제품기호 오름차순으로 표시한다", () => {
  render(
    <ItemFormFields
      form={baseForm({ model_slots: [1, 3, 4], mes_code: "348-AR-0723", process_type_code: "AR" })}
      setForm={vi.fn()}
      showMesCode
      productModels={[
        { slot: 1, symbol: "3", model_name: "DX3000", is_reserved: false },
        { slot: 3, symbol: "8", model_name: "SOLO", is_reserved: false },
        { slot: 4, symbol: "4", model_name: "ADX4000W", is_reserved: false },
      ]}
    />,
  );

  expect(screen.getByText("348-AR-0723", { selector: "[aria-readonly]" })).toBeInTheDocument();
  expect(Array.from(screen.getAllByRole("button")).map((button) => button.textContent)).toEqual([
    expect.stringContaining("DX3000 (3)"),
    expect.stringContaining("ADX4000W (4)"),
    expect.stringContaining("SOLO (8)"),
  ]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend; npm test -- app/mes/_components/_admin_sections/_master_items_parts/__tests__/ItemFormFields.test.tsx`

Expected: 코드 미리보기가 기존 슬롯 순서 기준 `384-AR-0723`으로 실패한다.

- [ ] **Step 3: 폼의 두 계산 지점을 공용 유틸로 교체**

```tsx
const symbols = modelSlotsToSymbolPrefix(form.model_slots, models);

{sortModelsBySymbol(productModels).map(({ slot, model_name, symbol }) => {
  // 기존 클릭·선택 상태 처리와 버튼 렌더링을 유지한다.
})}
```

`previewCodePrefix`는 `modelSlotsToSymbolPrefix` 결과에 공정코드와 `-`만 붙이고, 버튼 클릭 시 `model_slots` 배열을 정렬하는 기존 동작은 유지한다.

- [ ] **Step 4: 관련 테스트 통과 확인**

Run: `cd frontend; npm test -- lib/mes/__tests__/item-code.test.ts app/mes/_components/_admin_sections/_master_items_parts/__tests__/ItemFormFields.test.tsx`

Expected: 두 테스트 파일의 모든 테스트 passed.

### Task 3: 범위 검증 `[GPT-5.6 Luna | 병렬 불가]`

**Files:**
- Verify: `frontend/lib/mes/item-code.ts`
- Verify: `frontend/app/mes/_components/_admin_sections/_master_items_parts/ItemFormFields.tsx`

- [ ] **Step 1: 프런트엔드 최종 검증 게이트 실행**

Run: `powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode frontend`

Expected: frontend 게이트 exit code 0.

- [ ] **Step 2: 변경 범위 확인**

Run: `git diff --check; git diff -- frontend/lib/mes/item-code.ts frontend/lib/mes/__tests__/item-code.test.ts frontend/app/mes/_components/_admin_sections/_master_items_parts/ItemFormFields.tsx frontend/app/mes/_components/_admin_sections/_master_items_parts/__tests__/ItemFormFields.test.tsx`

Expected: 공용 제품기호 정렬 규칙과 품목 관리 적용·회귀 테스트만 포함된다.

**커밋:** 사용자 요청이 없으므로 생성하지 않는다.
