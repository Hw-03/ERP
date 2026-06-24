# 📁 _admin_hooks

## 이 폴더는 뭐예요?

관리자 탭(`DesktopAdminView`)에서 사용하는 데이터 페칭·상태 관리 훅 모음입니다.  
UI 섹션(`_admin_sections/`)은 이 훅을 통해 데이터를 받고, 직접 API를 호출하지 않습니다.

| 훅 | 역할 |
|----|------|
| `useAdminBootstrap` | 관리자 탭 초기 데이터 일괄 로드 |
| `useAdminMasterItems` / `Commands` / `Form` / `List` | 마스터 품목 CRUD 상태 |
| `useAdminEmployees` / `Commands` / `Form` / `List` / `Confirm` | 직원 CRUD 상태 |
| `useAdminDepartments` / `Commands` / `Form` | 부서 CRUD 상태 |
| `useAdminModels` / `Commands` / `Form` / `List` | 모델 슬롯 CRUD 상태 |
| `useAdminSettings` | 관리자 설정(PIN 변경 등) 상태 |
| `useAdminViewState` | 탭 내부 뷰 전환 상태 |

## 언제 여기를 보나요?

- 관리자 화면에서 데이터가 잘못 표시되거나 저장 안 될 때
- 관리자 기능에 새 CRUD 동작을 추가할 때

## 건드릴 때 조심할 점

- 각 훅은 Commands(API 호출) / Form(입력 상태) / List(목록 상태)로 관심사가 분리돼 있습니다. 하나의 훅에 너무 많은 역할을 추가하지 마세요.

## 관련 파일

### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_admin_sections/📁__admin_sections]] — 이 훅을 소비하는 UI
- [[ERP/frontend/lib/api/admin.ts]] — 실제 API 호출
- [[ERP/frontend/lib/queries/useAdminQuery.ts]] — React Query 통합

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/routers/admin_audit.py]] — 감사 로그 API
> - [[ERP/backend/app/routers/settings.py]] — 설정 API
