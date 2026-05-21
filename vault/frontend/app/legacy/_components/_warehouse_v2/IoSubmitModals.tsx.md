---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/IoSubmitModals.tsx
tags: [vault, code-note, auto-generated, stub]
---

# IoSubmitModals.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_v2/IoSubmitModals.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { ConfirmModal } from "@/lib/ui/ConfirmModal";

interface ResultState {
  kind: "success" | "error";
  title: string;
  message: string;
}

interface Props {
  result: ResultState | null;
  onClose: () => void;
}

export function IoSubmitModals({ result, onClose }: Props) {
  return (
    <ConfirmModal
      open={result !== null}
      title={result?.title ?? ""}
      tone={result?.kind === "error" ? "danger" : "normal"}
      confirmLabel="확인"
      cancelLabel="닫기"
      onClose={onClose}
      onConfirm={onClose}
    >
      <p className="text-sm">{result?.message}</p>
    </ConfirmModal>
  );
}
```
