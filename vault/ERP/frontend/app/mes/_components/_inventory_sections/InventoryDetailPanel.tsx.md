# InventoryDetailPanel.tsx

## 이 파일은 뭐예요?
품목 상세 패널의 전체 내용을 렌더하는 핵심 컴포넌트입니다. 이미지, 수량 현황(승인 대기/사용 가능/공급처), 승인 대기 예약 목록, 위치별 재고, BOM 하위 구성 펼치기, 빠른 작업(입고/출고) 버튼을 순서대로 표시합니다.

## 언제 보나요?
- 데스크톱: `DesktopInventoryRightPanel` → `SlidePanel` 안에서
- 모바일: 인라인 빠른작업 시트에서 (`quickActionVariant="mobile"`)

## 중요한 내용
- Props: `item: Item`, `onGoToWarehouse(item, intent?)`, `canReceive?: boolean`, `imageFilename?: string`, `quickActionVariant?: "mobile" | "desktop"`
- `pendingQty > 0`이면 `api.getItemReservations(item.item_id)` 호출 → 예약 목록 표시
- 품목 변경 시 BOM 접기 + 입출고 메뉴 닫기(`useEffect`)
- 빠른 작업: mobile 변형은 입고(파랑)/출고(빨강) 2버튼 나란히 + 서브옵션 아래 전폭, desktop은 2열 드롭다운
- `inboundChoices(canReceive)`, `outboundChoices`, `quickChoiceToIntent` — `_warehouse_v2/ioWorkType`에서 import

## 위험도
🔴 높음 — `api.getItemReservations` 직접 호출(비 React Query). 품목 변경 시 cleanup cancel 처리는 되어 있으나, 에러 시 조용히 빈 배열로 처리됨. 재고·예약 수량 표시 로직 수정 시 주의.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_inventory_sections/InventoryDetailLocations.tsx]] — 위치별 재고 섹션
- [[ERP/frontend/app/mes/_components/_warehouse_v2/BomSubExpander.tsx]] — BOM 하위 구성 펼치기
- [[ERP/frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts]] — 입출고 작업 유형 정의
- [[ERP/frontend/lib/api.ts]] — `api.getItemReservations`, `Item`, `StockRequestReservationLine`
