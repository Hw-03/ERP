# DefectHubEntry.tsx

## 이 파일은 뭐예요?
불량 탭 데스크톱 진입 화면으로, 3장의 카드(불량 격리·바로 폐기·격리 목록)를 가로로 배치해 작업을 선택하게 한다. `IoWorkTypeStep` 패턴을 따르며 선택 즉시 `onSelect` 콜백을 호출한다.

## 언제 보나요?
- 데스크톱 불량 탭(`DesktopDefectView`)에 처음 진입했을 때
- 처리·목록 화면에서 뒤로가기로 허브로 돌아왔을 때

## 중요한 내용
- `Props.onSelect(id: DefectHubCardId)` — 카드 클릭 시 호출, 상위에서 뷰 전환
- `DEFECT_HUB_CARDS` 배열에서 카드 메타 읽어 렌더링 (`defectHubCards.ts`)
- 각 카드: 아이콘(accentKey 색), 큰 레이블, 설명 텍스트 3단 구성
- 그리드: `grid-cols-3 / grid-rows-1` — 가로 3등분 전폭 레이아웃

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_defect_hub/defectHubCards.ts]] — 카드 메타 (ID, 레이블, 아이콘, accentKey)
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectHubPanel.tsx]] — 모바일용 동등 허브 패널
