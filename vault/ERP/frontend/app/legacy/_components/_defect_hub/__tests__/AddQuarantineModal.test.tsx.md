---
type: file-explanation
source_path: "frontend/app/legacy/_components/_defect_hub/__tests__/AddQuarantineModal.test.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# AddQuarantineModal.test.tsx — AddQuarantineModal.test.tsx 설명

## 이 파일은 무엇을 책임지나

`AddQuarantineModal.test.tsx`는 불량 격리, 폐기, 반품, 분해 같은 불량 처리 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_defect_hub/__tests__/📁___tests__]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddQuarantineModal } from "../AddQuarantineModal";
import type { Item } from "@/lib/api/types";

vi.mock("@/lib/api/defects", () => ({
  defectsApi: {
    quarantine: vi.fn(),
  },
}));

vi.mock("@/lib/api/items", () => ({
  itemsApi: {
    getItems: vi.fn(),
  },
}));

import { defectsApi } from "@/lib/api/defects";
import { itemsApi } from "@/lib/api/items";

const mockItem = {
  item_id: "item-001",
  item_name: "전극(70kV)",
  item_code: "7-TR-0001",
  unit: "EA",
  quantity: 100,
  warehouse_qty: 50,
  production_total: 50,
  defective_total: 0,
  pending_quantity: 0,
  available_quantity: 100,
  last_reserver_name: null,
  location: null,
  locations: [],
  legacy_part: null,
  legacy_item_type: null,
  supplier: null,
  min_stock: null,
  model_symbol: null,
  model_slots: [],
  process_type_code: "TR",
  option_code: null,
  serial_no: null,
  bom_completed_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  department: null,
} as unknown as Item;

const mockEmployee = {
  employee_id: "emp-001",
  name: "테스터",
  department: "조립",
};
```
