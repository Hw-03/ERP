# MobileMoreScreen.tsx

## 이 파일은 뭐예요?
하단 탭바 5번째 "더보기" 탭의 전폭 화면. 주간보고와 창고 지도 진입점을 큰 카드형 버튼으로 배치한다. 계정 PIN 변경·로그아웃은 글로벌 헤더 프로필 버튼에 이미 있어 여기서는 제외한다.

## 언제 보나요?
- 모바일 하단 탭바 "더보기" 탭을 누를 때
- `MobileShell`이 `activeTab === "more"`일 때 렌더

## 중요한 내용
- `MobileMoreScreen({ onWeekly, onWarehouseMap })` — 기본 export; 두 콜백으로 각각 주간보고·창고 지도 화면으로 전환
- `BigCard` — 아이콘 + 레이블 + 설명으로 구성된 로컬 큰 카드 버튼 컴포넌트; `flex-1`로 세로 균등 분할
- 2026-06-17에 "더보기 시트" 방식에서 5번째 전폭 탭으로 전환(이전 `MobileMoreSheet` 제거)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/MobileShell.tsx]] — 이 화면을 마운트하고 탭 전환 콜백을 내려주는 셸
- [[ERP/frontend/app/mes/_components/mobile/screens/MobileWeeklyScreen.tsx]] — `onWeekly` 콜백이 여는 화면
- [[ERP/frontend/app/mes/_components/mobile/screens/MobileWarehouseMapScreen.tsx]] — `onWarehouseMap` 콜백이 여는 화면
