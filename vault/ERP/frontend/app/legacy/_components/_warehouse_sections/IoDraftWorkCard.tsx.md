---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_sections/IoDraftWorkCard.tsx
tags: [vault, code-note, auto-generated, stub]
---

# IoDraftWorkCard.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_sections/IoDraftWorkCard.tsx]]

## 원본 첫 줄

```
"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { IoBatch, IoLine, IoSubType } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import {
  IO_WORK_TYPES,
  deptIoDisplayLabel,
  lineTagLabel,
  subTypeLabel,
} from "../_warehouse_v2/ioWorkType";

interface Props {
  draft: IoBatch;
  isBusy: boolean;
  onContinue: () => void;
  onRequestDelete: () => void;
}

const TAG_TONE: Record<string, string> = {
  blue: LEGACY_COLORS.blue,
  green: LEGACY_COLORS.green,
  red: LEGACY_COLORS.red,
  purple: LEGACY_COLORS.purple,
  muted: LEGACY_COLORS.muted2,
};

// 백엔드(services/io.py)가 datetime.utcnow() 로 timezone-naive UTC 를 저장하므로
```
