---
type: file-explanation
source_path: "frontend/app/legacy/_components/_inventory_sections/InventoryDetailLocations.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# InventoryDetailLocations.tsx — InventoryDetailLocations.tsx 설명

## 이 파일은 무엇을 책임지나

`InventoryDetailLocations.tsx`는 대시보드/재고 화면의 목록, 상세, 필터, KPI 표시를 구성하는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `InventoryDetailLocations`

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

import { useRouter } from "next/navigation";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";

const DEFECT_RED = "#ef4444";

/**
 * Round-13 (#8) 추출 — InventoryDetailPanel 의 "위치별 재고" 섹션.
 *
 * 부모에서 `item.warehouse_qty > 0 || locations[*].quantity > 0` 조건 확인 후 렌더.
 * PR#3: DEFECTIVE 행 빨간색 추가. 부서별 정상 행 바로 다음에 인접 배치.
 */
export function InventoryDetailLocations({
  item,
  getDeptColor,
}: {
  item: Item;
  getDeptColor: (name: string) => string;
}) {
  const router = useRouter();

  // 부서 목록 (PRODUCTION + DEFECTIVE 모두 포함, quantity > 0)
  const locations = (item.locations ?? []).filter((l) => Number(l.quantity) > 0);
  // 등장하는 부서 순서 유지 (PRODUCTION 기준 정렬)
  const depts = Array.from(
    new Set(locations.map((l) => l.department))
  );

  return (
    <section
      className="rounded-[28px] border p-5"
      style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
    >
      <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
        위치별 재고
      </div>
      <div className="space-y-2">
        {Number(item.warehouse_qty) > 0 && (
          <div
            className="flex items-center gap-3 rounded-[14px] border px-3 py-2.5"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.muted2 }} />
            <span className="flex-1 text-base font-semibold">창고</span>
            <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
              {formatQty(item.warehouse_qty)}
            </span>
          </div>
        )}
        {depts.map((dept) => {
          const prod = locations.find((l) => l.department === dept && l.status === "PRODUCTION");
          const defective = locations.find((l) => l.department === dept && l.status === "DEFECTIVE");
```
