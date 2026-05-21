---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/weekly.ts
tags: [vault, code-note, auto-generated, stub]
---

# weekly.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/weekly.ts]]

## 원본 첫 줄

```
import { fetcher, toApiUrl } from "../api-core";
import type { WeeklyProductionModelRow, WeeklyReportResponse } from "./types/weekly";

/**
 * production_matrix 숫자 필드 정규화.
 *
 * 백엔드 Pydantic Decimal 은 JSON 에서 문자열("2.0000")로 직렬화되는데 타입은
 * number 로 선언돼 있다. 그대로 두면 `reduce((s,r)=>s+r.total_qty, 0)` 가
 * `0 + "2.0000"` → 문자열 연결로 "총 022.00008.0000…개" 처럼 깨진다.
 * (IoComposeView 의 normalizeBundles 와 동일한 경계-정규화 관례.)
 */
function normalizeMatrix(rows: WeeklyProductionModelRow[]): WeeklyProductionModelRow[] {
  return rows.map((r) => ({
    ...r,
    tf_qty: Number(r.tf_qty) || 0,
    hf_qty: Number(r.hf_qty) || 0,
    vf_qty: Number(r.vf_qty) || 0,
    nf_qty: Number(r.nf_qty) || 0,
    af_qty: Number(r.af_qty) || 0,
    pf_qty: Number(r.pf_qty) || 0,
    total_qty: Number(r.total_qty) || 0,
  }));
}

export const weeklyApi = {
  getWeeklyReport: async (params: { week_start: string; week_end: string }) => {
    const url = toApiUrl(
      `/api/inventory/weekly-report?week_start=${params.week_start}&week_end=${params.week_end}`
    );
    const res = await fetcher<WeeklyReportResponse>(url);
```
