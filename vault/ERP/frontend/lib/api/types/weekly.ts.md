---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/types/weekly.ts
tags: [vault, code-note, auto-generated, stub]
---

# weekly.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/types/weekly.ts]]

## 원본 첫 줄

```
export interface WeeklyItemReport {
  item_id: string;
  item_code: string | null;
  item_name: string;
  prev_qty: number;
  in_qty: number;
  out_qty: number;
  current_qty: number;
  delta: number;
}

export interface WeeklyGroupReport {
  process_code: string;
  dept_name: string;
  label: string;
  item_count: number;
  prev_qty: number;
  in_qty: number;
  out_qty: number;
  current_qty: number;
  delta: number;
  items: WeeklyItemReport[];
}

export interface WeeklyWarning {
  level: "danger" | "warn" | "good";
  title: string;
  message: string;
}

```
