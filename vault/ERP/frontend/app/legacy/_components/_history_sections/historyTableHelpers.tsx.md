---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/historyTableHelpers.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# historyTableHelpers.tsx — historyTableHelpers.tsx 설명

## 이 파일은 무엇을 책임지나

`historyTableHelpers.tsx`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `FlowBadge`
- `MovementSummaryCell`
- `buildGroups`
- `isHomogeneousItemGroup`
- `MemoCell`
- `BatchHeader`
- `OpBatchHeader`
- `ActorCell`
- `ChevronToggleBtn`
- `TONE_COLOR`
- 그 외 3개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopHistoryView.tsx]] — `DesktopHistoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/transactions.py]] — `transactions.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import {
  Activity, AlertCircle, ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine,
  BookmarkMinus, BookmarkPlus, ChevronDown, ChevronRight, Hammer, Layers,
  PackageX, Recycle, ShieldAlert, Sliders, Trash2, Undo2, Wrench,
} from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor, transactionIconName } from "@/lib/mes-status";
import {
  describeBatchFlow,
  getHistoryActor,
  getHistoryDisplayLabel,
  getHistoryMovementSummary,
  type MovementSummary,
  type MovementTone,
} from "./historyBatchInterpreter";
import { isReworkOperation } from "./transactionTaxonomy";
import { formatHistoryDate } from "./historyFormat";

const TX_ICON = {
  ArrowDownToLine, ArrowUpFromLine, Sliders, Hammer, Recycle, Trash2,
  AlertCircle, Wrench, Undo2, BookmarkPlus, BookmarkMinus, ArrowRightLeft,
  ShieldAlert, PackageX, Activity,
} as const;

export function FlowBadge({
  type,
  label,
  color,
}: {
  type: TransactionLog["transaction_type"] | null;
  label: string;
  color: string;
}) {
  const Icon = type ? TX_ICON[transactionIconName(type)] : null;
  return (
    <span
      className="inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

export const TONE_COLOR: Record<MovementTone, string> = {
  primary: LEGACY_COLORS.blue,
  success: LEGACY_COLORS.green,
  info: LEGACY_COLORS.cyan,
  warning: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
```
