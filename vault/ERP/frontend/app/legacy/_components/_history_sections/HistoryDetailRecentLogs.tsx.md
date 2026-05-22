---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/HistoryDetailRecentLogs.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# HistoryDetailRecentLogs.tsx — HistoryDetailRecentLogs.tsx 설명

## 이 파일은 무엇을 책임지나

`HistoryDetailRecentLogs.tsx`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `HistoryDetailRecentLogs`

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

import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
import { formatHistoryDate } from "./historyFormat";
import { getHistoryDisplayLabel } from "./historyBatchInterpreter";

/**
 * Round-13 (#3) 추출 — HistoryDetailPanel 의 "이 품목의 최근 거래" 리스트.
 * Phase4 (#F4): 외부 카드 wrapper 제거 — 부모 Collapsible 이 카드와 헤더 담당.
 */
export function HistoryDetailRecentLogs({
  itemRecentLogs,
  onSelectLog,
}: {
  itemRecentLogs: TransactionLog[];
  onSelectLog: (log: TransactionLog) => void;
}) {
  if (itemRecentLogs.length === 0) {
    return (
      <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>최근 거래 없음</div>
    );
  }
  return (
    <div className="space-y-2">
      {itemRecentLogs.map((log) => (
        <button
          key={log.log_id}
          onClick={() => onSelectLog(log)}
          className="flex w-full items-center justify-between rounded-[14px] border p-3 text-left transition-all hover:brightness-110"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div className="flex-1 min-w-0">
            <span
              className="inline-flex rounded px-2 py-0.5 text-xs font-bold"
              style={{
                background: `color-mix(in srgb, ${transactionColor(log.transaction_type)} 14%, transparent)`,
                color: transactionColor(log.transaction_type),
              }}
            >
              {getHistoryDisplayLabel(log)}
            </span>
            <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {formatHistoryDate(log.created_at)}
            </div>
            {(log.quantity_before != null || log.quantity_after != null) && (
              <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                {log.quantity_before != null ? formatQty(log.quantity_before) : "-"} →{" "}
                {log.quantity_after != null ? formatQty(log.quantity_after) : "-"}
              </div>
            )}
          </div>
          <div
```
