---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/dept-adjustment.ts
tags: [vault, code-note, auto-generated, stub]
---

# dept-adjustment.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/dept-adjustment.ts]]

## 원본 첫 줄

```
import { fetcher, postJson, toApiUrl } from "../api-core";
import type {
  AdjLineTemplate,
  BomTemplateResponse,
  DeptAdjResult,
  DeptAdjSubType,
  DeptAdjSubmitPayload,
} from "./types/dept-adjustment";

export const deptAdjustmentApi = {
  getBomTemplate: (
    itemId: string,
    subType: DeptAdjSubType,
    quantity = 1,
  ): Promise<BomTemplateResponse> =>
    fetcher<BomTemplateResponse>(
      toApiUrl(
        `/api/dept-adjustment/bom-template?item_id=${itemId}&sub_type=${subType}&quantity=${quantity}`,
      ),
    ),

  expandComponent: (payload: {
    item_id: string;
    quantity: number;
    department: string;
    direction: "in" | "out";
  }): Promise<AdjLineTemplate[]> =>
    postJson<AdjLineTemplate[]>(
      toApiUrl("/api/dept-adjustment/expand-component"),
      payload,
```
