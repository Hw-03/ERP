---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/types/departments.ts
tags: [vault, code-note, auto-generated, stub]
---

# departments.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/types/departments.ts]]

## 원본 첫 줄

```
/**
 * Departments 도메인 타입 — `@/lib/api/types/departments`.
 * Round-10A (#2) 본문 이전.
 */

export interface DepartmentMaster {
  id: number;
  name: string;
  display_order: number;
  is_active: boolean;
  color_hex: string | null;
}
```
