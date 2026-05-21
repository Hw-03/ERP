---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/useIoSubmit.ts
tags: [vault, code-note, frontend, b-tier]
---

# useIoSubmit — IO 작업 제출

> [!summary] 역할
> 입출고 작업을 서버 제출. 멱등성 UUID 생성, API 호출, 결과 상태 관리.

## 1. 이 파일의 역할

IoComposeView에서 최종 제출. 비보안 origin(LAN IP) 대응 UUID v4 폴백 구현. clientRequestIdRef로 폼 중복 제출 방지(멱등). submit API 호출 후 성공/에러 상태 반환. submitting 로딩 플래그 관리.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_warehouse_v2/useIoSubmit.ts` ([[erp/frontend/app/legacy/_components/_warehouse_v2/useIoSubmit.ts|원본]])

## 3. 주요 import

- `useRef`, `useState` from react
- `api`, `IoBundle`, `IoSubType`, `IoWorkType` from `@/lib/api`
- `ApiError` from `@/lib/api-core`

## 4. 어디서 쓰이는지

- IoConfirmStep에서 "제출" 버튼 클릭
- 결과 상태(success/error) → IoSubmitModals로 표시
- 부모: step 5 최종 액션

## 5. ⚠️ 위험 포인트

> [!warning] UUID 생성 실패 시 Math.random() 폴백 사용 (낮은 엔트로피)
> clientRequestIdRef 재사용 — 새 제출 시도마다 초기화 필요

## 6. 수정 전 체크

- [ ] crypto API 동작 환경(HTTP vs HTTPS) 반복 확인
- [ ] submit API 응답 포맷 변경 시 error handling 갱신
