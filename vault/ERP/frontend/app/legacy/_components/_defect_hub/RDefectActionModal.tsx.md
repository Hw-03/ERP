---
type: file-explanation
source_path: "frontend/app/legacy/_components/_defect_hub/RDefectActionModal.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# RDefectActionModal.tsx — RDefectActionModal.tsx 설명

## 이 파일은 무엇을 책임지나

`RDefectActionModal.tsx`는 불량 격리, 폐기, 반품, 분해 같은 불량 처리 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `RDefectActionModal`
- `RAction`
- `RDefectActionModalProps`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_defect_hub/📁__defect_hub]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { DefectLocation } from "@/lib/api/types/defects";
import { ReasonFormFields } from "./ReasonFormFields";

type RAction = "unquarantine" | "scrap" | "return";

const ACTION_LABELS: Record<RAction, string> = {
  unquarantine: "정상 복귀",
  scrap: "폐기",
  return: "공급처 반품",
};

const ACTION_DESC: Record<RAction, string> = {
  unquarantine: "잘못 격리된 경우. 즉시 처리 (결재 불필요).",
  scrap: "재고에서 제거합니다. 결재 후 처리됩니다.",
  return: "공급처에 반품합니다. 결재 후 처리됩니다.",
};

export interface RDefectActionModalProps {
  open: boolean;
  onClose: () => void;
  location: DefectLocation;
  currentEmployee: { employee_id: string; name: string; department: string };
  onSubmitted: () => void;
}

/**
 * R(원자재) 격리 항목 처리 모달.
 * 정상복귀 → defectsApi.unquarantine (즉시).
 * 폐기/반품 → stockRequestsApi.createStockRequest (결재 흐름).
 */
export function RDefectActionModal({
  open,
  onClose,
  location,
  currentEmployee,
  onSubmitted,
}: RDefectActionModalProps): JSX.Element | null {
  const [action, setAction] = useState<RAction>("unquarantine");
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const titleId = useId();
  const panelRef = useFocusTrap<HTMLDivElement>(open);
```
