---
type: file-explanation
source_path: "frontend/app/legacy/_components/_defect_hub/DisassembleTree.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DisassembleTree.tsx — DisassembleTree.tsx 설명

## 이 파일은 무엇을 책임지나

`DisassembleTree.tsx`는 불량 격리, 폐기, 반품, 분해 같은 불량 처리 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DisassembleTree`
- `ChildDecision`
- `DisassembleTreeProps`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_defect_hub/📁__defect_hub]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useState } from "react";
import { deptAdjustmentApi } from "@/lib/api/dept-adjustment";
import { LEGACY_COLORS } from "@/lib/mes/color";

export interface ChildDecision {
  item_id: string;
  item_name: string;
  item_code: string;
  qty: number; // parentQty × 자식 1개당 수량
  action: "keep" | "scrap";
  reason_memo: string;
}

interface DisassembleTreeProps {
  parentItemId: string;
  parentQty: number;
  parentDept: string;
  decisions: ChildDecision[];
  onChange: (decisions: ChildDecision[]) => void;
}

export function DisassembleTree({
  parentItemId,
  parentQty,
  parentDept: _parentDept,
  decisions,
  onChange,
}: DisassembleTreeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // mount 시 BOM 자식 목록 로드 → decisions 초기화
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    deptAdjustmentApi
      .getBomTemplate(parentItemId, "disassembly", parentQty)
      .then((res) => {
        if (cancelled) return;
        const initial: ChildDecision[] = res.lines.map((line) => ({
          item_id: line.item_id,
          item_name: line.item_name,
          item_code: line.item_code ?? "",
          qty: line.quantity,
          action: "keep",
          reason_memo: "",
        }));
        onChange(initial);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
```
