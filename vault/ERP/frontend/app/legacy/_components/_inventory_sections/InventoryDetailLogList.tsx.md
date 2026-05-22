---
type: file-explanation
source_path: "frontend/app/legacy/_components/_inventory_sections/InventoryDetailLogList.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# InventoryDetailLogList.tsx — InventoryDetailLogList.tsx 설명

## 이 파일은 무엇을 책임지나

`InventoryDetailLogList.tsx`는 대시보드/재고 화면의 목록, 상세, 필터, KPI 표시를 구성하는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `InventoryDetailLogList`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopInventoryView.tsx]] — `DesktopInventoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/query.py]] — `query.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.
- [[ERP/backend/app/services/inventory.py]] — 입고, 출고, 부서 이동, 불량 처리처럼 실제 재고 숫자를 바꾸는 업무 규칙을 담은 핵심 파일입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getTransactionLabel, transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";

/**
 * Round-13 (#8) 추출 — InventoryDetailPanel 의 "최근 이력" 섹션.
 */
export function InventoryDetailLogList({ logs }: { logs: TransactionLog[] }) {
  return (
    <section
      className="rounded-[28px] border p-5"
      style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
    >
      <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
        최근 이력
      </div>
      <div className="space-y-2">
        {logs.length === 0 ? (
          <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
            최근 거래 이력이 없습니다.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.log_id}
              className="rounded-[18px] border p-3"
              style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: transactionColor(log.transaction_type) }}>
                  {getTransactionLabel(log.transaction_type)}
                </span>
                <span className="text-sm">{formatQty(log.quantity_change)}</span>
              </div>
              <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                {log.notes || "메모 없음"}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
```
