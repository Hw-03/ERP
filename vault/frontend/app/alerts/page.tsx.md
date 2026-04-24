---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/alerts/page.tsx
status: active
tags:
  - erp
  - frontend
  - route
  - alerts
aliases:
  - 알림 페이지 라우트
---

# app/alerts/page.tsx

> [!summary] 역할
> `/alerts` 경로 접속 시 루트(`/`)로 리다이렉트하는 래퍼 파일.
> 실제 알림 기능은 레거시 UI의 `AlertsBanner` 컴포넌트에서 처리한다.

---

## 쉬운 말로 설명

**`/alerts` → `/` 리디렉션 래퍼**. 알림 기능은 독립 페이지가 아니라 레거시 UI 상단에 띄우는 `AlertsBanner` 로 구현되어 있음.

`AlertsBanner` 는 60초마다 `/alerts/summary` API 를 폴링해서 안전재고 미만 품목, 실사 차이 건수를 상단에 띄움.

## FAQ

**Q. 알림 상세 화면?**
배너 클릭 → 현재는 해당 모듈(재고/실사)로 이동. 독립 "알림 센터" 페이지는 없음.

**Q. 푸시 알림?**
없음. 폴링만. 웹푸시 구현은 Service Worker + notification API 필요.

---

## 관련 문서

- [[frontend/app/legacy/_components/AlertsBanner.tsx.md]] — 실제 알림 배너
- [[frontend/app/alerts/alerts]] — 라우트 폴더 인덱스
- [[backend/app/routers/alerts.py.md]] — 알림 API

Up: [[frontend/app/app]]
