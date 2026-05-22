---
type: file-explanation
source_path: "frontend/app/legacy/_components/CapacityDetailModal.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# CapacityDetailModal.tsx — CapacityDetailModal.tsx 설명

## 이 파일은 무엇을 책임지나

`CapacityDetailModal.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `CapacityDetailModal`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import type { ProductionCapacity, ProductionCapacityStatus } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";

/**
 * Round-13 (#18) 추출 — DesktopLegacyShell 의 생산 가능수량 상세 모달.
 */
export function CapacityDetailModal({
  capacityData,
  onClose,
}: {
  capacityData: ProductionCapacity | null;
  onClose: () => void;
}) {
  const status: ProductionCapacityStatus | null = capacityData
    ? capacityData.status ??
      (capacityData.top_items.length === 0
        ? "bom_not_registered"
        : capacityData.immediate > 0 || capacityData.maximum > 0
          ? "producible"
          : "not_producible")
    : null;

  const emptyMessage = (() => {
    if (capacityData == null) return "데이터를 불러오는 중…";
    switch (status) {
      case "no_target":
        return "생산 가능 품목이 없습니다. BOM/완제품 기준 확인 필요.";
      case "bom_not_registered":
        return "BOM이 등록되지 않아 생산 가능 수량을 계산할 수 없습니다.";
      case "not_producible":
        return "병목 부품 또는 재고 부족으로 현재 생산 가능 수량이 없습니다.";
      default:
        return "표시할 항목이 없습니다.";
    }
  })();

  const hasItems = capacityData != null && capacityData.top_items.length > 0;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-[28px] border p-7"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-base font-black" style={{ color: LEGACY_COLORS.text }}>
          생산 가능수량 상세
        </div>
```
