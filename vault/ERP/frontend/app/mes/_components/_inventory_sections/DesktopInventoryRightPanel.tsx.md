# DesktopInventoryRightPanel.tsx

## 이 파일은 뭐예요?
데스크톱 재고 화면 오른쪽에 슬라이딩으로 열리는 품목 상세 패널 래퍼 컴포넌트입니다. `SlidePanel`(다이얼로그 역할)과 `DesktopRightPanel`(헤더 레이아웃)을 조합하고, 내용은 `InventoryDetailPanel`에 위임합니다.

## 언제 보나요?
- 재고 테이블에서 행을 클릭해 `selectedItem`이 설정될 때 슬라이드로 열림
- `selectedItem`이 null이어도 `displayItem`(마지막 선택 품목)을 유지해 닫힘 애니메이션 중에 내용이 사라지지 않음

## 중요한 내용
- Export: `DesktopInventoryRightPanel`, `DesktopInventoryRightPanelProps`
- Props: `selectedItem`, `displayItem`, `headerBadge`, `onClose`, `onGoToWarehouse`, `canReceive?`, `imageFilename?`
- `SlidePanel open={!!selectedItem}` — null이면 닫힘
- subtitle: `legacy_part`가 있으면 `mes_code · legacy_part`, 없으면 `mes_code`만

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_inventory_sections/InventoryDetailPanel.tsx]] — 패널 내용 컴포넌트
- [[ERP/frontend/app/mes/_components/common/📁_common]] — `SlidePanel` 컴포넌트
- [[ERP/frontend/app/mes/_components/DesktopRightPanel.tsx]] — 헤더+레이아웃 컴포넌트
