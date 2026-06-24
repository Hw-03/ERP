# itemSearch.ts

## 이 파일은 뭐예요?
품목 검색에 특화된 공용 매칭 헬퍼입니다. `item_name`·`mes_code` 두 필드만 대상으로 하고, 양쪽의 공백을 제거한 뒤 소문자 부분 문자열 비교로 "방사구너트" ↔ "방사구 너트" 같은 무공백 매칭을 지원합니다.

## 언제 보나요?
- 품목 선택 드롭다운·검색창에서 필터 로직을 수정할 때
- 검색 대상 필드를 추가하거나 매칭 방식을 바꿀 때

## 중요한 내용
- `matchesItemSearch(item, keyword)` — `item_name`·`mes_code`를 합쳐 무공백·소문자 비교 후 boolean 반환
- `normalize(text)` — 내부 헬퍼: 소문자화 + 모든 공백 제거 (멱등)
- `legacy_part`·`location`·`supplier` 는 의도적으로 검색 제외 (무관 품목 혼입 방지)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/index.ts]] — `Item` 타입 정의 원천
- [[ERP/frontend/lib/hangul.ts]] — 초성·영타 변환으로 검색 전처리 시 함께 사용
