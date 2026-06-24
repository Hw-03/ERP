# 📁 screens

## 이 폴더는 뭐예요?
모바일 셸(`MobileShell`)이 각 탭에 마운트하는 전체 화면 컴포넌트 모음. 대시보드·입출고·불량·내역·더보기(주간보고·창고 지도) 5개 탭 화면과 불량 처리/격리 흐름 전용 컴포넌트가 들어 있다. 각 화면은 데스크톱 뷰의 데이터·훅 오케스트레이션을 재사용하되 393px 세로 레이아웃에 맞게 재구성된 모바일 전용 컴포넌트다.

## 언제 여기를 보나요?
- 모바일 탭 화면 하나가 렌더되지 않거나 동작이 이상할 때
- 탭별 진입 props(권한, 사전 선택 품목, 주 날짜 등)를 확인할 때
- 데스크톱-모바일 동명 분리 정책이 적용된 컴포넌트(`MobileDefectProcessPanel`, `MobileDefectCartFlow`)를 찾을 때

## 주요 파일
- `index.ts` — 7개 화면 컴포넌트 배럴 export
- `MobileDashboardScreen.tsx` — 재고 대시보드 탭
- `MobileWarehouseScreen.tsx` — 입출고 탭 (compose 위저드 + 대기열/장바구니)
- `MobileDefectScreen.tsx` — 불량 허브 탭
- `MobileDefectProcessPanel.tsx` — 불량 위치 개별 처리 패널 (2단계)
- `MobileDefectCartFlow.tsx` — 다품목 불량 격리/바로 폐기 흐름 (2단계)
- `MobileHistoryScreen.tsx` — 입출고 내역 탭 (카드 리스트 + 캘린더)
- `MobileMoreScreen.tsx` — 더보기 탭 (주간보고·창고 지도 진입)
- `MobileWeeklyScreen.tsx` — 주간보고 화면
- `MobileWarehouseMapScreen.tsx` — 창고 지도 강제 가로 오버레이

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/MobileShell.tsx]] — 이 폴더의 화면을 탭에 마운트하는 진입 셸
- [[ERP/frontend/app/mes/_components/mobile/warehouse/📁_warehouse]] — 입출고 위저드 하위 컴포넌트
- [[ERP/frontend/app/mes/_components/mobile/history/📁_history]] — 내역 카드 리스트 하위 컴포넌트
