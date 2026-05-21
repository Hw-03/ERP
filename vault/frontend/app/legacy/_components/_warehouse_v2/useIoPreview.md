---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/useIoPreview.ts
tags: [vault, code-note, frontend, b-tier]
---

# useIoPreview — IO 작업 사전 검증

> [!summary] 역할
> 입출고 제출 전 결과 미리보기(preview) API 호출. 부서/수량 미실현 확인.

## 1. 이 파일의 역할

IoComposeView에서 step 5(제출 확인) 시 preview 요청. workType, subType, 부서, target(품목/위치) 등을 서버에 전달하고 실제 가능한 작업 결과 확인. previewing 플래그로 로딩 상태 관리.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_warehouse_v2/useIoPreview.ts` ([[erp/frontend/app/legacy/_components/_warehouse_v2/useIoPreview.ts|원본]])

## 3. 주요 import

- `useState` from react
- `api`, `IoPreviewTarget` from `@/lib/api`
- `IoSubType`, `IoWorkType` from `./types`

## 4. 어디서 쓰이는지

- IoConfirmStep에서 제출 전 preview 확인
- API 결과로 실제 반영 결과 사용자 표시
- 부모: step 5 UI

## 5. ⚠️ 위험 포인트

> [!warning] targets 배열 고정(단일 항목만) — 확장 시 로직 재검토 필수

## 6. 수정 전 체크

- [ ] IoPreviewTarget 타입 변경 시 호출부 동기화
- [ ] preview 응답 포맷 변경 후 consumer 수정
