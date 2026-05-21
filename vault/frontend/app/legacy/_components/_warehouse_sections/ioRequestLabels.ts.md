---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_sections/ioRequestLabels.ts
tags: [vault, code-note, auto-generated, stub]
---

# ioRequestLabels.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_sections/ioRequestLabels.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
/** 입출고 요청 유형 표시 라벨 — DraftCartItemRow / WarehouseQueueRow / MyRequestRow 공용. */
export const REQUEST_TYPE_LABEL: Record<string, string> = {
  raw_receive: "원자재 입고",
  raw_ship: "원자재 출고",
  warehouse_to_dept: "창고 → 부서 이동",
  dept_to_warehouse: "부서 → 창고 복귀",
  dept_internal: "부서 내부 이동",
  mark_defective_wh: "창고 불량 등록",
  mark_defective_prod: "생산 불량 등록",
  supplier_return: "공급업체 반품",
  package_out: "패키지 출고",
  manual_adjustment: "수동 조정",
};
```
