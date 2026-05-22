---
type: file-explanation
source_path: "frontend/app/legacy/_components/_defect_hub/DefectDepartmentList.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DefectDepartmentList.tsx — DefectDepartmentList.tsx 설명

## 이 파일은 무엇을 책임지나

`DefectDepartmentList.tsx`는 불량 격리, 폐기, 반품, 분해 같은 불량 처리 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DefectDepartmentList`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_defect_hub/📁__defect_hub]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { LEGACY_COLORS, getDepartmentFallbackColor } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import type { DefectLocation } from "@/lib/api/types/defects";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function isOverOneYear(defectiveAt: string): boolean {
  const at = new Date(defectiveAt).getTime();
  return Date.now() - at > ONE_YEAR_MS;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

interface Props {
  locations: DefectLocation[];
  onProcess: (location: DefectLocation) => void;
}

export function DefectDepartmentList({ locations, onProcess }: Props) {
  // 부서별 그룹핑
  const grouped = groupByDepartment(locations);
  const depts = Object.keys(grouped).sort();

  // 접고 펼치기 상태: 기본 모두 펼침
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggleDept(dept: string) {
    setCollapsed((prev) => ({ ...prev, [dept]: !prev[dept] }));
  }

  if (depts.length === 0) {
    return (
      <div
        className="rounded-[14px] border px-6 py-8 text-center"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
      >
        <p className="text-base font-bold">격리된 불량 재고가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {depts.map((dept) => {
```
