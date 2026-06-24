# ErrorAlert.tsx

## 이 파일은 뭐예요?
모바일 화면에서 에러 또는 경고 메시지를 인라인으로 표시하는 박스 컴포넌트입니다. `message`가 없으면 아무것도 렌더링하지 않아, 호출처에서 별도 조건부 렌더링 없이 그냥 넘겨주기만 하면 됩니다.

## 언제 보나요?
- 폼 제출 실패 / 서버 에러 메시지를 사용자에게 보여줄 때
- 입력값 유효성 검증 실패 경고를 표시할 때

## 중요한 내용
- `ErrorAlert({ message, tone?, className? })` — `tone`은 `"danger"(빨강)` 또는 `"warning"(노랑)`, 기본값 `"danger"`
- `message`가 falsy면 `null` 반환 (조건부 렌더링 불필요)
- `role="alert"` 속성으로 스크린 리더 접근성 지원
- 배경색은 해당 tone 색상에 `18` 불투명도(hex)를 적용한 반투명 처리

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — `TYPO` 타이포 토큰 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
