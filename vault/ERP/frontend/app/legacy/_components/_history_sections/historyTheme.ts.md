---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/historyTheme.ts
tags: [vault, code-note, auto-generated, stub]
---

# historyTheme.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/historyTheme.ts]]

## 원본 첫 줄

```
/**
 * historyTheme.ts — 행 tint 색 + 공정 타입 메타 순수 상수/함수.
 * C2: historyShared.ts 에서 추출. 소비자는 historyShared 재export 또는 직접 import.
 */
import { LEGACY_COLORS } from "@/lib/mes/color";

/** 거래 타입별 행 배경 tint (투명도 낮은 색조). */
export function rowTint(type: string): string {
  switch (type) {
    case "RECEIVE":
    case "PRODUCE":
      return "rgba(67,211,157,.05)";
    case "SHIP":
    case "BACKFLUSH":
      return "rgba(255,123,123,.05)";
    case "ADJUST":
      return "rgba(101,169,255,.05)";
    case "TRANSFER_TO_PROD":
    case "TRANSFER_TO_WH":
    case "TRANSFER_DEPT":
      return "rgba(78,201,245,.05)";
    default:
      return "transparent";
  }
}

/** 공정 타입 코드별 라벨·색·배경. */
export const PROCESS_TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  TR: { label: "튜브 원자재", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
  TA: { label: "튜브 중간공정", color: LEGACY_COLORS.cyan, bg: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 16%, transparent)` },
```
