# itemSearch.test.ts

## 이 파일은 뭐예요?
`matchesItemSearch` 함수가 품목 검색 시 공백 제거, 대소문자 무시, mes_code 매칭, 제외 필드(legacy_part·location) 동작을 올바르게 처리하는지 검증하는 단위 테스트입니다.

## 언제 보나요?
- `frontend/lib/itemSearch.ts`의 검색 로직을 수정하거나 검색 대상 필드를 추가·제거할 때
- 품목 검색에서 예상치 못한 항목이 포함되거나 누락될 때

## 중요한 내용
- 빈 키워드는 항상 매칭
- 공백 제거 후 매칭: `"방사구너트"` → `"방사구 너트"` 매칭
- `mes_code`(예: `"6-AF-0001"`) 대소문자 무시 매칭
- `legacy_part`와 `location` 필드는 검색 대상에서 명시적으로 제외
- `makeItem()` 헬퍼로 `Item` 전체 필드 기본값 채움

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/itemSearch.ts]] — 테스트 대상 `matchesItemSearch` 구현체
- [[ERP/frontend/lib/api.ts]] — `Item` 타입 정의
