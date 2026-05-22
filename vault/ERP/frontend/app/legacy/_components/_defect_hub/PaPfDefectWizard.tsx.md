---
type: file-explanation
source_path: "frontend/app/legacy/_components/_defect_hub/PaPfDefectWizard.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# PaPfDefectWizard.tsx — PaPfDefectWizard.tsx 설명

## 이 파일은 무엇을 책임지나

`PaPfDefectWizard.tsx`는 불량 격리, 폐기, 반품, 분해 같은 불량 처리 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `PaPfDefectWizard`
- `ChildDecision`
- `DisposalAction`
- `PaPfDefectWizardProps`

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
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { DefectLocation } from "@/lib/api/types/defects";
import type { Department } from "@/lib/api/types/shared";
import { DisassembleTree, type ChildDecision } from "./DisassembleTree";
import { ReasonFormFields } from "./ReasonFormFields";

type DisposalAction = "unquarantine" | "scrap" | "disassemble";

interface PaPfDefectWizardProps {
  open: boolean;
  onClose: () => void;
  location: DefectLocation;
  currentEmployee: { employee_id: string; name: string; department: string };
  onSubmitted: () => void;
}

export function PaPfDefectWizard({
  open,
  onClose,
  location,
  currentEmployee,
  onSubmitted,
}: PaPfDefectWizardProps) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [action, setAction] = useState<DisposalAction>("disassemble");
  const [decisions, setDecisions] = useState<ChildDecision[]>([]);
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (!busy && e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, busy, onClose]);

  // action 변경 시 decisions 초기화
  useEffect(() => {
```
