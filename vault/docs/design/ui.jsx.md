---
type: code-note
project: ERP
layer: docs
source_path: docs/design/ui.jsx
status: active
tags:
  - erp
  - docs
  - design
  - react
  - prototype
aliases:
  - 디자인 UI 시안
---

# ui.jsx

> [!summary] 역할
> ERP UI 리디자인의 **핵심 UI 컴포넌트 시안**을 React로 작성한 파일.
> 실제 프로덕션 코드가 아닌, 디자인 검토 및 프로토타이핑용이다.

---

## 쉬운 말로 설명

**디자인 검토용 "UI 부품 스케치"**. 버튼/카드/리스트 같은 공통 컴포넌트를 React 로 그려본 파일. 확정된 디자인은 `frontend/` 하위의 TS 컴포넌트로 옮겨져 운영에 반영된다.

## FAQ

**Q. 실제 코드와 이 시안 중 뭐가 기준?**
실제 프로덕션은 `frontend/app/legacy/_components/` 의 `.tsx` 파일이 기준. 이 `.jsx` 는 아카이브 참고용.

**Q. 시안에만 있고 실제엔 아직 없는 컴포넌트는?**
우선순위 밀려 미구현일 수 있다. 확정 시 `frontend/app/legacy/_components/` 에 추가해야 한다.

---

## 관련 문서

- [[docs/design/data.jsx.md]] — 시안용 가상 데이터
- [[docs/design/design-canvas.jsx.md]] — 전체 캔버스
- [[docs/design/screens/desk-dashboard.jsx.md]] — 대시보드 화면 시안

Up: [[docs/design/design]]
