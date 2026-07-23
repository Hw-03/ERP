**추천 모델: GPT-5.6 Terra** - 여러 관리자 화면의 레이아웃·상태 동작·테스트를 함께 바꾸되, 백엔드나 권한 모델 변경은 없다.
**추천 추론 수준: 높음** - 반응형 높이 배분과 삭제 확인 UI의 회귀를 화면별로 검증해야 한다.
**권장 실행 방식: 서브에이전트 병렬 + 부모 통합** - 모델·직원·부서 화면은 독립적이며, 품목 화면 두 작업은 같은 파일을 공유하므로 순차 처리한다.

# 관리자 UI 레이아웃 정비 구현 계획

**GOAL:** 관리자 화면의 남은 8개 확정 UI 개선을 구현하고, 1917×910 데스크톱에서 여백·카드 높이·위험 작업 위치가 일관되게 보이도록 검증한다.

## 범위와 기준

- 기준 TODO: `_attic/handoff/2026-07-22-admin-layout-followup-todo.md`
- 구현 대상: 1, 3, 6, 7, 8, 10, 13, 14번.
- 구현 완료로 제외: 4, 5, 9, 11, 12번. 라이브 코드와 테스트로 확인했으며 재구현하지 않는다.
- 정책 미확정으로 제외: 2번(품목 상세 헤더의 선택 품목명·상태 제거 여부). 사용자가 정책을 확정하기 전에는 건드리지 않는다.
- 변경 범위: `frontend/`만. API, DB, 데이터, 동결된 주간보고·모바일 탭 바·출하 step 5 파일은 수정하지 않는다.

## 워크트리 준비

현재 체크아웃은 `C:\ERP`의 `main` 브랜치이며 linked worktree가 아니다. `.worktrees/`는 `.git/info/exclude`에서 무시됨을 확인했다. 실행 승인 뒤에만 아래를 수행한다.

```powershell
git worktree add .worktrees/admin-ui-layout-polish -b codex/admin-ui-layout-polish
Set-Location C:\ERP\.worktrees\admin-ui-layout-polish\frontend
if (-not (Test-Path node_modules)) { npm ci }
npm test -- app/mes/_components/_admin_sections/__tests__/AdminSectionTabs.test.tsx
```

기존 체크아웃에 있는 사용자 변경(`_attic/handoff/2026-07-22-admin-layout-followup-todo.md`)은 워크트리 생성 전에 커밋·stash·복사하지 않는다. 이 계획 문서와 TODO 문서를 새 워크트리에서 읽을 수 있도록, 사용자가 추후 원하는 방식으로 현재 문서 변경을 포함시킨다.

## 변경 파일 구조

- `DesktopAdminView.tsx`, `AdminSectionTabs.tsx`: 관리자 공통 세로 리듬과 섹션 탭 바 그림자.
- `AdminModelsSection.tsx`: 모델 상세의 가용 높이 배분과 하단 삭제 버튼.
- `ItemFormFields.tsx`, `AdminMasterItemsSection.tsx`, `AdminDetailCard.tsx`: 품목 필드 순서, 공통 삭제 위치, 재고/BOM 본문 높이.
- `EmployeeDetailGrid.tsx`, `employeeDetailPrimitives.tsx`: 직원 상세의 3열 카드 높이 배분.
- `DeptDetailView.tsx`: 부서 상세의 정보 카드 확장과 하단 위험 작업.
- 해당 `__tests__/` 파일: DOM 구조와 접근성·동작 회귀 방지.

## 작업 순서

### 작업 1. 관리자 공통 탭 바 리듬 정렬 `[GPT-5.6 Terra · 병렬 가능]`

**파일**

- 수정: `frontend/app/mes/_components/DesktopAdminView.tsx:96`
- 수정: `frontend/app/mes/_components/_admin_sections/AdminSectionTabs.tsx:55-62`
- 수정: `frontend/app/mes/_components/_admin_sections/__tests__/AdminSectionTabs.test.tsx`

1. `AdminSectionTabs` 렌더 테스트에 외곽 `nav`의 그림자 스타일이 없고 테두리는 유지된다는 기대값을 추가한다.
2. `DesktopAdminView`의 공통 작업 영역을 `pt-3`에서 `pt-1`로 바꾼다. 상위 `gap-3` 12px과 요약 바 `mb-4` 16px을 유지해, 탭 바 아래→요약 바 위 간격을 `12 + 4 = 16px`으로 맞춘다.
3. `AdminSectionTabs` 외곽 `nav`의 `boxShadow: "var(--c-card-shadow)"`만 제거한다.
4. 테스트를 실행한다.

```powershell
Set-Location frontend
npm test -- app/mes/_components/_admin_sections/__tests__/AdminSectionTabs.test.tsx app/mes/_components/__tests__/DesktopAdminView.test.tsx
```

### 작업 2. 모델 상세를 패널 높이에 맞춰 재배치 `[GPT-5.6 Terra · 병렬 가능]`

**파일**

- 수정: `frontend/app/mes/_components/_admin_sections/AdminModelsSection.tsx:450-551`
- 수정: `frontend/app/mes/_components/_admin_sections/__tests__/AdminModelsSection.test.tsx`

1. 테스트에 `data-model-detail-layout`이 데스크톱에서 세로 가용 높이를 갖고, 연결 영역이 남은 높이를 사용하며, 삭제 버튼이 `mt-auto`로 하단에 붙는 구조를 먼저 추가한다.
2. 모델명·기호 편집 카드는 상단 고정으로 유지한다. 연결 영역은 남은 높이를 사용하게 하고, 좌측의 연결 품목 수·연결 BOM 수는 2행 세로 스택으로 전환한다.
3. 우측 연결 품목 미리보기 카드가 좌측 요약 열과 같은 하단 기준선을 쓰도록 신축 레이아웃을 연결한다. 여섯 항목과 `외 N건` 요약 규칙은 유지한다.
4. `이 모델 삭제` 버튼을 상세 레이아웃의 전폭 최하단으로 밀어내고 기존 확인 모달/PIN 인증 호출을 유지한다.
5. 테스트를 실행한다.

```powershell
npm test -- app/mes/_components/_admin_sections/__tests__/AdminModelsSection.test.tsx
```

### 작업 3. 품목 기본 정보 입력 순서 변경 `[GPT-5.6 Terra · 순차: 작업 4와 동일 파일]`

**파일**

- 수정: `frontend/app/mes/_components/_admin_sections/_master_items_parts/ItemFormFields.tsx:142-343`
- 수정: `frontend/app/mes/_components/_admin_sections/_master_items_parts/__tests__/ItemFormFields.test.tsx`

1. 새 테스트로 여덟 필드의 DOM 순서를 검증한다: `품목명 → 카테고리 → 사용 제품 → 자재분류 → 안전재고 → 공급사 → 단위 → 품목 코드`.
2. `ItemFormFields`의 JSX 블록 순서만 위 순서로 옮긴다. 제품 기호는 레이블 인라인, 품목 코드는 마지막이라는 현재 완료 동작을 보존한다.
3. 필수/선택 배지, 공급사·안전재고 값, 모델 슬롯, 코드 계산과 저장 동작을 바꾸지 않는다.
4. 테스트를 실행한다.

```powershell
npm test -- app/mes/_components/_admin_sections/_master_items_parts/__tests__/ItemFormFields.test.tsx
```

### 작업 4. 품목 삭제 위치와 재고/BOM 본문 높이 통일 `[GPT-5.6 Terra · 순차: 작업 3 뒤]`

**파일**

- 수정: `frontend/app/mes/_components/_admin_sections/AdminMasterItemsSection.tsx:280-514`
- 수정: `frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminDetailCard.tsx:55-139` (공통 props만으로 표현 불가능할 때만)
- 수정: `frontend/app/mes/_components/_admin_sections/__tests__/AdminMasterItemsSection.test.tsx`
- 수정 또는 추가: `frontend/app/mes/_components/_admin_sections/__tests__/AdminDetailCard.test.tsx`

1. 삭제되지 않은 기존 품목에서 세 상세 탭 모두 헤더 우측에 삭제 시작 버튼이 있고, 확인 상태의 취소·삭제 확인도 같은 헤더 영역에 있다는 실패 테스트를 만든다.
2. `actions` 조건에서 `tab === "info"` 제한을 없애고, 삭제 확인 UI를 footer에서 헤더 action으로 이동한다.
3. footer는 기본 정보 탭의 저장 버튼에만 사용한다. 재고/BOM 탭에서는 삭제 전용 footer를 전달하지 않는다. 삭제된 품목의 복구 footer는 유지한다.
4. `ItemStockTab`의 2×2 카드와 `ItemBomTab`의 구성품·사용처 목록이 가용 본문 높이를 분배하도록 `min-h-0`/`flex-1` 신축 규칙을 넣는다. 카드·목록의 값, 빈 상태, 내부 스크롤은 보존한다.
5. 테스트를 실행한다.

```powershell
npm test -- app/mes/_components/_admin_sections/__tests__/AdminMasterItemsSection.test.tsx app/mes/_components/_admin_sections/_admin_primitives/__tests__/AdminDetailCard.test.tsx
```

### 작업 5. 직원 상세 3열 카드 높이 배분 `[GPT-5.6 Terra · 병렬 가능]`

**파일**

- 수정: `frontend/app/mes/_components/_admin_sections/_employee_parts/EmployeeDetailGrid.tsx:65-240`
- 필요 시 수정: `frontend/app/mes/_components/_admin_sections/_employee_parts/employeeDetailPrimitives.tsx:5-30`
- 수정: `frontend/app/mes/_components/_admin_sections/_employee_parts/__tests__/EmployeeDetailGrid.test.tsx`

1. 현재 `items-start`/내용 높이 기대 테스트를, 데스크톱에서 기본 정보·권한 카드와 우측 PIN·위험 작업 열이 공통 하단 기준선을 쓴다는 기대값으로 교체한다.
2. 3열 grid와 우측 카드 열에 가용 높이·`min-h-0`·신축 규칙을 부여한다. 기본 정보·권한 카드는 같은 높이를 쓰고, 우측 PIN·위험 작업은 최소 조작 높이 이후 남은 높이를 나눈다.
3. PIN 제목 보조 정보, 체크박스, 결재 역할 선택, PIN 초기화 및 위험 작업 버튼의 접근성·모바일 단일 본문 스크롤을 보존한다.
4. 테스트를 실행한다.

```powershell
npm test -- app/mes/_components/_admin_sections/_employee_parts/__tests__/EmployeeDetailGrid.test.tsx app/mes/_components/_admin_sections/__tests__/AdminEmployeesSection.test.tsx
```

### 작업 6. 부서 상세 카드 확장과 하단 위험 작업 정렬 `[GPT-5.6 Terra · 병렬 가능]`

**파일**

- 수정: `frontend/app/mes/_components/_admin_sections/_department_parts/DeptDetailView.tsx:109-310`
- 수정: `frontend/app/mes/_components/_admin_sections/__tests__/DeptDetailView.test.tsx`

1. 테스트에 색상 카드·소속 직원 카드가 남은 높이를 사용하고, `부서 비활성화`·`영구 삭제` 행이 최하단으로 밀린 구조를 추가한다.
2. 메타 그리드와 공정 기준 안내는 상단에 유지하고, 색상·직원 카드에는 데스크톱 가용 높이 배분을 적용한다. 액션 행에는 `mt-auto`에 해당하는 하단 정렬을 적용한다.
3. 색상 팔레트의 열림/닫힘, 색상 저장, 활성화 확인 모달, 영구 삭제 확인과 좁은 화면 스크롤을 유지한다.
4. 테스트를 실행한다.

```powershell
npm test -- app/mes/_components/_admin_sections/__tests__/DeptDetailView.test.tsx app/mes/_components/_admin_sections/__tests__/AdminDepartmentsSection.test.tsx
```

### 작업 7. 통합 회귀 검증 `[GPT-5.6 Terra · 부모 통합]`

1. 변경한 단위 테스트 전체를 한 번에 실행한다.

```powershell
npm test -- app/mes/_components/_admin_sections/__tests__/AdminSectionTabs.test.tsx app/mes/_components/_admin_sections/__tests__/AdminModelsSection.test.tsx app/mes/_components/_admin_sections/__tests__/AdminMasterItemsSection.test.tsx app/mes/_components/_admin_sections/_master_items_parts/__tests__/ItemFormFields.test.tsx app/mes/_components/_admin_sections/_employee_parts/__tests__/EmployeeDetailGrid.test.tsx app/mes/_components/_admin_sections/__tests__/DeptDetailView.test.tsx
```

2. 1917×910 브라우저에서 모델·품목·직원·부서·BOM 관리 탭을 수동 확인한다. 공통 요약 바의 위/아래 간격은 각각 16px이며, 관리자 탭 바에는 그림자가 없어야 한다.
3. 모델 상세, 품목 재고/BOM, 직원 상세, 부서 상세에서 내부 카드와 위험 작업의 하단 정렬, 좁은 데스크톱에서 내용 잘림·중복 스크롤 여부를 확인한다.
4. 최종 프런트엔드 검증을 실행한다.

```powershell
Set-Location C:\ERP\.worktrees\admin-ui-layout-polish
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode frontend
```

5. 커밋·푸시는 사용자가 명시적으로 요청할 때만 수행한다. 요청 시에만 검증 결과를 다시 확인하고, 프로젝트 형식에 맞는 한국어 커밋 메시지를 사용한다.

## 완료 판단

- 남은 8개 확정 TODO가 각 수용 기준을 충족한다.
- 2번 정책 미확정 항목은 변경하지 않았거나, 구현 전 사용자가 선택을 확정했다.
- 변경한 단위 테스트와 `verify_local.ps1 -Mode frontend`가 통과한다.
- 브라우저의 1917×910 기준 시각 검증이 수용 기준과 일치한다.
