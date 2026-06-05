---
type: file-explanation
source_path: "frontend/app/legacy/_components/notifications/NotificationPanel.tsx"
importance: normal
layer: frontend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# NotificationPanel.tsx — 종을 누르면 펼쳐지는 알림 목록 드롭다운

## 이 파일은 무엇을 책임지나

종 아이콘 아래로 펼쳐지는 알림 목록을 그립니다. 알림 한 건마다 종류에 맞는 색, 제목, 본문, 시간을 보여 주고, 안 읽은 알림은 옅은 배경 + 점으로 구분합니다. 클릭·"모두 읽음" 같은 실제 동작은 종([[ERP/frontend/app/legacy/_components/notifications/NotificationBell.tsx]])이 처리하고, 이 파일은 보여 주기만 합니다.

## 업무 흐름에서의 의미

창고 담당자가 종을 눌렀을 때 "무슨 일이 있었는지"를 시간순으로 훑어보는 목록입니다. 색으로 종류를 빠르게 구분할 수 있습니다.

- 파란색 — 결재 요청
- 초록색 — 결재 승인
- 빨간색 — 결재 반려
- 보라색 — 인수인계 도착

안 읽은 알림은 옅게 칠해져 있어, 아직 확인 안 한 것만 골라 보기 쉽습니다. 항목을 누르면 그 알림과 연결된 화면으로 이동합니다.

## 언제 보면 좋나

- 알림 종류별 색/표시를 바꾸거나 새 종류를 추가할 때 (`TONE` 표)
- 시간 표기 형식을 바꿀 때 (`timeLabel`)
- 안 읽음/읽음 표시 모양을 조정할 때

## 중요한 내용

- `TONE` — 알림 종류(`approval_request`/`approval_approved`/`approval_rejected`/`handover_arrived`)별 강조색 표. 없는 종류는 파란색 기본값.
- `timeLabel(iso)` — 알림 시각을 "월/일 시:분"으로 표기.
- 안 읽은 알림(`!n.is_read`)은 종류색을 10% 틴트한 배경 + 왼쪽 점으로 강조.
- 목록이 비면 "알림이 없습니다." 표시, 안 읽은 게 있으면 헤더에 "모두 읽음" 버튼.

## 연결되는 파일

### 먼저 같이 볼 파일

- [[ERP/frontend/app/legacy/_components/notifications/NotificationBell.tsx]] — 이 패널을 열고 클릭·모두읽음 콜백을 넘겨 주는 부모.

## 핵심 발췌

```tsx
const TONE: Record<string, string> = {
  approval_request: LEGACY_COLORS.blue,
  approval_approved: LEGACY_COLORS.green,
  approval_rejected: LEGACY_COLORS.red,
  handover_arrived: LEGACY_COLORS.purple,
};
```
