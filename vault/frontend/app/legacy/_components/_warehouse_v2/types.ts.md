---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/types.ts
tags: [vault, code-note, auto-generated, stub]
---

# types.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_v2/types.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import type {
  Employee,
  IoBatch,
  IoBundle,
  IoLine,
  IoSubType,
  IoWorkType,
  Item,
  ProductModel,
} from "@/lib/api";

export type { IoBundle, IoLine, IoSubType, IoWorkType, Item, ProductModel };

export interface OperatorLike {
  employee_id: string;
  name: string;
  department: string;
  warehouse_role?: string;
  level?: string;
}

export interface IoComposeViewProps {
  globalSearch: string;
  operator: OperatorLike | null;
  employees: Employee[];
  items: Item[];
  productModels?: ProductModel[];
  setItems: (items: Item[]) => void;
  preselectedItem?: Item | null;
  restoreDraft?: IoBatch | null;
```
