---
type: file-explanation
source_path: "frontend/app/legacy/_components/ItemDetailHistoryList.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# ItemDetailHistoryList.tsx — ItemDetailHistoryList.tsx 설명

## 이 파일은 무엇을 책임지나

`ItemDetailHistoryList.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ItemDetailHistoryList`
- `ItemDetailHistoryListProps`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getTransactionLabel, transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
export interface ItemDetailHistoryListProps {
  logs: TransactionLog[];
}

/**
 * ItemDetailSheet 의 "최근 입출고" 이력 리스트.
 * Round-9 (R9-3) 분리. 동작/스타일 변화 0.
 */
export function ItemDetailHistoryList({ logs }: ItemDetailHistoryListProps) {
  return (
    <>
      <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted }}>
        📋 최근 입출고
      </div>
      <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {logs.length === 0 ? (
          <div className="px-[14px] py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            최근 이력이 없습니다.
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={log.log_id}
              className="flex items-start gap-2 px-[14px] py-[10px]"
              style={{
                borderBottom: index === logs.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
              }}
            >
              <span
                className="rounded px-[6px] py-[2px] text-[10px] font-bold"
                style={{
                  background:
                    log.transaction_type === "RECEIVE" ? "rgba(31,209,122,.15)" : "rgba(242,95,92,.15)",
                  color: transactionColor(log.transaction_type),
                }}
              >
                {getTransactionLabel(log.transaction_type)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {new Date(log.created_at).toLocaleString("ko-KR")}
                </div>
                {log.produced_by ? (
                  <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
                    👤 {log.produced_by}
                  </div>
                ) : null}
                {log.notes ? (
                  <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted }}>
```
