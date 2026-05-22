---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_v2/DefectInventoryPicker.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DefectInventoryPicker.tsx — DefectInventoryPicker.tsx 설명

## 이 파일은 무엇을 책임지나

`DefectInventoryPicker.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DefectInventoryPicker`
- `DefectInventoryPickerProps`

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

import { useEffect, useState } from "react";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { defectsApi } from "@/lib/api/defects";
import type { DefectLocation } from "@/lib/api/types/defects";

export interface DefectInventoryPickerProps {
  department: string;
  selected: DefectLocation | null;
  onSelect: (location: DefectLocation | null) => void;
  onAdvance: () => void;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function isOverOneYear(defectiveAt: string): boolean {
  return Date.now() - new Date(defectiveAt).getTime() > ONE_YEAR_MS;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 30) return `${diffDays}일 전`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffDays < 365) return `${diffMonths}개월 전`;
  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}년 전`;
}

export function DefectInventoryPicker({
  department,
  selected,
  onSelect,
  onAdvance,
}: DefectInventoryPickerProps) {
  const [locations, setLocations] = useState<DefectLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    defectsApi
      .listDefects(department)
      .then(setLocations)
      .finally(() => setLoading(false));
  }, [department]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center rounded-[16px] border py-12"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}
```
