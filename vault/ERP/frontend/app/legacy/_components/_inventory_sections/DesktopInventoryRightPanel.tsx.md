---
type: file-explanation
source_path: "frontend/app/legacy/_components/_inventory_sections/DesktopInventoryRightPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DesktopInventoryRightPanel.tsx — DesktopInventoryRightPanel.tsx 설명

## 이 파일은 무엇을 책임지나

`DesktopInventoryRightPanel.tsx`는 대시보드/재고 화면의 목록, 상세, 필터, KPI 표시를 구성하는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DesktopInventoryRightPanel`
- `DesktopInventoryRightPanelProps`

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

import type { Item, TransactionLog } from "@/lib/api";
import { SlidePanel } from "../common";
import { DesktopRightPanel } from "../DesktopRightPanel";
import { InventoryDetailPanel } from "./InventoryDetailPanel";

/**
 * Round-13 (#9) 추출 — DesktopInventoryView 우측 슬라이딩 상세 패널.
 *
 * `selectedItem` 가 null 이어도 lastSelected 표시를 유지해야 하므로 `displayItem` 을 별도로 받음.
 * `onClose` — 패널 닫기(행 선택 해제). SlidePanel 의 X 버튼 / ESC / focus-trap / role=dialog 로 처리
 * (history 패널과 동일 패턴 — 헤더 중복 X 버튼 제거).
 */
export interface DesktopInventoryRightPanelProps {
  selectedItem: Item | null;
  displayItem: Item | null;
  itemLogs: TransactionLog[];
  headerBadge: React.ReactNode;
  onClose: () => void;
  onGoToWarehouse: (item: Item) => void;
}

export function DesktopInventoryRightPanel({
  selectedItem,
  displayItem,
  itemLogs,
  headerBadge,
  onClose,
  onGoToWarehouse,
}: DesktopInventoryRightPanelProps) {
  return (
    <SlidePanel open={!!selectedItem} onClose={onClose}>
      {displayItem && (
        <DesktopRightPanel
          title={displayItem.item_name}
          subtitle={displayItem.legacy_part ? `${displayItem.item_code} · ${displayItem.legacy_part}` : (displayItem.item_code ?? undefined)}
          headerBadge={headerBadge}
        >
          <InventoryDetailPanel item={displayItem} logs={itemLogs} onGoToWarehouse={onGoToWarehouse} />
        </DesktopRightPanel>
      )}
    </SlidePanel>
  );
}
```
