---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/DesktopHistoryRightPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DesktopHistoryRightPanel.tsx — DesktopHistoryRightPanel.tsx 설명

## 이 파일은 무엇을 책임지나

`DesktopHistoryRightPanel.tsx`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DesktopHistoryRightPanel`
- `DesktopHistoryRightPanelProps`

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

import { ChevronLeft } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { SlidePanel } from "../common";
import { DesktopRightPanel } from "../DesktopRightPanel";
import { HistoryDetailPanel } from "./HistoryDetailPanel";
import { HistoryBatchDetailPanel } from "./HistoryBatchDetailPanel";
import type { HistorySelection } from "./historyConstants";

/**
 * Round-13 (#15) 추출 — DesktopHistoryView 우측 슬라이딩 상세 패널.
 * history-batch-detail-2026-05-15: selection union 분기 (kind="log" | "batch").
 */
export interface DesktopHistoryRightPanelProps {
  selection: HistorySelection | null;
  /** 닫히는 동안에도 패널 내용을 유지하기 위한 마지막 selection. */
  displaySelection: HistorySelection | null;
  batchCache: Map<string, IoBatch>;
  setBatchCache: React.Dispatch<React.SetStateAction<Map<string, IoBatch>>>;
  itemRecentLogs: TransactionLog[];
  onSelectLog: (log: TransactionLog) => void;
  /** 드릴(BOM 하위·최근거래) 스택이 있으면 "← 뒤로" 노출. */
  canGoBack: boolean;
  onBack: () => void;
  onLogUpdated: (updated: TransactionLog) => void;
  onLogCorrected: (result: { original: TransactionLog; correction: TransactionLog }) => void;
  /** 패널 닫기 (선택 해제). */
  onClose: () => void;
}

export function DesktopHistoryRightPanel({
  selection,
  displaySelection,
  batchCache,
  setBatchCache,
  itemRecentLogs,
  onSelectLog,
  canGoBack,
  onBack,
  onLogUpdated,
  onLogCorrected,
  onClose,
}: DesktopHistoryRightPanelProps) {
  return (
    <SlidePanel open={!!selection} onClose={onClose}>
      {canGoBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex items-center gap-1 rounded-[12px] border px-3 py-1.5 text-xs font-bold"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue }}
        >
```
