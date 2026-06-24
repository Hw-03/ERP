# InlineErrorNote.tsx

## 이 파일은 뭐예요?
불량 탭 전용 공용 인라인 에러 박스 컴포넌트다. 기존에 여러 곳에 흩어진 "연빨강 배경 + 빨강 보더 + 빨강 글씨" 패턴을 토큰(`LEGACY_COLORS.errorBg`, `tint(red, 30)`)으로 통일해 한 곳으로 모았다.

## 언제 보나요?
- 불량 관련 폼 제출 실패 시 에러 메시지 출력
- BOM 로드 실패, API 오류 등 인라인 피드백이 필요한 모든 상황

## 중요한 내용
- `variant`: `"compact"` (기본, 폼 인라인) | `"block"` (목록 영역용, 더 큰 패딩)
- `className` prop으로 외부 여백 조절 가능
- `memo`로 감싸 불필요한 리렌더 방지
- 다크모드 자동 대응 — 색상 토큰만 사용

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS.errorBg`, `LEGACY_COLORS.red` 토큰
- [[ERP/frontend/lib/mes/colorUtils.ts]] — `tint()` 유틸
