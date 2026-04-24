---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DesktopAdminView.tsx
status: active
tags:
  - erp
  - frontend
  - component
aliases:
  - 데스크톱 관리자 화면
---

# DesktopAdminView.tsx

> [!summary] 역할
> 데스크톱 관리자 화면의 메인 컴포넌트.
> 품목, 직원, 모델, BOM, 출하 패키지, 내보내기, 설정 흐름을 한 화면 안에서 관리한다.

## 쉬운 말로 설명

관리자 탭에 들어갔을 때 보이는 "관리 콘솔"이다.  
예전보다 다루는 섹션이 많아졌고, 특히 제품 모델 관리와 BOM/패키지 편집 흐름이 한데 모여 있다.

## 핵심 책임

- PIN 해제 전후 화면 분기
- 관리자 섹션별 데이터 로딩과 선택 상태 관리
- 품목/직원/모델/BOM/패키지 편집 작업 연결
- 우측 패널과 상태 메시지 업데이트

## 관련 문서

- [[frontend/lib/api.ts.md]]
- [[backend/app/routers/models.py.md]]
- [[backend/app/routers/items.py.md]]

Up: [[frontend/app/legacy/_components/_components]]

