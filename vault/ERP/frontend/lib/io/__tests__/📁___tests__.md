# 📁 __tests__

## 이 폴더는 뭐예요?
`frontend/lib/io/` 도메인 유틸리티의 단위 테스트를 모아 두는 폴더입니다. 출입고 사전(glossary)처럼 여러 화면이 공유하는 핵심 로직이 실수로 바뀌지 않도록 drift 방지 테스트를 둡니다.

## 언제 여기를 보나요?
- `lib/io/` 아래 파일을 수정한 뒤 테스트가 실패할 때 원인 파악
- 새 도메인 유틸을 추가하고 테스트 파일을 어디에 둘지 결정할 때

## 주요 파일
- `glossary.test.ts` — IoWorkType·IoSubType·TransactionType 사전 키 완전성 및 캐노니컬 라벨 고정 검증

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/io/glossary.ts]] — 테스트 대상인 출입고 도메인 사전
