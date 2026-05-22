---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_sections/DraftCartPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DraftCartPanel.tsx — DraftCartPanel.tsx 설명

## 이 파일은 무엇을 책임지나

`DraftCartPanel.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DraftCartPanel`
- `IoBatch`
- `StockRequest`
- `DeleteTarget`
- `Props`

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

import { useCallback, useEffect, useState } from "react";
import { api, type IoBatch, type StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { DraftCartItemRow } from "./DraftCartItemRow";
import { IoDraftWorkCard } from "./IoDraftWorkCard";

interface Props {
  employeeId: string | null;
  refreshNonce: number;
  onContinue: (draft: StockRequest) => void;
  onContinueIo?: (draft: IoBatch) => void;
  onChanged: () => void;
  onCountChange?: (n: number) => void;
}

type DeleteTarget =
  | { kind: "stock"; draft: StockRequest }
  | { kind: "io"; draft: IoBatch }
  | null;

export function DraftCartPanel({
  employeeId,
  refreshNonce,
  onContinue,
  onContinueIo,
  onChanged,
  onCountChange,
}: Props) {
  const [drafts, setDrafts] = useState<StockRequest[]>([]);
  const [ioDrafts, setIoDrafts] = useState<IoBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [opError, setOpError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!employeeId) {
      setDrafts([]);
      setIoDrafts([]);
      onCountChange?.(0);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [legacyRows, ioRows] = await Promise.all([
        api.listStockRequestDrafts(employeeId),
        api.listDrafts(employeeId),
      ]);
```
