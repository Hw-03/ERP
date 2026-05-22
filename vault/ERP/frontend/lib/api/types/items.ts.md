---
type: file-explanation
source_path: "frontend/lib/api/types/items.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# items.ts — items.ts 설명

## 이 파일은 무엇을 책임지나

`items.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `Item`
- `ProductModel`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.
- [[ERP/backend/app/routers/items.py]] — `items.py`는 `items` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * Items 도메인 타입 — `@/lib/api/types/items`.
 *
 * Round-10A (#2) 본문 이전. ProductModel 은 catalog 보다 items 에 더 자주
 * 사용되어 본 파일에 유지(호환). 향후 catalog 로 옮길 수 있음.
 */

import type { Department, InventoryLocationRow } from "./shared";

export interface Item {
  item_id: string;
  item_name: string;
  unit: string;
  quantity: number;
  warehouse_qty: number;
  production_total: number;
  defective_total: number;
  pending_quantity: number;
  available_quantity: number;
  last_reserver_name: string | null;
  location: string | null;
  locations: InventoryLocationRow[];
  legacy_part: string | null;
  legacy_item_type: string | null;
  supplier: string | null;
  min_stock: number | null;
  item_code: string | null;
  model_symbol: string | null;
  model_slots: number[];
  process_type_code: string | null;
  option_code: string | null;
  serial_no: number | null;
  bom_completed_at: string | null;
  created_at: string;
  updated_at: string;
  department: Department | string | null;
}

export interface ProductModel {
  slot: number;
  symbol: string | null;
  model_name: string | null;
  is_reserved: boolean;
}
```
