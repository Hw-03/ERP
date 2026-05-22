---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_sections/DraftCartItemRow.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DraftCartItemRow.tsx — DraftCartItemRow.tsx 설명

## 이 파일은 무엇을 책임지나

`DraftCartItemRow.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DraftCartItemRow`
- `DraftCartItemRowProps`

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

import type { StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatQty } from "@/lib/mes/format";
import { REQUEST_TYPE_LABEL } from "./ioRequestLabels";

/**
 * Round-13 (#7) 추출 — DraftCartPanel 의 단일 draft 카드.
 *
 * draft 메타 + lines 미리보기 (최대 5건) + 이어서/삭제 버튼 2개 행.
 */
export interface DraftCartItemRowProps {
  draft: StockRequest;
  isBusy: boolean;
  onContinue: () => void;
  onRequestDelete: () => void;
}

export function DraftCartItemRow({
  draft,
  isBusy,
  onContinue,
  onRequestDelete,
}: DraftCartItemRowProps) {
  const totalQty = draft.lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);

  return (
    <div
      className="rounded-[14px] border px-5 py-4"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: LEGACY_COLORS.text }}>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 18%, transparent)`,
            color: LEGACY_COLORS.cyan,
          }}
        >
          작성중
        </span>
        <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
          {REQUEST_TYPE_LABEL[draft.request_type] ?? draft.request_type}
        </span>
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted }}>
          {draft.lines.length}건 · 총 {formatQty(totalQty)}
        </span>
        <span className="ml-auto text-xs" style={{ color: LEGACY_COLORS.muted }}>
          {new Date(draft.updated_at).toLocaleString("ko-KR", { hour12: false })}
        </span>
      </div>

      {draft.lines.length > 0 && (
```
