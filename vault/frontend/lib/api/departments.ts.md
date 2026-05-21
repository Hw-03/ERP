---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/departments.ts
tags: [vault, code-note, auto-generated, stub]
---

# departments.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/departments.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
/**
 * Departments 도메인 API — `@/lib/api/departments`.
 *
 * Round-6 (R6-D9) 분리. 5 메소드 + getAppSession 1 (관련 헬퍼).
 */

import { deleteJson, fetcher, patchJson, postJson, putJson, toApiUrl } from "../api-core";
import type { DepartmentMaster } from "./types";

export const departmentsApi = {
  getAppSession: (): Promise<{ boot_id: string; started_at: string }> =>
    fetcher(toApiUrl("/api/app-session")),

  getDepartments: (params?: { isActive?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.isActive !== undefined) query.set("is_active", String(params.isActive));
    return fetcher<DepartmentMaster[]>(toApiUrl(`/api/departments?${query}`));
  },

  createDepartment: (payload: {
    name: string;
    display_order?: number;
    pin: string;
    color_hex?: string;
  }) => postJson<DepartmentMaster>(toApiUrl("/api/departments"), payload),

  updateDepartment: (
    id: number,
    payload: {
      name?: string;
```
