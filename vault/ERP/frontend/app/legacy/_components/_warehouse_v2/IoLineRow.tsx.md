---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_v2/IoLineRow.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# IoLineRow.tsx — IoLineRow.tsx 설명

## 이 파일은 무엇을 책임지나

`IoLineRow.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `isOutgoing`
- `expectedAfter`
- `IoLineRow`
- `StepBtn`
- `LineTagTone`
- `Props`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopWarehouseView.tsx]] — `DesktopWarehouseView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/stock-requests.ts]] — `stock-requests.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/stock_requests.py]] — 프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.
- [[ERP/backend/app/services/stock_requests.py]] — 현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { Check, MinusCircle, Trash2 } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { getStockState } from "@/lib/mes/inventory";
import { itemCodeDeptBadge } from "@/lib/mes/process";
import { useDeptColorLookup } from "../DepartmentsContext";
import type { IoLine, IoSubType, Item } from "./types";
import { isBomForced, lineTagLabel, type LineTagTone } from "./ioWorkType";
import { formatQty } from "@/lib/mes/format";

interface Props {
  line: IoLine;
  subType: IoSubType;
  isChild: boolean;
  item?: Item;
  available: number | null;
  forceShowRemove?: boolean;
  onToggle: () => void;
  onQuantityChange: (quantity: number, shortage: number) => void;
  onRemove: () => void;
}

// originLabel 은 lineTagLabel 로 대체됨 (현장 친화 태그 + 입출고 부호 배지)

function toneToColor(tone: LineTagTone): string {
  if (tone === "green") return LEGACY_COLORS.green;
  if (tone === "red") return LEGACY_COLORS.red;
  if (tone === "blue") return LEGACY_COLORS.blue;
  if (tone === "purple") return LEGACY_COLORS.purple;
  return LEGACY_COLORS.muted2;
}

export function isOutgoing(line: IoLine) {
  if (line.direction === "out" || line.direction === "move" || line.direction === "defective") {
    return true;
  }
  if (line.direction === "adjust" && line.from_bucket === "production") {
    return true;
  }
  return false;
}

export function expectedAfter(line: IoLine, available: number | null) {
  if (available === null) return null;
  const qty = Number(line.quantity) || 0;
  if (line.direction === "in") return available + qty;
  if (line.direction === "adjust") {
    if (line.to_bucket === "production") return available + qty;
    if (line.from_bucket === "production") return available - qty;
    return available;
  }
  if (line.direction === "out" || line.direction === "defective" || line.direction === "move")
    return available - qty;
```
