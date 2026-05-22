---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/history/MobileHistoryList.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# MobileHistoryList.tsx — MobileHistoryList.tsx 설명

## 이 파일은 무엇을 책임지나

`MobileHistoryList.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `MobileHistoryList`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/history/📁_history]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { Layers, Package } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";
import { EmptyState, LoadingSkeleton } from "../../common";
import { formatHistoryDate } from "../../_history_sections/historyFormat";
import { rowTint } from "../../_history_sections/historyTheme";
import {
  getHistoryActor,
  getHistoryDisplayLabel,
  getSingleLogMovement,
} from "../../_history_sections/historyBatchInterpreter";
import { MovementSummaryCell, buildGroups } from "../../_history_sections/historyTableHelpers";

/**
 * 입출고 내역 모바일 카드 리스트.
 *
 * 데스크탑 HistoryTable(와이드 6열 테이블 — 393px 에서 우측 잘림)을 대체.
 * 묶음 그룹화는 동일 순수함수 buildGroups 를 그대로 재사용(golden 무관 호출).
 * 행 탭 → 부모가 BottomSheet 상세를 연다.
 */
export function MobileHistoryList({
  loading,
  filteredLogs,
  selectedKey,
  onSelectLog,
  onSelectBatch,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: {
  loading: boolean;
  filteredLogs: TransactionLog[];
  selectedKey: string | null;
  onSelectLog: (log: TransactionLog) => void;
  onSelectBatch: (batchId: string, logs: TransactionLog[]) => void;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (loading) {
    return (
      <div className="px-3 py-2">
        <LoadingSkeleton variant="list" rows={8} />
      </div>
    );
  }
  if (filteredLogs.length === 0) {
    return (
      <div className="px-3 py-10">
        <EmptyState variant="no-data" />
      </div>
    );
```
