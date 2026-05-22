---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_sections/
tags: [vault, index, folder-marker]
aliases:
  - "_warehouse_sections"
  - "_warehouse_sections.md"
---

# 📁 _warehouse_sections

> [!summary] 역할
> 데스크톱 입출고 화면(`DesktopWarehouseView`)의 헤더·탭·행·카드 단위 UI 섹션 모음.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/app/legacy/_components/_warehouse_sections/` 의 vault 미러.

## 어떤 파일들이 있나

핵심 파일:
- `WarehouseHeader.tsx` — 데이터 로드 실패 시 `LoadFailureCard` 표시 전담. 정상 상태는 null 반환
- `WarehouseDraftPanelTabs.tsx` — `sectionTab` 에 따라 cart / mine / queue / dept_queue 패널 분기 렌더
- `DraftCartItemRow.tsx` — 카트 내 개별 품목 행 (수량 조정·삭제 포함)
- `MyRequestRow.tsx` — 내 요청 목록의 단일 행
- `WarehouseQueueRow.tsx` — 승인 대기열 단일 행. 승인/반려 인라인 폼 포함, 부모로부터 상태·mutator 주입
- `IoDraftWorkCard.tsx` — 임시저장된 `IoBatch` 를 카드 형태로 표시. 상대 시각(`n분 전`) 포맷 포함
- `WarehouseAccessDenied.tsx` — 권한 없는 부서(AS·연구·영업 등) 접근 시 차단 카드

부수 파일:
- `DraftCartPanel.tsx` — 카트 전체 패널
- `MyRequestsPanel.tsx` — 내 요청 전체 패널
- `DepartmentQueuePanel.tsx` — 부서 승인 대기열 패널
- `WarehouseQueuePanel.tsx` — 창고 승인 대기열 패널
- `WarehouseSectionTabs.tsx` — 탭 정의 타입 및 컴포넌트 (`WarehouseSectionTab` union 타입 export)

## 도메인 컨텍스트

`WarehouseDraftPanelTabs` 가 `sectionTab` 값(`"cart"` / `"mine"` / `"queue"` / `"dept_queue"` / `"compose"`)에 따라
적절한 패널을 렌더한다. `"compose"` 탭 콘텐츠는 이 컴포넌트 외부(`IoComposeView`)에서 처리한다.

승인 흐름: 창고 담당(`canSeeQueue`) 또는 부서 담당(`canSeeDeptQueue`) 역할 여부에 따라
`WarehouseQueuePanel` / `DepartmentQueuePanel` 접근이 분기된다.

서버 시간은 `timezone-naive UTC` 로 저장되므로 `IoDraftWorkCard` 내부에서 `Z` suffix 보정 처리가 있다.
(backend UTC 정리 완료 후 제거 예정)

## ⚠️ 위험 포인트

- `WarehouseQueueRow` 는 부모에서 `approvePin`, `rejectReason` 등 인라인 폼 상태를 모두 주입받는다.
  해당 props 를 변경하거나 제거하면 승인·반려 기능이 직접 영향을 받는다.
- `IoDraftWorkCard` 는 `_warehouse_v2/ioWorkType` 의 레이블 함수를 직접 참조한다.
  `ioWorkType.ts` 의 레이블 맵 변경 시 이 카드 표시도 같이 바뀐다.

## 관련 가이드

- [[erp/_vault/guides/warehouse-io-flow]]

## 자식 폴더

없음 (플랫 구조)
