---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/BomBatchDetail.tsx
tags: [vault, code-note, auto-generated, stub]
---

# BomBatchDetail.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/BomBatchDetail.tsx]]

## 원본 첫 줄

```
"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Package } from "lucide-react";
import { ioApi } from "@/lib/api/io";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import {
  getHistoryBomParentLine,
  getHistoryLineSignedQuantity,
  getHistoryLineStatusLabel,
  type LineSignTone,
} from "./historyBatchInterpreter";

const SIGN_TONE_HEX: Record<LineSignTone, string> = {
  increase: LEGACY_COLORS.blue,
  decrease: LEGACY_COLORS.red,
  move: LEGACY_COLORS.cyan,
  muted: LEGACY_COLORS.muted2,
};

type Props = {
  batchId: string;
  colSpan: number;
  /** 부모에서 캐시를 관리해 중복 요청을 방지. */
  cache: Map<string, IoBatch>;
  onCached: (batchId: string, batch: IoBatch) => void;
};

```
