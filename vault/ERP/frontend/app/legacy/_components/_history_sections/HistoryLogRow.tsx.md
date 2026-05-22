---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/_history_sections/HistoryLogRow.tsx
status: active
updated: 2026-04-27
source_sha: 23ab06d4673e
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# HistoryLogRow.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_history_sections/HistoryLogRow.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `6403` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_history_sections/_history_sections|frontend/app/legacy/_components/_history_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { memo } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookmarkMinus,
  BookmarkPlus,
  Hammer,
  Recycle,
  Sliders,
  Trash2,
  Undo2,
  Wrench,
} from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import {
  LEGACY_COLORS,
  employeeColor,
  formatNumber,
  transactionColor,
  transactionIconName,
  transactionLabel,
} from "../legacyUi";
import { CATEGORY_META, formatHistoryDate, rowTint } from "./historyShared";

const TX_ICON = {
  ArrowDownToLine,
  ArrowUpFromLine,
  Sliders,
  Hammer,
  Recycle,
  Trash2,
# ... (이하 149줄 생략. 원본 참조)

````
