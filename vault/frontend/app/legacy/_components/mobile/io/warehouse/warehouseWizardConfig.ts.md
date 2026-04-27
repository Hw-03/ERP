---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/io/warehouse/warehouseWizardConfig.ts
status: active
updated: 2026-04-27
source_sha: 7c9af0a4f691
tags:
  - erp
  - frontend
  - frontend-module
  - ts
---

# warehouseWizardConfig.ts

> [!summary] 역할
> 프론트엔드 화면을 구성하는 타입, 상수, 유틸리티, 보조 모듈이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/io/warehouse/warehouseWizardConfig.ts`
- Layer: `frontend`
- Kind: `frontend-module`
- Size: `1176` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/io/warehouse/warehouse|frontend/app/legacy/_components/mobile/io/warehouse]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, type LucideIcon } from "lucide-react";

export type WarehouseMode = "wh2d" | "d2wh" | "whin";

export const WAREHOUSE_MODE_META: Record<
  WarehouseMode,
  { label: string; description: string; icon: LucideIcon; flow: { from: string; to: string } }
> = {
  wh2d: {
    label: "창고 → 생산부",
    description: "창고 재고를 생산부로 출고",
    icon: ArrowUpFromLine,
    flow: { from: "창고", to: "생산부" },
  },
  d2wh: {
    label: "생산부 → 창고",
    description: "생산부 재고를 창고로 반납",
    icon: ArrowRightLeft,
    flow: { from: "생산부", to: "창고" },
  },
  whin: {
    label: "창고 입고",
    description: "외부(공급업체)에서 창고로 입고",
    icon: ArrowDownToLine,
    flow: { from: "외부", to: "창고" },
  },
};

export const WAREHOUSE_STEPS = [
  { key: "type", label: "유형" },
  { key: "person", label: "담당자" },
  { key: "items", label: "품목/수량" },
  { key: "confirm", label: "확인" },
] as const;

export const WAREHOUSE_STEP_COUNT = WAREHOUSE_STEPS.length;
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
