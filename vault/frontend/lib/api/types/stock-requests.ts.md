---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/types/stock-requests.ts
tags: [vault, code-note, auto-generated, stub]
---

# stock-requests.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/types/stock-requests.ts]]

## 원본 첫 줄

```
/**
 * Stock requests 도메인 타입 — `@/lib/api/types/stock-requests`.
 * (작업자 결재 요청 흐름)
 * Round-10A (#2) 본문 이전.
 */

import type { Department } from "./shared";

export type StockRequestStatus =
  | "draft"
  | "submitted"
  | "reserved"
  | "rejected"
  | "cancelled"
  | "completed"
  | "failed_approval";

export type StockRequestType =
  | "raw_receive"
  | "raw_ship"
  | "warehouse_to_dept"
  | "dept_to_warehouse"
  | "dept_internal"
  | "mark_defective_wh"
  | "mark_defective_prod"
  | "supplier_return"
  | "manual_adjustment";

export type RequestBucket = "warehouse" | "production" | "defective" | "none";

```
