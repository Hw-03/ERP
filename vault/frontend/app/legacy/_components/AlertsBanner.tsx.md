---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/AlertsBanner.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - legacy
  - alerts
aliases:
  - 알림 배너
---

# AlertsBanner.tsx

> [!summary] 역할
> 화면 상단에 안전재고 미달 알림을 표시하는 배너 컴포넌트.

> [!info] 주요 책임
> - 미확인 알림 수 표시
> - 알림 클릭 시 상세 내용 확인 및 acknowledge 처리

---

## 쉬운 말로 설명

**상단에 항상 떠 있는 작은 노란 배너**. 미확인 알림(`acknowledged=false`) 이 1개라도 있으면 표시, 없으면 `null` 렌더(사라짐).

마운트 시 `api.listAlerts({ includeAcknowledged: false })` 1회 호출 + **60초마다 자동 재조회**.

클릭 시 `/alerts` 페이지로 이동.

---

## 표시 예시

```
⚠️ 미확인 알림 5건 · 안전재고 3 · 실사편차 2  →
```

`SAFETY` 와 `COUNT_VARIANCE` 두 종류만 세부 카운트 표시.

---

## FAQ

**Q. 알림 놓쳤을 때?**
최대 60초 지연. 더 빠르게 보려면 폴링 주기 단축(`60_000` → `10_000`).

**Q. 새로운 알림 종류 추가하면 배너에 표시됨?**
표시는 됨(`alerts.length` 에 포함). 다만 세부 카운트 라벨은 SAFETY/COUNT_VARIANCE 만 하드코딩. 추가 시 코드 수정 필요.

**Q. 왜 Link 로 구현? router.push 로 안 하나?**
Next.js `<Link>` 가 SSR 이점(pre-fetch). 그냥 `<a>` 보다 빠름.

---

## 관련 문서

- [[backend/app/routers/alerts.py.md]] — `/api/alerts`
- [[frontend/app/alerts/alerts]] — `/alerts` 페이지
- [[frontend/app/legacy/_components/DesktopLegacyShell.tsx.md]]

Up: [[frontend/app/legacy/_components/_components]]
