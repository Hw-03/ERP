# InventoryKpiPanel.tsx

## 이 파일은 뭐예요?
재고 화면 상단의 KPI 카드 4개(전체/정상/부족/품절)를 가로로 나열하는 패널 컴포넌트입니다. 카드를 클릭하면 해당 필터가 활성화되어 테이블 행을 필터링합니다.

## 언제 보나요?
- 재고 화면 진입 시 항상 표시
- 카드 클릭 시 `onChange(key)` 호출 → 테이블 필터 전환

## 중요한 내용
- Export 타입: `KpiFilter = "ALL" | "NORMAL" | "LOW" | "ZERO"`, `KpiCardData`
- Props: `cards: KpiCardData[]`, `activeKey: KpiFilter`, `onChange: (key: KpiFilter) => void`
- `KpiCardData` 구조: `label`, `value`, `hint`, `tone`, `key`
- 2열(모바일) / 4열(데스크톱 lg:) 그리드
- 개별 카드는 `KpiCard` 공통 컴포넌트에 위임

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/common/KpiCard.tsx]] — 실제 카드 렌더 컴포넌트
- [[ERP/frontend/app/mes/_components/_inventory_sections/inventoryFilter.ts]] — `KpiFilter` 타입 재사용
