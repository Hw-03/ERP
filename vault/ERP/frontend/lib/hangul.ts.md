# hangul.ts

## 이 파일은 뭐예요?
두벌식 표준 키보드 기준으로 한글 ↔ QWERTY 변환을 처리하는 유틸리티입니다. 사용자가 영문 입력 상태에서 한글 자판으로 타이핑한 영타를 한글로 조립하거나, 한글 텍스트를 초성(ㄱㄱㅎ)으로 분해해 이름 검색에 활용합니다.

## 언제 보나요?
- 품목·직원 검색창에서 영타 오입력을 한글로 자동 변환하는 로직을 수정할 때
- 초성 검색(예: "ㄱㄱㅎ" → "김건호") 매칭 동작을 변경할 때

## 중요한 내용
- `toQwerty(text)` — 완성형 한글 음절 또는 호환 자모 → QWERTY 문자열
- `toChosung(text)` — 완성형 음절 → 초성 자모 문자열 (이름 초성검색용)
- `toHangul(input)` — QWERTY 문자열 → 두벌식 오토마타로 한글 음절 조립
- `JAMO_TO_KEY` / `KEY_TO_JAMO` — 자모↔키 매핑 테이블
- `JUNG_COMBO` / `JONG_COMBO` / `JONG_SPLIT` — 겹모음·겹받침 조합/분리 규칙

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/itemSearch.ts]] — `toChosung` / `toQwerty`를 활용해 품목 검색 매칭을 수행
