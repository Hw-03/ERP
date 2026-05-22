---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_steps/
tags: [vault, index, folder-marker]
aliases:
  - "_warehouse_steps"
  - "_warehouse_steps.md"
---

# 📁 _warehouse_steps

> [!summary] 역할
> 입출고 wizard의 step 단위 컴포넌트와 공유 타입·상수. 데스크톱·모바일 공용.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/app/legacy/_components/_warehouse_steps/` 의 vault 미러.

## 어떤 파일들이 있나

- [[erp/frontend/app/legacy/_components/_warehouse_steps/EmployeeStep.tsx.md|EmployeeStep.tsx]] — 담당자 선택 step. 직원 목록을 최대 10명 표시 후 "더 보기" 토글.
- [[erp/frontend/app/legacy/_components/_warehouse_steps/_constants.ts.md|_constants.ts]] — `WorkType`, `Direction`, `TransferDirection`, `DefectiveSource` 타입 + lucide 아이콘 매핑 상수. `canEnterIO()` 권한 판별 함수 포함.
- `index.ts` — barrel export (`canEnterIO` 포함)

## 도메인 컨텍스트

입출고 작업 유형(`WorkType`)은 4종: `raw-io` / `warehouse-io` / `dept-adjustment` / `defective-register`.  
`canEnterIO(role)` 함수는 `_constants.ts` 에 정의되어 있으며, `MobileShell.tsx` 와 데스크톱 뷰 모두 이 함수로 탭/버튼 접근 제어를 수행한다.  
실제 step 컴포넌트의 대부분은 `_warehouse_v2/` 또는 `_warehouse_sections/` 에 분리되어 있고, 이 폴더는 공용 primitive step 만 담는다.

## ⚠️ 위험 포인트

- `_constants.ts` 의 `WorkType` 을 변경하면 모바일·데스크톱 wizard 전체의 분기 로직이 영향받는다.
- `canEnterIO` 는 `MobileShell` 에서 직접 임포트 — 시그니처 변경 시 모바일 진입 제어가 깨질 수 있다.

## 관련 가이드

- [[erp/_vault/guides/warehouse-flow]]
