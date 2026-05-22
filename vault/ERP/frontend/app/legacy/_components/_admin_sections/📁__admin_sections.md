---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/
tags: [vault, index, folder-marker]
aliases:
  - "_admin_sections"
  - "_admin_sections.md"
---

# 📁 _admin_sections

> [!summary] 역할
> 관리자 화면(`DesktopAdminView`)을 구성하는 섹션 컴포넌트, 컨텍스트, 공유 상수 모음.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/app/legacy/_components/_admin_sections/` 의 vault 미러.

## 어떤 파일들이 있나

**상단 레벨 컴포넌트**
- [[erp/frontend/app/legacy/_components/_admin_sections/AdminSidebar.tsx.md|AdminSidebar.tsx]] — 관리자 탭 사이드바
- [[erp/frontend/app/legacy/_components/_admin_sections/AdminAuditLogSection.tsx.md|AdminAuditLogSection.tsx]] — 감사 로그 섹션
- [[erp/frontend/app/legacy/_components/_admin_sections/AdminDangerZone.tsx.md|AdminDangerZone.tsx]] — PIN 변경 / DB 리셋 위험 영역
- [[erp/frontend/app/legacy/_components/_admin_sections/AdminEmployeesSection.tsx.md|AdminEmployeesSection.tsx]] — 직원 관리 섹션
- [[erp/frontend/app/legacy/_components/_admin_sections/AdminMasterItemsSection.tsx.md|AdminMasterItemsSection.tsx]] — 마스터 품목 섹션
- [[erp/frontend/app/legacy/_components/_admin_sections/AdminModelsSection.tsx.md|AdminModelsSection.tsx]] — 제품 모델 섹션
- [[erp/frontend/app/legacy/_components/_admin_sections/AdminExportSection.tsx.md|AdminExportSection.tsx]] — 데이터 내보내기 섹션
- `AdminDepartmentsSection.tsx`, `AdminRightPanelContent.tsx`, `AdminSectionContent.tsx`
- `AssignedModelsEditor.tsx`, `DeptManagementPanel.tsx`, `SidebarButton.tsx`

**컨텍스트**
- [[erp/frontend/app/legacy/_components/_admin_sections/AdminEmployeesContext.tsx.md|AdminEmployeesContext.tsx]]
- [[erp/frontend/app/legacy/_components/_admin_sections/AdminMasterItemsContext.tsx.md|AdminMasterItemsContext.tsx]]
- [[erp/frontend/app/legacy/_components/_admin_sections/AdminModelsContext.tsx.md|AdminModelsContext.tsx]]
- `AdminDepartmentsContext.tsx`

**공유 상수**
- [[erp/frontend/app/legacy/_components/_admin_sections/adminShared.ts.md|adminShared.ts]] — `PROCESS_TYPE_OPTIONS`, `MODEL_SLOTS`, `UNIT_OPTIONS`, `EMPTY_ADD_FORM` 등

## 도메인 컨텍스트

관리자 화면은 사이드바 탭(`AdminSidebar`) 선택에 따라 우측에 섹션 컴포넌트를 교체하는 구조.  
`adminShared.ts` 에 공정 유형 코드(TR/TA/TF … PR/PA/PF — 6종 × 3단계 = 18종)와 제품 모델 슬롯(DX3000/COCOON/SOLO/ADX4000W/ADX6000) 이 정의되어 있다.  
각 Context는 해당 섹션의 API 호출·낙관적 업데이트 상태를 캡슐화한다.

## ⚠️ 위험 포인트

- `AdminDangerZone.tsx` 는 PIN 리셋과 DB 리셋을 직접 호출 — 운영 환경에서 accidental trigger 방지 로직 확인 필요.
- `adminShared.ts` 의 `PROCESS_TYPE_OPTIONS` 를 변경하면 품목 등록 폼과 필터 전체에 영향.

## 관련 가이드

- [[erp/_vault/guides/admin-flow]]

## 자식 폴더

- [[erp/frontend/app/legacy/_components/_admin_sections/_admin_primitives/📁__admin_primitives|_admin_primitives/]]
- [[erp/frontend/app/legacy/_components/_admin_sections/_bom_parts/📁__bom_parts|_bom_parts/]]
- [[erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/📁__bom_workbench|_bom_workbench/]]
- [[erp/frontend/app/legacy/_components/_admin_sections/_employees_parts/📁__employees_parts|_employees_parts/]]
- [[erp/frontend/app/legacy/_components/_admin_sections/_master_items_parts/📁__master_items_parts|_master_items_parts/]]
