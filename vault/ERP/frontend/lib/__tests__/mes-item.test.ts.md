---
type: file-explanation
source_path: "frontend/lib/__tests__/mes-item.test.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mes-item.test.ts — mes-item.test.ts 설명

## 이 파일은 무엇을 책임지나

`mes-item.test.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/__tests__/mes-item.test.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/lib/__tests__/📁___tests__]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```ts
import { describe, it, expect } from "vitest";
import {
  buildItemSearchLabel,
  itemMatchesKpi,
  groupedItems,
} from "../mes/item";
import type { Item } from "../api";

const stubItem = (overrides: Partial<Item> = {}): Item => ({
  item_id: "id-1",
  item_name: "Widget A",
  unit: "EA",
  quantity: 10,
  warehouse_qty: 10,
  production_total: 0,
  defective_total: 0,
  pending_quantity: 0,
  available_quantity: 10,
  last_reserver_name: null,
  location: null,
  locations: [],
  legacy_part: null,
  legacy_item_type: null,
  supplier: null,
  min_stock: null,
  item_code: "ITM-AA-00001",
  model_symbol: null,
  model_slots: [],
  process_type_code: null,
  option_code: null,
  serial_no: null,
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
  department: null,
  ...overrides,
});

describe("buildItemSearchLabel", () => {
  it("formats as 'item_code / name'", () => {
    expect(buildItemSearchLabel(stubItem())).toBe("ITM-AA-00001 / Widget A");
  });
});

describe("itemMatchesKpi", () => {
  it("정상: qty > 0 and (no min or qty >= min)", () => {
    expect(itemMatchesKpi(stubItem({ quantity: 10 }), "정상")).toBe(true);
    expect(itemMatchesKpi(stubItem({ quantity: 10, min_stock: 5 }), "정상")).toBe(true);
    expect(itemMatchesKpi(stubItem({ quantity: 10, min_stock: 10 }), "정상")).toBe(true);
    expect(itemMatchesKpi(stubItem({ quantity: 5, min_stock: 10 }), "정상")).toBe(false);
    expect(itemMatchesKpi(stubItem({ quantity: 0 }), "정상")).toBe(false);
  });

  it("부족: 0 < qty < min", () => {
    expect(itemMatchesKpi(stubItem({ quantity: 5, min_stock: 10 }), "부족")).toBe(true);
    expect(itemMatchesKpi(stubItem({ quantity: 10 }), "부족")).toBe(false);
```
