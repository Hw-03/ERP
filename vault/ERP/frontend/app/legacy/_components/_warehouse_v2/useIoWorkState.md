---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/useIoWorkState.ts
tags: [vault, code-note, frontend, b-tier]
---

# useIoWorkState — IO 작업 전체 상태 관리

> [!summary] 역할
> 입출고 마법사의 단계(step 1-5), 작업 유형, 세부 유형, 번들, 부서, 메모 등 전체 state 중앙 관리.

## 1. 이 파일의 역할

IoComposeView의 핵심 state hook. workType(receive/process/internal) 변경 시 subType, deptIoDirection, bundles 초기화. process 작업은 방향(in/out) 선택 후 subType 결정. step 진행 흐름과 각 단계별 필수 상태 확인 로직 제공.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_warehouse_v2/useIoWorkState.ts` ([[erp/frontend/app/legacy/_components/_warehouse_v2/useIoWorkState.ts|원본]])

## 3. 주요 import

- React: `useState`, `useMemo`
- Local: `IoBundle`, `IoLine`, `IoSubType`, `IoWorkType` from `./types`
- Local: `DEFAULT_SUB_TYPE`, `DeptIoDirection` from `./ioWorkType`

## 4. 어디서 쓰이는지

- IoComposeView 에서 중앙 state
- useIoDraft, useIoDraftRestore 에서 state 초기화
- 각 step UI 컴포넌트에서 참조 및 업데이트

## 5. ⚠️ 위험 포인트

> [!warning] workType 변경 시 bundles 초기화됨 — undo 기능 없음
> process 방향 변경 시 bundle 비워짐 — 사용자 재확인 필요

## 6. 수정 전 체크

- [ ] IoStep 추가 시 IO_STEP_LABELS 동기화
- [ ] DEFAULT_SUB_TYPE 변경 후 모든 workflow 검증
- [ ] deptIoDirection 관련 logic 복잡도 점검
