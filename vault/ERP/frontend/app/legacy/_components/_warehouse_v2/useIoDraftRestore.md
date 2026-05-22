---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/useIoDraftRestore.ts
tags: [vault, code-note, frontend, b-tier]
---

# useIoDraftRestore — Draft 복원 effect

> [!summary] 역할
> 저장된 draft를 IoComposeView state로 로드. 중복 복원 방지, ref 관리.

## 1. 이 파일의 역할

IoComposeView에서 인라인되던 draftToRestore effect를 추출. draft 변경 감지 시 workType, subType, bundles, 메타데이터 일괄 복원. process 작업은 deptIoDirection 추가 계산. restoredDraftRef로 중복 복원 방지, step을 4로 점프.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_warehouse_v2/useIoDraftRestore.ts` ([[erp/frontend/app/legacy/_components/_warehouse_v2/useIoDraftRestore.ts|원본]])

## 3. 주요 import

- `useEffect` from react
- `IoBatch`, `IoBundle` from `@/lib/api`
- `deptIoDirectionOf` from `./ioWorkType`
- `useIoWorkState` (타입만)

## 4. 어디서 쓰이는지

- IoComposeView에서 draftToRestore props 전달받아 호출
- useIoWorkState state 전체 복원
- autosaveBatchIdRef 동기화

## 5. ⚠️ 위험 포인트

> [!warning] 부모가 전달한 refs 직접 조작 — 부수효과 의존
> setDeptIoDirectionRaw 사용으로 통상 flow 우회

## 6. 수정 전 체크

- [ ] normalizeBundles 함수 제공 필수 확인
- [ ] process subType → direction 매핑 정합성 점검
- [ ] step 4 점프 후 UI 흐름 검증
