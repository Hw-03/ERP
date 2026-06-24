# _constants.test.ts

## 이 파일은 뭐예요?
`_constants.ts`에 정의된 `canEnterIO` 함수를 단위 테스트하는 파일. 직원 객체의 `io_enabled` 필드만 보고 입출고 진입 허용 여부를 올바르게 판단하는지 검증한다.

## 언제 보나요?
- `canEnterIO` 로직을 수정하거나 `io_enabled` 관련 권한 조건을 바꿀 때
- 창고 입출고 진입 허용 규칙이 예상대로 동작하는지 확인할 때

## 중요한 내용
- 검증 대상: `canEnterIO(operator)` — `null`/`undefined`이면 `false`, `io_enabled` 미정의면 `true`, `false`면 부서·직책 무관하게 `false`, `true`면 `true`
- 테스트 케이스 4개: null 처리, `io_enabled` 미정의, `io_enabled=false`, `io_enabled=true`
- `warehouse_role`(`primary`/`deputy`/`none`)·`department` 값은 결과에 영향 없음을 함께 검증

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_steps/_constants.ts]] — 테스트 대상 `canEnterIO` 함수 정의
