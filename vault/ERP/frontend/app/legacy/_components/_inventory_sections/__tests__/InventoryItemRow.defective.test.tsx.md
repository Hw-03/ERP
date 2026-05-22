---
type: file-explanation
source_path: "frontend/app/legacy/_components/_inventory_sections/__tests__/InventoryItemRow.defective.test.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# InventoryItemRow.defective.test.tsx — InventoryItemRow.defective.test.tsx 설명

## 이 파일은 무엇을 책임지나

`InventoryItemRow.defective.test.tsx`는 대시보드/재고 화면의 목록, 상세, 필터, KPI 표시를 구성하는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopInventoryView.tsx]] — `DesktopInventoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/query.py]] — `query.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.
- [[ERP/backend/app/services/inventory.py]] — 입고, 출고, 부서 이동, 불량 처리처럼 실제 재고 숫자를 바꾸는 업무 규칙을 담은 핵심 파일입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
/**
 * PR#3 — InventoryItemRow DEFECTIVE 행 렌더링 테스트
 *
 * 검증 항목:
 *  1. PRODUCTION + DEFECTIVE 행 모두 포함 시 색상 띠에 두 segment 가 렌더링됨
 *  2. DEFECTIVE segment 색상이 #ef4444 인지 (style 검증)
 *  3. aria-label 에 "[불량]" 텍스트 포함 여부
 *  4. DEFECTIVE 수량 0 인 부서는 segment 에 포함 안 됨
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { Item } from "@/lib/api";

// next/image mock
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// DepartmentsContext mock — useDeptColorLookup 이 "#3ac4b0" 반환
vi.mock("@/app/legacy/_components/DepartmentsContext", () => ({
  useDeptColorLookup: () => () => "#3ac4b0",
}));

import { InventoryItemRow } from "../InventoryItemRow";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    item_id: "test-item-001",
    item_name: "테스트 부품",
    item_code: "7-TR-0001",
    spec: null,
    unit: "EA",
    quantity: 20,
    warehouse_qty: 5,
    min_stock: null,
    department: "조립",
    process_type: null,
    image_filename: null,
    locations: [],
    ...overrides,
  } as unknown as Item;
}

describe("InventoryItemRow — DEFECTIVE 게이지 세그먼트", () => {
  it("PRODUCTION + DEFECTIVE 행이 모두 있을 때 게이지 aria-label 에 두 부서 정보 포함", () => {
    const item = makeItem({
      quantity: 15,
      warehouse_qty: 5,
      locations: [
        { department: "조립", status: "PRODUCTION", quantity: 8 },
        { department: "조립", status: "DEFECTIVE", quantity: 2 },
      ],
```
