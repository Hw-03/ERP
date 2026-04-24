---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DesktopWarehouseView.tsx
status: active
tags:
  - erp
  - frontend
  - component
aliases:
  - 데스크톱 입출고 화면
---

# DesktopWarehouseView.tsx

> [!summary] 역할
> 입고, 출고, 이동, 불량 등 창고 중심 작업을 처리하는 데스크톱 화면.
> 큐 배치와 직접 반영 흐름이 만나는 사용자 조작 지점이라서 프론트/백 모두 연결해서 읽어야 한다.

## 핵심 책임

- 입출고/이동 작업 폼 제공
- 선택 품목과 수량을 작업 흐름으로 연결
- 결과 메시지와 후속 새로고침 트리거

## 관련 문서

- [[backend/app/routers/queue.py.md]]
- [[backend/app/services/inventory.py.md]]
- [[frontend/app/legacy/_components/mobile/io/io]]

Up: [[frontend/app/legacy/_components/_components]]

