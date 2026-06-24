# ioWorkType.ts

## 이 파일은 뭐예요?
입출고 위저드의 작업 유형(workType)·세부 작업(subType) 도메인 로직을 모두 담은 단일 소스 파일입니다. 워크타입/서브타입 목록, 결재 종류 판정, BOM 강제 여부, 부서 그리드 가시성, 라인 태그, 빠른작업 인텐트 변환 등이 순수 함수로 정의되어 있습니다.

## 언제 보나요?
- 새 서브타입 추가 또는 기존 서브타입 동작 변경 시
- 결재 정책(approvalKind) 수정 시
- 빠른작업 팝업 선택지·인텐트 매핑 변경 시
- IoWorkTypeStep/IoSubTypeStep 카드 목록·부서 그리드 조건 변경 시

## 중요한 내용
- `IO_WORK_TYPES` — 위저드 Step 1 카드 목록 (receive/warehouse_io/process 3종; defect는 별도 탭)
- `IO_SUB_TYPES` — workType별 서브타입 배열
- `approvalKind(subType, bundles, fromDepartment?)` — `"none" | "warehouse" | "department"` 판정
- `isBomForced(subType)` — produce/disassemble만 BOM 강제 (하위 라인 수량 잠금)
- `allowsMixedBundles(subType)` — 창고 입출고만 BOM+낱개 혼합 허용
- `lineTagLabel(line, subType)` — 라인 현장 친화 태그 결정
- `quickChoiceToIntent(choice)` — 빠른작업 팝업 선택 → `IoEntryIntent` 변환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoWorkTypeStep.tsx]] — 이 상수/함수를 Step 1·2 UI에서 소비
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — approvalKind, isBomForced 등을 조합하는 최상위 위저드
- [[ERP/frontend/lib/io/glossary.ts]] — `SUB_TYPE_LABEL`, `WORK_TYPE_LABEL` 등 표시 텍스트 소스
