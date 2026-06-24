# StatusPill.tsx

## 이 파일은 뭐예요?
상태 값(결재 상태, 처리 상태 등)을 색상 pill 뱃지로 표시하는 컴포넌트입니다. tone에 따라 파랑·초록·노랑·빨강·회색·시안으로 색이 결정됩니다.

## 언제 보나요?
- 입출고 내역, 재고 요청 등의 목록에서 현재 상태를 한눈에 보여줄 때
- 자유 텍스트 상태 문자열을 색상으로 변환해 표시해야 할 때

## 중요한 내용
- `StatusPillTone` — `"info"` | `"success"` | `"warning"` | `"danger"` | `"neutral"` | `"brand"` (시안)
- `TONE_COLOR` — tone → LEGACY_COLORS 매핑 상수
- `showDot` — 기본 true; pill 왼쪽에 원형 점 표시
- `inferToneFromStatus(status)` — 자유 텍스트를 받아 StatusPillTone 반환하는 헬퍼 함수; `mes-status.ts::inferTone` 래퍼로 "muted"를 "neutral"로 변환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes-status.ts]] — inferTone 원본 함수
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 색상 토큰
- [[ERP/frontend/app/mes/_components/common/index.ts]] — re-export 포함
