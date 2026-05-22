---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes-status.ts
tags: [vault, code-note, auto-generated, stub]
---

# mes-status.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/mes-status.ts]]

## 원본 첫 줄

```
/**
 * DEXCOWIN MES 공통 상태 톤 / 거래 타입 매핑
 *
 * 통합 정책:
 *   - 데스크톱 StatusPill 의 tone (info/success/warning/danger/neutral) 과
 *     모바일 StatusBadge 의 tone (ok/warn/danger/info/muted) 을
 *     단일 MesTone 체계로 흡수한다.
 *   - 1차 (이번 PR): StatusPill 만 본 모듈 사용. StatusBadge 는 다음 PR.
 *   - 두 컴포넌트 자체는 합치지 않는다 — props / 마크업 호환성 유지.
 *
 * 호환:
 *   - StatusPill 의 기존 export `StatusPillTone` 은 MesTone 의 alias 로 유지.
 *   - StatusBadge 의 "ok" / "warn" 은 success / warning 의 별칭으로 toMesTone 이 흡수.
 */

import type { TransactionType } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";

export type MesTone = "success" | "warning" | "danger" | "info" | "neutral" | "muted";

/**
 * StatusBadge 등 구버전 톤 명을 MesTone 으로 흡수.
 * 모르는 값은 "info" 로 떨어뜨린다.
 */
export function toMesTone(value: string | null | undefined): MesTone {
  if (!value) return "info";
  switch (value) {
    case "success":
    case "ok":
      return "success";
```
