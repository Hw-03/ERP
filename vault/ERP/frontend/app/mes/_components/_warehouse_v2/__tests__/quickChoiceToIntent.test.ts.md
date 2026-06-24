# quickChoiceToIntent.test.ts

## 이 파일은 뭐예요?
`ioWorkType.ts`의 `quickChoiceToIntent`, `inboundChoices`, `outboundChoices` 세 함수를 검증하는 단위 테스트. 빠른 선택 버튼(dept_in/dept_out/wh_in/wh_out/receive)이 올바른 작업 의도(workType + subType/direction)로 변환되는지 확인한다.

## 언제 보나요?
- `ioWorkType.ts`의 `quickChoiceToIntent` 또는 `inboundChoices` 함수를 수정할 때
- 입고/출고 빠른 선택 항목(canReceive 분기 포함)의 동작을 확인할 때

## 중요한 내용
- `quickChoiceToIntent("dept_in")` → `{ workType: "process", direction: "in" }`
- `quickChoiceToIntent("wh_in")` → `{ workType: "warehouse_io", subType: "dept_to_warehouse" }`
- `inboundChoices(false)` → `["dept_in", "wh_in"]` (원자재 수령 제외)
- `inboundChoices(true)` → `["dept_in", "wh_in", "receive"]` (창고 권한자 포함)
- `outboundChoices` → 항상 `["dept_out", "wh_out"]`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts]] — 테스트 대상 함수 원본
