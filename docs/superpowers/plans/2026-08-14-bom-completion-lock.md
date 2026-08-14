# BOM 완료 상태 수정 잠금 구현 계획

**추천 모델: GPT-5.6 Terra** - 프런트 제어와 API 도메인 규칙을 함께 변경하고 회귀 테스트가 필요합니다.
**추천 추론 수준: 높음** - 완료 상태 전환과 수정 차단의 일관성을 확인해야 합니다.

**GOAL:** 완료 처리된 BOM의 하위품목 추가·수량 변경·삭제를 차단하고 완료 해제 후에만 다시 허용한다.

**목표:** 관리자 BOM 화면과 BOM CRUD API가 동일한 완료 잠금 규칙을 적용한다.

**구조:** `BomWorkbench`가 부모 품목의 완료 여부를 읽기 전용 상태로 하위 편집 컴포넌트에 전달한다. `backend/app/routers/bom.py`는 부모 품목의 `bom_completed_at`을 확인해 모든 BOM 변경 API를 409로 막으며, 완료 해제 엔드포인트는 변경하지 않는다.

**기술:** Next.js/React/Vitest, FastAPI/SQLAlchemy/pytest

---

## 실행 방식

**실행 형태: 단독 작업** - 화면 props와 API 규칙이 하나의 짧은 변경 흐름으로 연결되어 있어 순차 구현·검증이 효율적이다.

## 변경 대상

- 수정: `backend/app/routers/bom.py` — 완료된 부모의 생성·수정·삭제 차단.
- 수정: `backend/tests/routers/test_bom_smoke.py` — 완료 잠금과 완료 해제 후 재수정 API 회귀 테스트.
- 수정: `frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx` — 완료 상태를 편집 하위 컴포넌트에 전달하고 핸들러를 방어.
- 수정: `frontend/app/mes/_components/_admin_sections/_bom_workbench/BomChildAddBox.tsx` — 완료 상태에서 추가 후보 선택 및 추가 확정을 비활성화.
- 수정: `frontend/app/mes/_components/_admin_sections/_bom_workbench/BomEditPanel.tsx` — 완료 상태를 행에 전달.
- 수정: `frontend/app/mes/_components/_admin_sections/_bom_workbench/BomRow.tsx` — 완료 상태에서 수량 편집과 삭제 요청을 비활성화.
- 수정: `frontend/app/mes/_components/_admin_sections/_bom_workbench/__tests__/BomTableLists.test.tsx` 또는 새 근접 테스트 — 읽기 전용 UI 회귀 테스트.

## 작업

### 1. API 잠금 규칙 테스트 작성

- [ ] 완료된 부모와 두 자식을 준비한다.
- [ ] `POST /api/bom`, `PATCH /api/bom/{id}`, `DELETE /api/bom/{id}`가 각각 409이고 기존 행의 수량·존재가 보존되는지 확인한다.
- [ ] `PATCH /api/items/{parent_id}/bom-completion`에 `completed: false`를 보낸 뒤 세 변경 요청이 정상 처리되는지 확인한다.
- [ ] `pytest tests/routers/test_bom_smoke.py -q`를 실행해 구현 전 실패를 확인한다.

### 2. API 최소 구현

- [ ] `backend/app/routers/bom.py`에 부모의 `bom_completed_at`을 검사하는 작은 공용 함수를 추가한다.
- [ ] 생성은 조회한 부모 직후, 수량 변경·삭제는 BOM 행의 부모를 조회해 이 함수를 호출한다.
- [ ] 상태 코드는 409, 메시지는 완료 해제 후 수정하라는 안내로 통일한다.
- [ ] API 테스트를 다시 실행해 통과를 확인한다.

### 3. 읽기 전용 UI 테스트 작성 및 구현

- [ ] 완료 상태 prop이 전달될 때 후보 행, 수량 버튼, 삭제 버튼이 disabled인지 테스트한다.
- [ ] `BomWorkbench`의 추가·수량 저장·삭제 확인 핸들러도 완료 상태면 요청을 시작하지 않도록 방어한다.
- [ ] `BomChildAddBox`, `BomEditPanel`, `BomRow`에 읽기 전용 prop을 추가해 행동과 시각 상태를 맞춘다.
- [ ] 완료 해제 상태에서는 기존 편집 동작이 그대로 가능한지 테스트한다.

### 4. 범위 검증

- [ ] 관련 Vitest 파일을 실행한다.
- [ ] `pytest tests/routers/test_bom_smoke.py tests/routers/test_admin_pin_guards.py -q`를 실행한다.
- [ ] 변경 파일만 `git diff --check` 및 `git diff`로 검토한다.
- [ ] 커밋·푸시는 사용자가 명시적으로 요청할 때만 수행한다.
