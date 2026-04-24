---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DesktopInventoryView.tsx
status: active
tags:
  - erp
  - frontend
  - component
aliases:
  - 데스크톱 재고 화면
---

# DesktopInventoryView.tsx

> [!summary] 역할
> 품목 검색과 재고 요약, 선택 품목 상세 조회를 담당하는 데스크톱 재고 화면.

## 쉬운 말로 설명

사용자가 "지금 뭐가 얼마나 있지?"를 가장 자주 확인하는 메인 화면 중 하나다.  
모바일 `InventoryScreen` 과 같은 데이터를 다른 방식으로 보여준다고 생각하면 이해가 쉽다.

## 핵심 책임

- 품목 검색과 리스트 표시
- 재고 요약 정보와 품목 상세 패널 연결
- 선택 품목을 창고/부서 입출고 흐름으로 넘길 준비

## 관련 문서

- [[frontend/app/legacy/_components/mobile/screens/InventoryScreen.tsx.md]]
- [[frontend/lib/api.ts.md]]

Up: [[frontend/app/legacy/_components/_components]]

