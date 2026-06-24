# 📁 _admin_sections

## 이 폴더는 뭐예요?

관리자 탭의 UI 섹션 파일 모음입니다.  
`_admin_hooks/`에서 데이터를 받아 화면에 렌더링하는 역할만 합니다.

**주요 섹션:**

| 파일 | 역할 |
|------|------|
| `AdminMasterItemsSection.tsx` | 마스터 품목 목록·생성·수정·삭제 |
| `AdminEmployeesSection.tsx` | 직원 목록·PIN 관리·모델 할당 |
| `AdminDepartmentsSection.tsx` | 부서 목록·정렬·수정 |
| `AdminModelsSection.tsx` | 모델 슬롯 관리 |
| `AdminAuditLogSection.tsx` | 감사 로그 조회 |
| `AdminExportSection.tsx` | 마스터 데이터 내보내기(Excel) |
| `AdminDangerZone.tsx` | 위험 영역 (재고 초기화 등) |
| `AdminWarehouseStructureSection.tsx` | 창고 구조(앵글·박스) 편집 |
| `AdminSidebar.tsx` | 관리자 탭 좌측 네비게이션 |
| `_bom_workbench/` | BOM 편집 전용 서브폴더 (10개 파일) |
| `_admin_primitives/` | 관리자 전용 원자 컴포넌트 |

## 언제 여기를 보나요?

- 관리자 화면의 특정 섹션 레이아웃이나 동작을 수정할 때
- BOM 편집 UI를 변경할 때 (`_bom_workbench/` 하위)
- 위험 영역 기능(초기화 등)을 수정할 때

## 건드릴 때 조심할 점

- `AdminDangerZone.tsx` — 관리자 PIN 변경 UI만 있음. 수정 시 특히 주의
- BOM 관련 변경은 백엔드 `bom.py` 라우터·서비스와 함께 확인

## 관련 파일

### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_hooks/📁__admin_hooks]] — 데이터 훅
- [[ERP/backend/app/routers/bom.py]] — BOM API

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/routers/items.py]] — 품목 API
> - [[ERP/backend/app/routers/employees.py]] — 직원 API
