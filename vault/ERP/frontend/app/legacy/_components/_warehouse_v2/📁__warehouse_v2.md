---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/
tags: [vault, index, folder-marker]
aliases:
  - "_warehouse_v2"
  - "_warehouse_v2.md"
---

# 📁 _warehouse_v2

> [!summary] 역할
> 입출고 작업 화면 v2 재설계 결과물. UI 진입점·상태 관리·제출 흐름이 모두 이 폴더에 집중되어 있다.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/app/legacy/_components/_warehouse_v2/` 의 vault 미러.

## 어떤 파일들이 있나

핵심 컴포넌트:
- `IoSubmitModals.tsx` — 제출 성공/실패 결과 모달. `ConfirmModal` 래퍼. `IoSubmitResultState` 타입 export
- `IoBundleCard.tsx` — 입출고 묶음(bundle) 카드 UI. BOM 자동 전개 / 단품 분기 렌더. 기준 수량 stepper 포함
- `IoComposeView.tsx` — 5단계 작업 구성 뷰 최상위 컴포넌트 (1:유형 → 2:세부 → 3:대상 → 4:반영 → 5:확인)
- `IoConfirmStep.tsx` — Step 5 확인 화면
- `IoTargetPicker.tsx` — Step 3 대상 품목 선택
- `IoBundleCart.tsx` — 묶음 장바구니 목록
- `IoWorkTypeStep.tsx` — Step 1/2 작업 유형 선택

핵심 훅:
- `useIoWorkState.ts` — 5단계 전체 상태(workType, subType, bundles, step 등) 관리. `IoStep` 타입 및 `IO_STEP_LABELS` 정의
- `useIoDraft.ts` — `api.saveDraft` / `api.getDraft` 래퍼. 임시저장 비동기 상태
- `useIoDraftRestore.ts` — draft 복원 전용 effect 추출. `restoredDraftRef` / `autosaveBatchIdRef` 주입 패턴
- `useIoPreview.ts` — 제출 전 재고 예측 미리보기
- `useIoSubmit.ts` — 최종 제출 처리

유틸:
- `types.ts` — `IoBundle`, `IoLine`, `IoSubType`, `IoWorkType`, `IoComposeViewProps` 등 로컬 타입 (대부분 `@/lib/api` re-export)
- `ioWorkType.ts` — `IO_WORK_TYPES`, `DEFAULT_SUB_TYPE`, `DeptIoDirection`, 레이블 함수들
- `bomSync.ts` — BOM 자동 전개 동기화 로직
- `_atoms.tsx` — Jotai 또는 Context 기반 원자 상태

## 도메인 컨텍스트

입출고 작업은 **receive(입고) / ship(출고) / transfer(이동) / process(공정)** 4가지 `IoWorkType` 을 가진다.
`process` 유형은 방향(`DeptIoDirection`: in/out)을 추가로 선택해야 한다.
BOM 부모 품목을 선택하면 자재가 자동 전개되어 `IoBundle.lines` 에 `origin: "bom_auto"` 라인으로 포함된다.

## ⚠️ 위험 포인트

- `useIoWorkState` 는 service layer(`api.saveDraft`, `api.submitBatch`)와 강결합되어 있다. 상태 변경 시 backend service 영향 확인 필수.
- BOM cascade 수량 변경은 `onQuantityChange` 경로로만 처리한다. 직접 `bundles` 상태를 조작하면 자식 라인 수량이 비동기 불일치 발생 가능.
- `useIoDraftRestore` 는 `restoredDraftRef` 중복 복원 방지 guard 를 갖는다. 이 ref 를 외부에서 reset 하면 복원이 무한 반복될 수 있다.

## 관련 가이드

- [[erp/_vault/guides/warehouse-io-flow]]

## 자식 폴더

없음 (플랫 구조)
