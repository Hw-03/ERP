# InlineSearch.tsx

## 이 파일은 뭐예요?
한글 IME 입력 안정화 처리가 내장된 모바일 인라인 검색 입력 컴포넌트입니다. composition 중에는 부모 `onChange`를 호출하지 않아 한글 입력 도중 글자가 잘리는 문제를 방지합니다.

## 언제 보나요?
- 목록 화면에서 품목명·사원명 등을 실시간으로 필터링할 때
- 바텀시트 내에서 검색어를 입력받을 때

## 중요한 내용
- `InlineSearch({ value, onChange, placeholder?, className?, autoFocus? })` — controlled 컴포넌트
- 한글 IME 안정화: `compositionStart/End` 이벤트로 composition 중 외부 `onChange` 차단, `compositionend`에서 한 번만 전송
- 내부 `draft` state로 외부 value와 별도 관리 (composition 중 외부 리셋 방지)
- X 버튼 클릭 시 검색어 즉시 초기화 + `onChange("")` 전송
- `inputMode="search"`, `enterKeyHint="search"` 모바일 키보드 최적화

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — `TYPO` 타이포 토큰 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
