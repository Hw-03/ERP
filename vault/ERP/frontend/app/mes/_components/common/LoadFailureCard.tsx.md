# LoadFailureCard.tsx

## 이 파일은 뭐예요?
데이터 로딩 실패 시 에러 메시지와 재시도 버튼을 표시하는 인라인 경고 카드입니다. `role="alert"`로 스크린리더에도 전달됩니다.

## 언제 보나요?
- API 요청이 실패해서 목록/상세를 표시할 수 없을 때
- 네트워크 오류나 서버 에러 응답을 사용자에게 알릴 때

## 중요한 내용
- `message` — 실패 원인 텍스트 (필수)
- `onRetry` — 미전달 시 `window.location.reload()` 기본값으로 폴백
- `retryLabel` — 버튼 텍스트, 기본값 `"동기화"`
- `prefix` — 접두 문구, 기본값 `"데이터를 불러오지 못했습니다"`; 화면에 `"{prefix} — {message}"` 형태로 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 색상 토큰
- [[ERP/frontend/app/mes/_components/common/index.ts]] — re-export 포함
