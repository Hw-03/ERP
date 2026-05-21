---
type: code-note
project: DEXCOWIN MES
layer: frontend
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/IoLineRow.tsx
status: active
updated: 2026-05-21
tags:
  - layer/frontend
  - topic/warehouse-v2
  - audience/junior
---

# IoLineRow.tsx

> [!summary] 역할
> **입출고 마법사 Step 4 — 개별 품목 행 컴포넌트.** 카트 안에서 품목 한 줄을 렌더링한다. 체크박스·수량 stepper·현재 재고·실행 후 재고·삭제 버튼을 포함한다.

---

## 1. 위치

```
erp/frontend/app/legacy/_components/_warehouse_v2/IoLineRow.tsx
```

**부모**: `IoBundleCard.tsx` → `IoBundleCart.tsx` → `IoComposeView.tsx`

---

## 2. 역할 한 줄 요약

`IoBundle.lines[]` 배열의 한 항목(`IoLine`)을 7-column grid로 렌더링. 수량 변경 시 BOM 비례 재계산은 부모(`IoComposeView`)의 `applyLineQuantityChange`가 처리하므로 이 컴포넌트는 순수 UI 역할.

---

## 3. Props

| prop | 타입 | 설명 |
|---|---|---|
| `line` | `IoLine` | 렌더링할 라인 데이터 |
| `subType` | `IoSubType` | 작업 세부 유형 (BOM forced 여부 판단) |
| `isChild` | `boolean` | BOM 하위 라인 여부 (들여쓰기·좌선 표시) |
| `item` | `Item \| undefined` | 재고 상태 표시용 품목 정보 |
| `available` | `number \| null` | 현재 가용 재고 |
| `forceShowRemove` | `boolean` | 강제 삭제 버튼 표시 |
| `onToggle` | `() => void` | 체크박스 클릭 |
| `onQuantityChange` | `(qty, shortage) => void` | 수량 변경 |
| `onRemove` | `() => void` | 라인 삭제 |

---

## 4. 7-column Grid 구성

```
[체크박스] [품목명+코드+태그] [분류배지] [수량 stepper] [현재재고] [실행후재고] [삭제버튼]
```

| 열 | 내용 |
|---|---|
| 1 | 체크박스 (포함/제외 토글) |
| 2 | 품목명 + 품목 코드 + `lineTagLabel` 뱃지 |
| 3 | `itemCodeDeptBadge` (공정 단계 색상 배지) |
| 4 | 수량 stepper (-10/-1/입력/+1/+10) |
| 5 | 현재 가용 재고 (출고 방향이면 "가능 재고", 입고면 "현재 재고") |
| 6 | 실행 후 예상 재고 (`expectedAfter` 계산) |
| 7 | 삭제 (manual origin 또는 `forceShowRemove` 시만) |

---

## 5. 핵심 로직

### BOM Forced 모드

```tsx
const qtyLocked =
  isBomForced(subType) &&          // produce 또는 disassemble
  line.origin === "bom_auto" &&     // BOM 하위 자동 전개 라인
  line.bom_expected != null &&
  Number(line.bom_expected) > 0;
```

`produce`/`disassemble` 작업에서 BOM 하위 라인은 상위 수량에 비례해 자동 계산되므로 체크박스와 수량 입력을 모두 잠근다.

### 실행 후 재고 계산

```tsx
export function expectedAfter(line: IoLine, available: number | null) {
  if (available === null) return null;
  const qty = Number(line.quantity) || 0;
  if (line.direction === "in") return available + qty;
  if (line.direction === "adjust") {
    if (line.to_bucket === "production") return available + qty;
    if (line.from_bucket === "production") return available - qty;
  }
  if (line.direction === "out" || line.direction === "defective" || line.direction === "move")
    return available - qty;
  return available;
}
```

결과값이 0이면 노란색, 음수(재고 부족)면 빨간색으로 표시.

---

## 6. 코드 발췌 — 체크박스 및 Stepper

```tsx
{/* 체크박스 */}
<button
  type="button"
  onClick={onToggle}
  disabled={qtyLocked}
  style={{
    background: line.included ? LEGACY_COLORS.blue : "transparent",
    borderColor: line.included ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
  }}
  title={qtyLocked ? "상위 품목과 함께 자동 처리" : line.included ? "재고 반영 포함" : "이번 작업 제외"}
  aria-pressed={line.included}
>
  {line.included ? <Check className="h-4 w-4" /> : <MinusCircle className="h-3.5 w-3.5" />}
</button>

{/* Stepper */}
<div className="flex items-center gap-1">
  <StepBtn tone={LEGACY_COLORS.red} disabled={stepperDisabled} onClick={() => onStep(-10)}>-10</StepBtn>
  <StepBtn tone={LEGACY_COLORS.red} disabled={stepperDisabled} onClick={() => onStep(-1)}>-1</StepBtn>
  <input type="number" value={currentQty} disabled={stepperDisabled}
    onChange={(e) => onInputChange(e.target.value)}
    onFocus={(e) => e.currentTarget.select()}
    className="w-[72px] ..." />
  <StepBtn tone={LEGACY_COLORS.green} disabled={stepperDisabled} onClick={() => onStep(1)}>+1</StepBtn>
  <StepBtn tone={LEGACY_COLORS.green} disabled={stepperDisabled} onClick={() => onStep(10)}>+10</StepBtn>
</div>
```

---

## 7. 라인 태그 (`lineTagLabel`)

`ioWorkType.ts`의 `lineTagLabel(line, subType)` 함수가 반환하는 태그:

| subType | origin | 태그 텍스트 | 색상 |
|---|---|---|---|
| `produce` | `direct` | 생산 결과품 | green |
| `produce` | `bom_auto` | 투입 자재 | red |
| `disassemble` | `direct` | 분해 대상 | red |
| `disassemble` | `bom_auto` | 회수 품목 | green |
| `warehouse_to_dept` | `direct` | 상위 | blue |
| `warehouse_to_dept` | `bom_auto` | 하위 | muted |
| `manual` | 모든 경우 | 이 품목만 | muted |

---

## 8. 자식 라인 표시 방식

`isChild === true`이면:
- `paddingLeft: 32px` (들여쓰기)
- 왼쪽에 회색 3px 세로선

---

## 9. Decimal 타입 주의사항

> [!warning] 백엔드 Decimal 직렬화
> 백엔드 Python Pydantic의 Decimal은 JSON에서 문자열(`"1.0000"`)로 직렬화된다. `line.quantity`가 string으로 내려올 수 있으므로 항상 `Number(line.quantity)`로 변환해서 사용한다. 이를 빠뜨리면 수량이 `"1"+"1" = "11"` 처럼 문자열 concatenation이 발생한다.

---

## 10. 연결 관계

- **부모**: `erp/frontend/app/legacy/_components/_warehouse_v2/IoBundleCard.tsx`
- **의존**: `erp/frontend/app/legacy/_components/_warehouse_v2/ioWorkType.ts` (`isBomForced`, `lineTagLabel`)
- **유틸**: `@/lib/mes/inventory` (`getStockState`), `@/lib/mes/process` (`itemCodeDeptBadge`)

---

## 11. 신입을 위한 맥락

> [!note] 처음 보는 신입에게
> 이 컴포넌트는 카트(Step 4)에서 품목 한 줄이다. 가장 중요한 개념 두 가지:
>
> 1. **BOM Locked**: `produce`/`disassemble` 작업에서 BOM이 자동으로 전개된 하위 자재는 수량을 직접 편집할 수 없다. 상위 품목 수량을 바꾸면 자동으로 비례 계산된다.
> 2. **재고 부족**: "실행 후" 재고가 음수이면 빨간색으로 표시되고, Step 5 제출 버튼이 비활성화된다.
