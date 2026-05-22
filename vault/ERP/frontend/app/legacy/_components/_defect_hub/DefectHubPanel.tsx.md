---
type: file-explanation
source_path: "frontend/app/legacy/_components/_defect_hub/DefectHubPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DefectHubPanel.tsx — DefectHubPanel.tsx 설명

## 이 파일은 무엇을 책임지나

`DefectHubPanel.tsx`는 불량 격리, 폐기, 반품, 분해 같은 불량 처리 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DefectHubPanel`
- `DefectKpiKind`
- `DefectScope`
- `DefectSort`
- `DefectHubEmployee`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_defect_hub/📁__defect_hub]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { defectsApi } from "@/lib/api/defects";
import type { DefectKpi, DefectLocation } from "@/lib/api/types/defects";
/** DefectHubPanel 이 필요한 최소 직원 필드 */
export interface DefectHubEmployee {
  employee_id: string;
  name: string;
  department: string;
}
import { DefectKpiCards, type DefectKpiKind } from "./DefectKpiCards";
import { DefectQuickActions } from "./DefectQuickActions";
import { DefectFilterBar, type DefectScope, type DefectSort } from "./DefectFilterBar";
import { DefectDepartmentList } from "./DefectDepartmentList";
import { RDefectActionModal } from "./RDefectActionModal";
import { PaPfDefectWizard } from "./PaPfDefectWizard";
import { AddQuarantineModal } from "./AddQuarantineModal";

/** item_code 2번째 segment 가 process_type. PA/PF 면 BOM 분해 가능. */
function isPaPfItem(itemCode: string | null | undefined): boolean {
  if (!itemCode) return false;
  const parts = itemCode.split("-");
  if (parts.length < 2) return false;
  return parts[1] === "PA" || parts[1] === "PF";
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const PRODUCTION_LINES = new Set(["튜브", "고압", "진공", "튜닝", "조립", "출하"]);

interface Props {
  defectDeptFilter?: string | null;
  currentEmployee: DefectHubEmployee;
}

const DEFAULT_KPI: DefectKpi = {
  quarantined: 0,
  over_one_year: 0,
  pending_approval: 0,
  processed_today: 0,
};

export function DefectHubPanel({ defectDeptFilter, currentEmployee }: Props) {
  const [kpi, setKpi] = useState<DefectKpi>(DEFAULT_KPI);
  const [locations, setLocations] = useState<DefectLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // defectDeptFilter prop 이 있으면 내 부서 필터로 초기 설정,
  // 없으면 생산 라인이면 "my", 아니면 "all"
  const initialScope = (): DefectScope => {
    if (defectDeptFilter) return "my";
    return PRODUCTION_LINES.has(currentEmployee.department) ? "my" : "all";
  };
```
