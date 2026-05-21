---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/types/shared.ts
tags: [vault, code-note, auto-generated, stub]
---

# shared.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/types/shared.ts]]

## 원본 첫 줄

```
/**
 * 공통 / cross-domain 타입 — `@/lib/api/types/shared`.
 *
 * 5개 이상 도메인이 참조하는 8종을 정본으로 보관.
 * Round-10A (#2) 에서 types.ts 본문 이전 — 도메인 파일들이 본 파일에서 import.
 */

export type ProcessTypeCode =
  | "TR" | "TA" | "TF"
  | "HR" | "HA" | "HF"
  | "VR" | "VA" | "VF"
  | "NR" | "NA" | "NF"
  | "AR" | "AA" | "AF"
  | "PR" | "PA" | "PF";

export type TransactionType =
  | "RECEIVE"
  | "PRODUCE"
  | "SHIP"
  | "ADJUST"
  | "BACKFLUSH"
  | "DISASSEMBLE"
  | "TRANSFER_TO_PROD"
  | "TRANSFER_TO_WH"
  | "TRANSFER_DEPT"
  | "MARK_DEFECTIVE"
  | "SUPPLIER_RETURN";

export type LocationStatus = "PRODUCTION" | "DEFECTIVE";

```
