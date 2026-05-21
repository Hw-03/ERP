---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/DesktopPinLock.tsx
tags: [vault, code-note, auto-generated, stub]
---

# DesktopPinLock.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/DesktopPinLock.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, Delete, Loader2, LockKeyhole } from "lucide-react";
import { api } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";

type StyleWithVars = CSSProperties & Record<`--${string}`, string>;

type KeyDef =
  | { kind: "digit"; value: string }
  | { kind: "back" }
  | { kind: "clear" };

const KEYS: KeyDef[] = [
  { kind: "digit", value: "1" },
  { kind: "digit", value: "2" },
  { kind: "digit", value: "3" },
  { kind: "digit", value: "4" },
  { kind: "digit", value: "5" },
  { kind: "digit", value: "6" },
  { kind: "digit", value: "7" },
  { kind: "digit", value: "8" },
  { kind: "digit", value: "9" },
  { kind: "back" },
  { kind: "digit", value: "0" },
  { kind: "clear" },
];

const PIN_LENGTH = 4;
```
