---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/HistoryTable.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# HistoryTable.tsx — HistoryTable.tsx 설명

## 이 파일은 무엇을 책임지나

`HistoryTable.tsx`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `HistoryTable`
- `Props`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopHistoryView.tsx]] — `DesktopHistoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/transactions.py]] — `transactions.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TransactionLog } from "@/lib/api";
import { ioApi } from "@/lib/api/io";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState, LoadingSkeleton } from "../common";
import { formatHistoryDate } from "./historyFormat";
import type { HistorySelection } from "./historyConstants";
import { HistoryLogRow } from "./HistoryLogRow";
import { BatchHeader, OpBatchHeader, buildGroups } from "./historyTableHelpers";
import { BomBatchDetail } from "./BomBatchDetail";

type Props = {
  loading: boolean;
  filteredLogs: TransactionLog[];
  /** 조건 전체 카운트(서버 summary). 헤더 진행률(`100/342건`) 표시용. */
  totalCount?: number;
  selection: HistorySelection | null;
  onSelectLog: (log: TransactionLog) => void;
  onSelectBatch: (batchId: string, logs: TransactionLog[]) => void;
  /** 부모(DesktopHistoryView)가 들고 있는 batchCache — 우측 패널과 공유. */
  batchCache: Map<string, IoBatch>;
  setBatchCache: React.Dispatch<React.SetStateAction<Map<string, IoBatch>>>;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
};

const COLUMNS: { label: string; width?: string; minWidth?: string; align?: "left" | "center"; hidden?: boolean }[] = [
  { label: "일시", width: "140px", align: "center" },
  { label: "구분", width: "130px", align: "center" },
  { label: "품목명", minWidth: "180px" },
  { label: "변동요약", width: "150px", align: "center" },
  { label: "담당자", width: "130px", align: "center", hidden: true },
  { label: "메모", width: "70px", align: "center", hidden: true },
];

const VISIBLE_FETCH_CONCURRENCY = 4;

export function HistoryTable({
  loading,
  filteredLogs,
  totalCount,
  selection,
  onSelectLog,
  onSelectBatch,
  batchCache,
  setBatchCache,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: Props) {
```
