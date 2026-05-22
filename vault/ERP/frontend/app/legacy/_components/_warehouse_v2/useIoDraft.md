---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/useIoDraft.ts
tags: [vault, code-note, frontend, b-tier]
---

# useIoDraft — IO 임시 저장 및 복원

> [!summary] 역할
> 입출고 작업 중단 시 draft 저장, 재개 시 복원. API 통신 처리.

## 1. 이 파일의 역할

현재 IO 작업 상태를 서버에 draft로 저장(saveDraft) 및 불러오기(restoreDraft) 처리. drafting 플래그로 로딩 상태 관리. API 호출 payload 변환(snake_case로 통일).

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_warehouse_v2/useIoDraft.ts` ([[erp/frontend/app/legacy/_components/_warehouse_v2/useIoDraft.ts|원본]])

## 3. 주요 import

- `useState` from react
- `api`, `IoBundle`, `IoSubType`, `IoWorkType` from `@/lib/api`

## 4. 어디서 쓰이는지

- IoComposeView 에서 draft 저장/복원 트리거
- useIoDraftRestore 보조
- 부모: IO workflow step 3~4 전환 시점

## 5. ⚠️ 위험 포인트

> [!warning] 동시 다중 draft 저장 요청 가능 — 경합 주의
> restoreDraft 호출 후 state 동기화 필요

## 6. 수정 전 체크

- [ ] API payload 필드명 변경 시 snake_case 매핑 확인
- [ ] draft 저장 실패 시 재시도 로직 검토
