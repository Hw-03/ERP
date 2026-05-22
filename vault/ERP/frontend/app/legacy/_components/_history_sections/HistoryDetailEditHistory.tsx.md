---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/HistoryDetailEditHistory.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# HistoryDetailEditHistory.tsx — HistoryDetailEditHistory.tsx 설명

## 이 파일은 무엇을 책임지나

`HistoryDetailEditHistory.tsx`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `HistoryDetailEditHistory`

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

import type { TransactionEditLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { parseUtc } from "./historyFormat";

/**
 * Round-13 (#3) 추출 — HistoryDetailPanel 의 수정 이력 본문.
 * Phase4 (#F4): 외부 카드 wrapper 제거 — 부모 Collapsible 이 카드와 헤더 담당.
 */
export function HistoryDetailEditHistory({ edits }: { edits: TransactionEditLog[] }) {
  return (
    <div className="space-y-2">
      {edits.map((e) => (
        <div
          key={e.edit_id}
          className="rounded-[12px] border p-3 text-sm"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
              {e.edited_by_name}
            </span>
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {parseUtc(e.created_at).toLocaleString("ko-KR")}
            </span>
          </div>
          <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            사유: <span style={{ color: LEGACY_COLORS.text }}>{e.reason}</span>
          </div>
          {e.correction_log_id && (
            <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.yellow }}>
              수량 보정 거래 생성됨
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```
