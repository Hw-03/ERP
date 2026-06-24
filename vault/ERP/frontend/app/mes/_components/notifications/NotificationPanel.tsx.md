# NotificationPanel.tsx

## 이 파일은 뭐예요?
NotificationBell이 열어주는 알림 드롭다운 패널 UI입니다. 알림 목록을 카드 형태로 보여주고, 읽지 않은 알림에 컬러 점·배경 강조 표시를 하며, 백엔드가 내려보내는 `request_type` 원시값을 한국어 라벨로 변환하는 `humanizeBody` 함수를 포함합니다.

## 언제 보나요?
- 알림 드롭다운의 개별 항목 스타일(읽음/미읽음 색상, 시간 포맷)을 수정할 때
- `request_type` 원시값이 알림 본문에 그대로 노출되는 버그를 추적할 때
- 알림 유형(approval_request / approved / rejected / handover_arrived)별 색상 체계를 파악할 때

## 중요한 내용
- `NotificationPanel({ items, unread, onItemClick, onMarkAll })` — props로 데이터·핸들러를 모두 받는 순수 표시 컴포넌트
- `TONE` 맵 — 알림 type별 색상: `approval_request`=파랑, `approval_approved`=초록, `approval_rejected`=빨강, `handover_arrived`=보라
- `humanizeBody(body)` — `" · "` 구분자로 토큰을 분리해 `REQUEST_TYPE_LABEL`로 한국어 변환
- `timeLabel(iso)` — ISO 날짜 문자열 → `M/D HH:mm` 포맷
- 읽지 않은 알림은 `tint(tone, 10)` 배경 + 컬러 점 표시, 읽은 알림은 투명 배경
- 목록 최대 높이 360px, 빈 상태 시 "알림이 없습니다." 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/notifications/NotificationBell.tsx]] — 이 패널을 여닫는 부모 컴포넌트
- [[ERP/frontend/lib/io/glossary.ts]] — `REQUEST_TYPE_LABEL` (request_type → 한국어 라벨 매핑)
- [[ERP/frontend/lib/api/types/📁_types]] — `AppNotification` 타입 정의
- [[ERP/frontend/lib/mes/colorUtils.ts]] — `tint()` 함수
