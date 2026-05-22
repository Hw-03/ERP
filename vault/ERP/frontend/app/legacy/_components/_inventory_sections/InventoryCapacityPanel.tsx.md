---
type: file-explanation
source_path: "frontend/app/legacy/_components/_inventory_sections/InventoryCapacityPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# InventoryCapacityPanel.tsx — InventoryCapacityPanel.tsx 설명

## 이 파일은 무엇을 책임지나

`InventoryCapacityPanel.tsx`는 대시보드/재고 화면의 목록, 상세, 필터, KPI 표시를 구성하는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `InventoryCapacityPanel`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopInventoryView.tsx]] — `DesktopInventoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/query.py]] — `query.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.
- [[ERP/backend/app/services/inventory.py]] — 입고, 출고, 부서 이동, 불량 처리처럼 실제 재고 숫자를 바꾸는 업무 규칙을 담은 핵심 파일입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { AlertTriangle, Zap } from "lucide-react";
import type { ProductionCapacity, ProductionCapacityStatus } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";

function resolveStatus(data: ProductionCapacity): ProductionCapacityStatus {
  if (data.status) return data.status;
  // 백엔드가 status 를 안 주는 구버전 응답 fallback.
  if (data.top_items.length === 0) return "bom_not_registered";
  if (data.immediate > 0 || data.maximum > 0) return "producible";
  return "not_producible";
}

export function InventoryCapacityPanel({
  capacityData,
  onClick,
}: {
  capacityData: ProductionCapacity | null | undefined;
  onClick?: () => void;
}) {
  if (!capacityData) return null;
  const interactive = typeof onClick === "function";
  const status = resolveStatus(capacityData);
  const showBottleneck =
    (status === "producible" || status === "not_producible") && !!capacityData.limiting_item;

  const accent =
    status === "producible"
      ? LEGACY_COLORS.cyan
      : status === "not_producible"
        ? LEGACY_COLORS.yellow
        : LEGACY_COLORS.muted2;

  const baseStyle = {
    background: `color-mix(in srgb, ${accent} 8%, transparent)`,
    borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
  };
  const className =
    "flex w-full min-w-0 flex-wrap items-center gap-2 rounded-[14px] border px-3 py-3 text-left lg:gap-4 lg:px-5 lg:py-4" +
    (interactive ? " cursor-pointer transition-opacity hover:opacity-90" : "");

  const heading = (() => {
    switch (status) {
      case "no_target":
        return "생산 가능 품목 없음";
      case "bom_not_registered":
        return "BOM 미등록";
      case "not_producible":
        return "생산 불가";
      case "producible":
      default:
        return "생산 가능";
    }
```
