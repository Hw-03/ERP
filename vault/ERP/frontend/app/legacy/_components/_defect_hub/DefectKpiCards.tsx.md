---
type: file-explanation
source_path: "frontend/app/legacy/_components/_defect_hub/DefectKpiCards.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DefectKpiCards.tsx — DefectKpiCards.tsx 설명

## 이 파일은 무엇을 책임지나

`DefectKpiCards.tsx`는 불량 격리, 폐기, 반품, 분해 같은 불량 처리 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DefectKpiCards`
- `DefectKpiKind`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_defect_hub/📁__defect_hub]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { KpiCard } from "../common/KpiCard";
import type { DefectKpi } from "@/lib/api/types/defects";

export type DefectKpiKind = "quarantined" | "over_one_year" | "pending" | "today";

interface Props {
  kpi: DefectKpi;
  onCardClick: (kind: DefectKpiKind) => void;
}

export function DefectKpiCards({ kpi, onCardClick }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <KpiCard
        label="격리 중"
        value={kpi.quarantined}
        hint="현재 DEFECTIVE 상태"
        tone={LEGACY_COLORS.red}
        onClick={() => onCardClick("quarantined")}
      />
      <KpiCard
        label="1년 이상 ⚠"
        value={kpi.over_one_year}
        hint="격리 후 365일 초과"
        tone="#b91c1c"
        onClick={() => onCardClick("over_one_year")}
      />
      <KpiCard
        label="결재 대기"
        value={kpi.pending_approval}
        hint="승인 대기 중인 처리"
        tone={LEGACY_COLORS.yellow}
        onClick={() => onCardClick("pending")}
      />
      <KpiCard
        label="오늘 처리"
        value={kpi.processed_today}
        hint="오늘 완료된 처리"
        tone={LEGACY_COLORS.green}
        onClick={() => onCardClick("today")}
      />
    </div>
  );
}
```
