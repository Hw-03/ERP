---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/index.ts
tags: [vault, code-note, auto-generated, stub]
---

# index.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/index.ts]]

## 원본 첫 줄

```
/**
 * API barrel — `@/lib/api/index` 로 import 할 수 있는 진입점.
 *
 * 본 라운드 (Round-3) 에서는 기존 `@/lib/api` 와 동일 export 를 그대로 노출한다.
 * 도메인별 분리 (items/inventory/employees/...) 는 Round-4 에서 진행.
 *
 * 호환:
 *   - 기존 `@/lib/api` import 는 그대로 유효
 *   - 새 코드는 `@/lib/api/index` 또는 `@/lib/api/core` 사용 가능
 */
export * from "../api";
```
