---
type: folder-note
source_path: "frontend/app/legacy/_components/notifications"
importance: important
layer: frontend
graph: hub
updated: 2026-06-05
project: DEXCOWIN MES
---

# 📁 notifications

## 이 폴더는 무엇을 위한 곳인가

데스크톱 화면 상단 오른쪽에 있는 "종 아이콘 알림" 기능이 들어 있는 폴더입니다. 결재 요청·승인·반려, 인수인계 도착 같은 일이 생기면 종에 빨간 배지가 뜨고, 종을 누르면 알림 목록이 드롭다운으로 펼쳐집니다.

부품은 두 개입니다.

- `NotificationBell.tsx` — 종 아이콘 + 안 읽은 개수 배지 + 30초마다 알림을 받아오는 부분.
- `NotificationPanel.tsx` — 종을 눌렀을 때 뜨는 알림 목록 드롭다운.

## 현장 업무와의 관계

내가 올린 입출고 요청이 승인/반려됐거나, 내가 결재해야 할 요청이 들어왔거나, 인수인계서가 우리 부서로 도착했을 때 알려 줍니다. 알림을 누르면 안 읽음 표시가 사라지고, 그 알림과 연결된 화면(탭·섹션)으로 바로 이동합니다. 일일이 화면을 돌아다니며 확인하지 않아도 종만 보면 처리할 일이 있는지 알 수 있습니다.

## 언제 보면 좋나

- 알림이 안 뜨거나 배지 숫자가 안 맞을 때
- 알림을 눌러도 해당 화면으로 안 넘어갈 때 (이동 경로 = `target_tab`/`target_section`)
- 새 알림 종류(색·아이콘)를 추가할 때

## 먼저 볼 파일

- [[ERP/frontend/app/legacy/_components/notifications/NotificationBell.tsx]] — 종 아이콘·배지·폴링·클릭 처리(읽음 표시 + 화면 이동).
- [[ERP/frontend/app/legacy/_components/notifications/NotificationPanel.tsx]] — 알림 목록 드롭다운(종류별 색·시간 표시).

## 조심할 점

- 알림은 30초 폴링이라 즉시(실시간 push)가 아니라 최대 30초 지연이 있을 수 있습니다.
- 로그인 작업자(employee_id)가 없으면 종 자체가 보이지 않습니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/frontend/app/legacy/_components/📁__components]]
- 종을 배치하는 곳: [[ERP/frontend/app/legacy/_components/DesktopTopbar.tsx]]
