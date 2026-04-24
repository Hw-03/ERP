---
type: code-note
project: ERP
layer: docs
source_path: docs/design/data.jsx
status: active
tags:
  - erp
  - docs
  - design
  - react
  - prototype
aliases:
  - 디자인 데이터 시안
---

# data.jsx

> [!summary] 역할
> ERP UI 리디자인 프로토타입에서 사용하는 **가상 데이터 정의** 파일.
> 디자인 시안(`ui.jsx`, `design-canvas.jsx`)이 참조하는 샘플 데이터 세트.

---

## 쉬운 말로 설명

**UI 디자인 시안용 "가짜 데이터 샘플"**. 디자이너가 실제 백엔드 연결 없이 화면 모양만 빨리 그려볼 때 사용. 실제 DB 와 무관.

## FAQ

**Q. 실제 DB 로 교체?**
디자인 확정 후 `frontend/lib/api.ts` 연결하며 제거. 현재는 `docs/design/` 만의 참조.

**Q. 이 데이터로 새 화면 만들기?**
가능. 단 최종 운영 전엔 반드시 실 API 로 교체.

---

## 관련 문서

- [[docs/design/ui.jsx.md]] — UI 컴포넌트 시안
- [[docs/design/design-canvas.jsx.md]] — 전체 디자인 캔버스

Up: [[docs/design/design]]
