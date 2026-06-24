# 📁 _inventory_sections

## 이 폴더는 뭐예요?

재고 대시보드 탭(`DesktopInventoryView`)의 UI 섹션 모음입니다.

## 주요 파일

| 파일 | 역할 |
|------|------|
| `InventoryItemsTable.tsx` | 재고 메인 테이블 |
| `InventoryItemRow.tsx` | 재고 한 줄 |
| `InventoryDetailPanel.tsx` | 품목 상세 슬라이드 패널 (입고·이동·불량 진입) |
| `InventoryDetailLocations.tsx` | 부서별 재고 위치 상세 |
| `InventoryKpiPanel.tsx` | KPI 요약 카드 (총재고·창고재고·부족 등) |
| `InventoryCapacityPanel.tsx` | 생산 가능 수량 패널 |
| `InventoryFilterBar.tsx` | 상단 필터 바 |
| `InventoryFilterToggleButton.tsx` | 필터 토글 버튼 |
| `DesktopInventoryRightPanel.tsx` | 우측 상세 패널 컨테이너 |
| `InventoryActionRequired.tsx` | 조치 필요 알림 배너 |
| `inventoryFilter.ts` | 필터 상태 유틸 |

## 언제 여기를 보나요?

- 재고 테이블·KPI 표시가 이상할 때
- 품목 상세에서 입고·이동 동작이 틀렸을 때
- 생산 가능 수량 UI를 수정할 때

## 관련 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/inventory.py]] — 재고 공개 API
- [[ERP/backend/app/services/stock_math.py]] — 수량 계산 수식

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/routers/inventory/query.py]] — 재고 조회 API
> - [[ERP/backend/app/services/production_capacity.py]] — 생산 가능 수량 계산
