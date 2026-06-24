# MobileDirtyLeaveSheet.tsx

## 이 파일은 뭐예요?
모바일 입출고 작성 중 다른 화면으로 이탈하려 할 때 뜨는 확인 바텀시트입니다. 작성 중인 묶음을 임시저장할지, 폐기하고 나갈지, 계속 작성할지 세 가지 선택지를 제공합니다.

## 언제 보나요?
- 입출고 위저드 작성 중 탭/네비게이션을 눌렀을 때 이탈 방지 시트가 뜨지 않거나 엉뚱하게 동작할 때
- "저장 안 하고 나가기" 버튼의 표시 조건을 확인해야 할 때

## 중요한 내용
- export: `MobileDirtyLeaveSheet` (named export)
- props: `open`, `onConfirm`(임시저장 후 이동), `onCancel`(계속 작성), `onDiscard?`(폐기 후 이동, optional)
- `onDiscard`가 undefined이면 "저장 안 하고 나가기" 버튼 자체가 숨겨짐
- `BottomSheet` + `SheetHeader` + `PrimaryActionButton` 조합으로 구성
- 임시저장 묶음은 위저드 단에서 처리 — 이 컴포넌트는 UI/확인 표시만 담당

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx]] — 이 시트를 열고 닫는 위저드 컨테이너
- [[ERP/frontend/app/mes/_components/mobile/primitives/📁_primitives]] — `SheetHeader`, `PrimaryActionButton` 공급처
