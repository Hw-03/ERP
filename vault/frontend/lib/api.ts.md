---
type: code-note
project: ERP
layer: frontend
source_path: frontend/lib/api.ts
status: active
tags:
  - erp
  - frontend
  - api-client
aliases:
  - API 클라이언트
  - api.ts
---

# api.ts

> [!summary] 역할
> 프론트엔드가 백엔드와 통신할 때 쓰는 단일 API 클라이언트 파일.
> 타입 정의, 공통 fetch 처리, 품목/재고/배치/모델/패키지/경고/실사 API가 모두 여기 모여 있다.

## 쉬운 말로 설명

화면 코드가 백엔드에 직접 말 걸지 않고, 늘 이 파일을 거쳐서 요청한다.  
그래서 프론트와 백을 연결하는 "전화 교환실" 같은 역할이라고 보면 된다.

## 이번 브랜치에서 특히 볼 것

- `ProductModel` 타입과 `/api/models` 연동이 추가됐다.
- queue, 생산, 경고, 실사, 패키지 같은 운영 기능 타입이 더 촘촘해졌다.
- 모바일 화면이 늘어나면서 같은 API를 데스크톱/모바일이 함께 재사용하는 비중이 커졌다.

## 핵심 책임

- 공통 URL/에러 처리
- 주요 도메인 타입 선언
- 품목/재고/생산/큐/직원/모델/패키지/설정 API 호출 제공

## 관련 문서

- [[backend/app/routers/routers]]
- [[backend/app/routers/models.py.md]]
- [[frontend/app/legacy/page.tsx.md]]

Up: [[frontend/lib/lib]]

