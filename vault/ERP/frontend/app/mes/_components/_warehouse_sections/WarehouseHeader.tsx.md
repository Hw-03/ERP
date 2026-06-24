# WarehouseHeader.tsx

## 이 파일은 뭐예요?
창고 화면 최상단에 배치되는 헤더 컴포넌트로, 데이터 로드 실패 시에만 오류 카드를 표시하고 정상 상태에서는 null을 반환한다.

## 언제 보나요?
- `DesktopWarehouseView`에서 초기 품목 목록 로드가 실패했을 때
- 오류 메시지를 화면 상단에 띄워야 할 때

## 중요한 내용
- `WarehouseHeader({ loadFailure })` — 단일 export, `loadFailure`가 null이면 아무것도 렌더하지 않음

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/common/LoadFailureCard.tsx]] — 실제 오류 카드 UI 컴포넌트
