# 메인 브랜치 설정 모달 구현 계획

> **추천 모델: GPT-5.6 Terra** - 프론트엔드 상호작용과 직원 설정 API·마이그레이션을 함께 연결한다.
> **추천 추론 수준: 높음** - 권한별 관리자 진입과 기존 설정 저장 경로의 회귀를 막아야 한다.
> **실행 방식: 단독** - DB·API·UI가 순차적으로 의존하므로 하나의 작업 흐름이 안전하다.

**GOAL:** 메인 브랜치의 데스크톱 설정 모달에서 아이콘 중심의 테마·사이드바 표시 방식·권한별 관리자 진입을 저장 가능하게 제공한다.

**Goal:** 기존 하단 버튼을 설정 모달 하나로 통합하고, `Esc`, 불투명 배경, 권한별 톱니바퀴 우클릭 관리자 PIN 진입을 제공한다.

**Architecture:** 직원의 `sidebar_mode`를 API와 마이그레이션으로 영속화하고, 클라이언트 훅이 테마와 표시 방식을 한 번에 적용한다. 사이드바는 표시 권한(`visibleTabs.includes("admin")`)을 관리 카드와 우클릭 동작에 공통으로 전달한다.

**Tech Stack:** Next.js/React, TypeScript, Vitest + Testing Library, FastAPI, SQLAlchemy, Alembic.

---

## 파일 구조

- `backend/alembic/versions/20260805_0013_employee_sidebar_mode.py`: 기존 직원에 기본 `hover`를 부여하는 컬럼 마이그레이션.
- `backend/app/models/employee.py`, `backend/app/schemas/employee.py`, `backend/app/routers/employees.py`: 직원 응답과 `PUT /sidebar-mode` 저장 계약.
- `frontend/lib/api/types/employees.ts`, `frontend/lib/api/employees.ts`, `frontend/lib/sidebar-mode.ts`: 프론트엔드 타입·요청·정규화.
- `frontend/app/mes/_components/useAppearancePreferences.ts`: 테마와 표시 방식을 저장 시에만 함께 적용.
- `frontend/app/mes/_components/AppearanceSettingsModal.tsx`: 아이콘 선택 카드, 관리 카드, `Esc`, 불투명 오버레이.
- `frontend/app/mes/_components/DesktopSidebar.tsx`: 기존 하단 버튼 제거, 설정 버튼과 권한별 우클릭 연결.
- 관련 Vitest/Pytest 파일: API 계약과 사용자 상호작용 회귀 방지.

## 작업

### 1. 직원별 사이드바 표시 방식 저장 `[GPT-5.6 Terra | 순차]`

**Files:**
- Create: `backend/alembic/versions/20260805_0013_employee_sidebar_mode.py`
- Modify: `backend/app/models/employee.py`, `backend/app/schemas/employee.py`, `backend/app/routers/employees.py`
- Modify: `frontend/lib/api/types/employees.ts`, `frontend/lib/api/employees.ts`, `frontend/lib/api.ts`
- Create: `frontend/lib/sidebar-mode.ts`
- Test: `backend/tests/routers/test_employee_sidebar_mode.py`, `frontend/lib/__tests__/api-employees.test.ts`

- [ ] 실패 테스트를 작성한다. `PUT /api/employees/{id}/sidebar-mode`에 `collapsed`를 보내면 응답과 재조회 값이 같고, `invalid`는 422인지 검증한다.
- [ ] `pytest backend/tests/routers/test_employee_sidebar_mode.py -q`를 실행해 엔드포인트 부재로 실패함을 확인한다.
- [ ] 모델에 `sidebar_mode = Column(String(10), nullable=False, default="hover", server_default="hover")`를 추가하고, 마이그레이션에서 같은 기본값의 컬럼을 추가한다.
- [ ] `EmployeeSidebarModeUpdate`와 `PUT /{employee_id}/sidebar-mode`를 추가해 `hover`, `collapsed`, `expanded`만 저장한다. 응답의 `EmployeeResponse.sidebar_mode`는 기본값 `hover`를 반환한다.
- [ ] 프론트엔드 `SidebarMode` 유니온과 `setEmployeeSidebarMode(employeeId, sidebarMode)` 요청을 추가한다.
- [ ] 같은 pytest와 `npm test -- lib/__tests__/api-employees.test.ts`를 실행해 통과를 확인한다.

### 2. 설정 저장 훅과 아이콘 모달 `[GPT-5.6 Terra | 순차]`

**Files:**
- Create: `frontend/app/mes/_components/useAppearancePreferences.ts`
- Create: `frontend/app/mes/_components/AppearanceSettingsModal.tsx`
- Test: `frontend/app/mes/_components/__tests__/AppearanceSettingsModal.test.tsx`

- [ ] 실패 테스트를 작성한다. 라이트·다크와 세 가지 표시 방식 버튼이 독립 선택되고, `Esc`는 저장 없이 닫히며, 관리 카드는 전달된 콜백을 호출하는지 검증한다.
- [ ] `npm test -- app/mes/_components/__tests__/AppearanceSettingsModal.test.tsx`를 실행해 모듈 부재로 실패함을 확인한다.
- [ ] `useAppearancePreferences`에서 현재 로그인 직원 또는 로컬 저장소로 초기값을 읽고, `Promise.all([setEmployeeTheme, setEmployeeSidebarMode])` 성공 후에만 DOM 테마·로컬 저장소·세션 직원을 갱신한다.
- [ ] 모달에 `Sun`, `Moon`, `PanelLeftDashed`, `PanelLeftClose`, `PanelLeftOpen` 선택 카드와 `Settings2` 관리 카드를 추가한다. 선택 카드는 청록색, 나머지 아이콘은 muted 토큰을 사용한다.
- [ ] 모달이 열렸을 때만 `keydown` 리스너를 등록해 `Escape`에서 저장 중이 아닐 때 `onClose`를 호출하고, 오버레이는 `LEGACY_COLORS.bg`로 불투명하게 채운다.
- [ ] 같은 Vitest 명령을 다시 실행해 통과를 확인한다.

### 3. 사이드바 통합과 권한별 우클릭 `[GPT-5.6 Terra | 순차]`

**Files:**
- Modify: `frontend/app/mes/_components/DesktopSidebar.tsx`
- Delete: `frontend/app/mes/_components/ThemeToggle.tsx`
- Test: `frontend/app/mes/_components/__tests__/DesktopSidebar.test.tsx`

- [ ] 실패 테스트를 작성한다. 설정 버튼 좌클릭은 모달을 열고, `admin`이 `visibleTabs`에 있을 때 우클릭은 기본 메뉴를 막고 `onTabChange("admin")`를 호출하며, 없을 때는 둘 다 하지 않는지 검증한다.
- [ ] 같은 테스트에서 관리 탭이 보이는 경우에만 모달의 `관리` 카드를 렌더하고, 카드 클릭이 `onTabChange("admin")`를 호출하는지 검증한다.
- [ ] `npm test -- app/mes/_components/__tests__/DesktopSidebar.test.tsx`를 실행해 기존 구조에서 실패함을 확인한다.
- [ ] `ThemeToggle`과 하단 `admin` 탭 렌더를 제거하고, 설정 버튼에 `onContextMenu`를 추가한다. `visibleTabs.includes("admin")`일 때만 `event.preventDefault()` 후 탭 전환을 호출한다.
- [ ] 모달에는 `canOpenAdmin`과 `onOpenAdmin`을 전달한다. 관리 카드는 허용된 사용자에게만 보이고 클릭 시 모달을 닫은 뒤 기존 `onTabChange("admin")` 경로를 사용한다.
- [ ] 같은 Vitest 명령을 다시 실행해 통과를 확인한다.

### 4. 통합 검증 `[GPT-5.6 Terra | 순차]`

**Files:**
- Verify only: 위 변경 파일 전체

- [ ] `npm test -- app/mes/_components/__tests__/AppearanceSettingsModal.test.tsx app/mes/_components/__tests__/DesktopSidebar.test.tsx lib/__tests__/api-employees.test.ts`를 실행한다.
- [ ] `npx tsc --noEmit`를 실행한다.
- [ ] `powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode auto`를 실행한다.
- [ ] 통과 결과와 기존 실패가 있다면 변경과의 관련성을 분리해 기록한다. 사용자가 명시적으로 요청하기 전에는 커밋·푸시하지 않는다.
