# useAdminEmployeesConfirm.ts

## 이 파일은 뭐예요?
직원 관리 화면의 세 가지 확인 다이얼로그(활성화 토글 / PIN 초기화 / 삭제) 상태를 관리하는 sub-hook입니다. 어떤 직원이 대상인지, PIN 입력값·에러 메시지를 각각 state로 보관합니다.

## 언제 보나요?
- "정말 삭제하시겠습니까?" 다이얼로그 상태가 어디서 오는지 확인할 때
- PIN 초기화 확인 팝업의 입력·에러 흐름을 추적할 때

## 중요한 내용
- `confirmTarget` / `setConfirmTarget`: 활성화 토글 대상 직원
- `pinResetTarget` + `pinResetAdminPin` + `pinResetError`: PIN 초기화 확인용 3-state
- `deleteTarget` / `setDeleteTarget`: 삭제 확인 대상 직원
- `requestPinReset(e)`: target 설정 + PIN·에러 초기화 한 번에 처리
- `cancelPinReset()`: 팝업 닫기 + 입력값 전부 정리

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/useAdminEmployees.ts]] — 이 훅을 포함하는 wrapper
