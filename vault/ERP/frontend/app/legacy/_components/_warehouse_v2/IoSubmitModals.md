---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/IoSubmitModals.tsx
tags: [vault, code-note, frontend, b-tier]
---

# IoSubmitModals — 입출고 작업 결과 모달

> [!summary] 역할
> 입출고 작업의 성공/실패 결과를 확인 모달로 표시.

## 1. 이 파일의 역할

입출고(IO) 작업 완료 후 성공 또는 에러 결과를 사용자에게 보여주는 모달 컴포넌트. 간단한 wrapper로 ConfirmModal을 활용해 결과 상태에 따라 tone(normal/danger)을 조정.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_warehouse_v2/IoSubmitModals.tsx` ([[erp/frontend/app/legacy/_components/_warehouse_v2/IoSubmitModals.tsx|원본]])

## 3. 주요 import

- `ConfirmModal` from `@/lib/ui/ConfirmModal`
- React 암묵적 사용 (`"use client"`)

## 4. 어디서 쓰이는지

- Warehouse IO workflow에서 submit 결과 표시
- `useIoSubmit` hook의 result state 연동
- 부모: IO 작업 페이지 컴포넌트

## 5. ⚠️ 위험 포인트

> [!warning] result가 null이면 모달 미표시 (onClose 반복 호출 주의)

## 6. 수정 전 체크

- [ ] ResultState 타입 확장 시 모달 tone 로직 점검
- [ ] ConfirmModal API 변경 확인
