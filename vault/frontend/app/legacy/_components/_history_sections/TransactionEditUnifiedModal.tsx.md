---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/TransactionEditUnifiedModal.tsx
tags: [vault, code-note, auto-generated, stub]
---

# TransactionEditUnifiedModal.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/TransactionEditUnifiedModal.tsx]]

## 원본 첫 줄

```
"use client";

/**
 * 거래 정정 통합 모달 — 정보(메타) 수정 + 수량 보정을 한 화면에서.
 * 기존 TransactionEditModal / TransactionQuantityCorrectModal 을 흡수(2차 #2: UI 통합).
 * 백엔드는 그대로 2엔드포인트(metaEdit / quantityCorrect). 변경된 영역만 호출.
 *
 * 작업자 식별용 PIN — 실제 보안 인증이 아님.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import {
  api,
  type Employee,
  type TransactionLog,
  type TransactionType,
} from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
import { AppSelect } from "../common/AppSelect";
import { useCurrentOperator } from "../login/useCurrentOperator";
import { getHistoryDisplayLabel } from "./historyBatchInterpreter";

/** 직접 수량 보정 가능 거래 — 그 외는 수량조정(ADJUST) 거래로 처리(재고 정합성). */
export const QUANTITY_CORRECTABLE_TYPES: ReadonlySet<TransactionType> =
  new Set<TransactionType>(["RECEIVE", "SHIP"]);

interface Props {
```
