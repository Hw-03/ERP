# InventoryCapacityPanel.tsx

## 이 파일은 뭐예요?
재고 화면에 품목의 생산 가능 수량 요약을 표시하는 패널 컴포넌트입니다. AF 블록이 있으면 AF 기준 3수량(출하 대기/빠른 생산/총생산)을 모델별 칩으로 표시하고, 없으면 legacy(즉시/최대) 방식으로 fallback합니다.

## 언제 보나요?
- 재고 화면 또는 품목 상세에서 `ProductionCapacity` 데이터가 있을 때
- `capacityData`가 null/undefined이면 아무것도 렌더하지 않음
- `onClick` prop이 주어지면 클릭 가능한 버튼으로 렌더("자세히 보기" 표시)

## 중요한 내용
- Export: `InventoryCapacityPanel`, `capacityStatusBadge(data)` (외부에서 배지 텍스트/색상 추출용)
- `capacityData.af` 유무로 `AfPanel` / `LegacyPanel` 분기
- `AfPanel`: `groupAfByModel`, `getPinnedPfNumbers` 사용 — 모델별 PF 핀 기반 수량 표시
- `capacityStatusBadge`: 상태 → `{ label, color }` 반환 (모바일 토글 배지에 사용)
- 모바일(`sm:hidden`): 표 레이아웃으로 헤더 줄 없이 3수량 표시
- 데스크톱: 인라인 칩(ModelLegend + ModelChip) 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/capacity.ts]] — `groupAfByModel`, `getPinnedPfNumbers`, `ModelCapacityGroup`
- [[ERP/frontend/lib/queries/useProductionQuery.ts]] — `usePfPinsQuery` (PF 핀 데이터)
- [[ERP/frontend/lib/api/types/production.ts]] — `ProductionCapacityAfBlock`, `ProductionCapacityAfStatus`
- [[ERP/frontend/lib/mes/model-labels.ts]] — `getModelLabel`
