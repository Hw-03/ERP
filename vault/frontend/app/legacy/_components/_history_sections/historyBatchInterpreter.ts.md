---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/historyBatchInterpreter.ts
tags: [vault, code-note, auto-generated, stub]
---

# historyBatchInterpreter.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/historyBatchInterpreter.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
/**
 * historyBatchInterpreter.ts — IoBatch 기반 해석 모듈 (깊은 모듈).
 * C4: historyShared.ts 에서 추출. batch/log 를 받아 label/flow/sign/summary 를 단일 로직으로 생성.
 * 내부 bucket→라벨 규칙, sub_type/tx 우선순위를 이 모듈에 은닉.
 * 소비자는 historyShared 재export 또는 직접 import.
 */
import type { Department } from "@/lib/api/types/shared";
import type { IoBatch } from "@/lib/api/types/io";
import { formatQty } from "@/lib/mes/format";

// ──────────────────────────────────────────────────────────────────
// 내부 헬퍼
// ──────────────────────────────────────────────────────────────────

function _deptName(dept: Department | string | null | undefined): string | null {
  if (!dept) return null;
  return typeof dept === "string" ? dept : null;
}

type BucketSlot = { bucket: string; dept: string | null };

function _bucketSlotKey(s: BucketSlot): string {
  return `${s.bucket}|${s.dept ?? ""}`;
}

/** none bucket 라벨 — sub_type 컨텍스트 의존. 매핑 안 되면 null. */
function _labelNoneBucket(subType: string | null | undefined, side: "from" | "to"): string | null {
  switch (subType) {
    case "receive_supplier":
      return side === "from" ? "외부" : null;
```
