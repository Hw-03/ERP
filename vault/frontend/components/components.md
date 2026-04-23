---
type: index
project: ERP
layer: frontend
source_path: frontend/components/
status: active
tags:
  - erp
  - frontend
  - component
aliases:
  - 공용 컴포넌트
---

# frontend/components

> [!summary] 역할
> 레거시 UI 외부에서 공통으로 사용하는 컴포넌트 폴더.

## 하위 문서

- [[frontend/components/AppHeader.tsx.md]] — 앱 공용 헤더
- [[frontend/components/CategoryCard.tsx.md]] — 카테고리 카드
- [[frontend/components/UKAlert.tsx.md]] — UK(미분류) 품목 알림

---

## 쉬운 말로 설명

`legacy/_components/` 외부에서 **공통으로 쓰는 컴포넌트** 폴더. 현재는 3개. 범위가 좁고 주로 새 UI 작업용.

### 각 컴포넌트
- **AppHeader** — 앱 상단 공용 헤더 (로고, 타이틀)
- **CategoryCard** — 카테고리(RM/TA/FG 등) 요약 카드
- **UKAlert** — 미분류(UK) 품목 경고 (카테고리가 UK인 품목이 있을 때 노출)

---

## FAQ

**Q. legacy 쪽 컴포넌트와 뭐가 다른가?**
- `legacy/_components/` — 현재 운영 중인 레거시 UI 전용
- `components/` — 여러 곳에서 쓰거나, 새 UI 전환용

**Q. 새 공용 컴포넌트는 여기에?**
특정 화면에 묶이지 않으면 여기로. 레거시 UI 내부에서만 쓰면 `legacy/_components/`.

---

## 관련 문서

- [[frontend/frontend]] (상위)
- [[frontend/app/legacy/_components/_components]] — 레거시 전용 컴포넌트

Up: [[frontend/frontend]]
