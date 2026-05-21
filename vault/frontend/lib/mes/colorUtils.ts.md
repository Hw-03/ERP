---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/colorUtils.ts
tags: [vault, code-note, auto-generated, stub]
---

# colorUtils.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/mes/colorUtils.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
/**
 * color-mix(in srgb, ...) 인라인 패턴을 줄이기 위한 헬퍼.
 * pct: 0–100 (정수 권장)
 * base: 기본값 "transparent"
 */
export function tint(color: string, pct: number, base = "transparent"): string {
  return `color-mix(in srgb, ${color} ${pct}%, ${base})`;
}
```
