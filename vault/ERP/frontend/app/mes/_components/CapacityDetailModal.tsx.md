# CapacityDetailModal.tsx

## 이 파일은 뭐예요?
생산 가능 수량을 AF(조립 완제품) 기준으로 상세 보여 주는 전역 모달입니다. AF별 3가지 수량(출하 대기·빠른 생산·총생산)과 연결된 PF 변형, BOM 미완성 경고를 표시합니다.

## 언제 보나요?
- 대시보드 탭 상단 생산 가능 수량 배너를 클릭했을 때 (DesktopMesShell → `capacityModal` 상태)

## 중요한 내용
- **props**: `capacityData: ProductionCapacity | null`, `onClose`
- `af` 블록이 없으면(구버전 응답) "AF 기준 데이터 없음" 메시지 표시
- **AfCapacityView 내부 구조**
  - `groupAfByModel()` 로 모델(model_symbol)별 그룹화
  - 그룹 접기/펼치기(`expandedGroups`), AF 행 접기/펼치기(`expandedIds`) 두 단계 트리
  - 모바일(`sm:hidden`) / 데스크톱(`hidden sm:block`) 레이아웃 분리 렌더
  - PF 변형(variants) 패널에서 "기준 PF" 핀 지정·해제 가능 (`usePfPinsQuery` / `useSetPfPinMutation` / `useClearPfPinMutation`)
- 노란 경고 배너: "AF별 독립 계산 — 공유 자재 동시 보장 불가" 힌트 항상 노출

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/capacity.ts]] — `groupAfByModel`, `getPinnedPfNumbers` 유틸
- [[ERP/frontend/lib/queries/useProductionQuery.ts]] — PF 핀 쿼리·뮤테이션
- [[ERP/frontend/lib/api/types/production.ts]] — `ProductionCapacity`, `ProductionCapacityAfBlock` 타입
- [[ERP/frontend/app/mes/_components/DesktopMesShell.tsx]] — 모달 오픈 트리거
