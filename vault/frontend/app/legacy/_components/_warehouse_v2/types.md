---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/types.ts
tags: [vault, code-note, frontend, b-tier]
---

# types — IO 구성 뷰 타입 정의

> [!summary] 역할
> warehouse_v2 모듈에서 공용 타입 재노출 및 로컬 인터페이스 정의.

## 1. 이 파일의 역할

백엔드 API 타입(IoBundle, IoLine, Item 등)을 재내보내고, 로컬 전용 인터페이스 OperatorLike, IoComposeViewProps를 정의. IoComposeView와 그 자식들이 공유하는 props 계약.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_warehouse_v2/types.ts` ([[erp/frontend/app/legacy/_components/_warehouse_v2/types.ts|원본]])

## 3. 주요 import

- API types: `IoBatch`, `IoBundle`, `IoLine`, `IoSubType`, `IoWorkType`, `Item`, `ProductModel`, `Employee` from `@/lib/api`

## 4. 어디서 쓰이는지

- IoComposeView 및 모든 warehouse_v2 하위 컴포넌트
- useIoDraft, useIoWorkState 등 hook에서 타입 참조
- 부모: warehouse section 전체

## 5. ⚠️ 위험 포인트

> [!warning] API 타입 변경 시 이 파일의 재노출도 함께 갱신 필요

## 6. 수정 전 체크

- [ ] IoComposeViewProps 확장 후 모든 호출 지점 호환성 확인
- [ ] OperatorLike vs Employee 구분 명확화
