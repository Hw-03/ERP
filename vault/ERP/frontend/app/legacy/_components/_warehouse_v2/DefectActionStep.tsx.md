---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_v2/DefectActionStep.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DefectActionStep.tsx — DefectActionStep.tsx 설명

## 이 파일은 무엇을 책임지나

`DefectActionStep.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DefectActionStep`
- `SummaryCard`
- `ActionOption`
- `DefectActionStepProps`

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

import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import type { IoSubType } from "./types";
import type { DefectLocation } from "@/lib/api/types/defects";
import type { ChildDecision } from "../_defect_hub/DisassembleTree";
import { ReasonFormFields } from "../_defect_hub/ReasonFormFields";
import { DisassembleTree } from "../_defect_hub/DisassembleTree";

interface DefectActionStepProps {
  subType: IoSubType;
  selectedLocation: DefectLocation;
  action: "scrap" | "restore" | "supplier_return" | "disassemble" | null;
  reasonCategory: string;
  reasonMemo: string;
  bomDecisions: ChildDecision[];
  onActionChange: (a: "scrap" | "restore" | "supplier_return" | "disassemble") => void;
  onReasonChange: (category: string, memo: string) => void;
  onBomDecisionsChange: (decisions: ChildDecision[]) => void;
  canAdvance: boolean;
  onAdvance: () => void;
}

function SummaryCard({ location }: { location: DefectLocation }) {
  return (
    <div
      className="rounded-[14px] border px-5 py-4"
      style={{
        background: tint(LEGACY_COLORS.red, 6),
        borderColor: tint(LEGACY_COLORS.red, 28),
      }}
    >
      <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>
        {location.item_name}
      </div>
      <div
        className="mt-0.5 flex flex-wrap items-center gap-3 text-xs font-bold"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        <span>{location.item_code}</span>
        <span>격리 수량 {formatQty(Number(location.quantity))}개</span>
        <span>{location.department}</span>
        <span>격리 {new Date(location.defective_at).toLocaleDateString("ko-KR")}</span>
      </div>
    </div>
  );
}

type ActionOption = {
  value: "scrap" | "restore" | "supplier_return" | "disassemble";
  label: string;
  desc: string;
};
```
