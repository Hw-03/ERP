# 📁 __tests__

## 이 폴더는 뭐예요?
`_warehouse_steps` 컴포넌트 폴더의 단위 테스트 모음. 창고 입출고 흐름에서 사용하는 유틸/상수 함수들이 올바르게 동작하는지 검증한다.

## 언제 여기를 보나요?
- 창고 입출고 관련 권한·상수 로직을 수정하기 전후 테스트 확인이 필요할 때
- Vitest 단위 테스트 실패 원인을 추적할 때

## 주요 파일
- `_constants.test.ts` — `canEnterIO` 함수의 `io_enabled` 기반 입출고 진입 허용 로직 검증

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_steps/_constants.ts]] — 테스트 대상 상수·유틸 정의
