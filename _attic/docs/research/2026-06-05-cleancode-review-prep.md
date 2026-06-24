# 클린코드 정비 + 리뷰 준비 문서화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 권동환 사원 복귀(2026-06-25) 전까지 코드 구조를 정비하고 리뷰용 문서를 작성해 복귀 후 코드 리뷰를 원활하게 한다.

**Architecture:** Phase 1(코드 정비)에서 기능 변경 없이 큰 파일을 도메인별로 분리하고 혼란스러운 이름에 설명을 추가한다. Phase 2(볼트 갱신)에서 vault-sync 브랜치를 최신 코드 기준으로 리빌드한다. Phase 3(문서 작성)에서 ERD·화면 정의서·변경 요약을 vault/guides/에 추가해 리뷰어가 코드 열기 전에 전체 그림을 파악할 수 있게 한다.

**Tech Stack:** FastAPI(Python 3.11), Next.js 14 App Router, SQLite(SQLAlchemy), Pydantic v2, Obsidian(Mermaid 다이어그램)

---

## Execution Strategy

**추천 모델: Sonnet** — 여러 파일에 걸친 구조 정비와 임포트 관리, 문서 작성이 주 작업이라 판단

**추천 Effort: high** — 파일 분리 시 cross-file 임포트 일관성 확인과 볼트 재빌드에 충분한 추론 필요

**팀 구성: 필요** — Task 1(schemas 분리)과 Task 3(transactions 헬퍼 분리)은 서로 독립적이라 병렬 실행 가능. Task 4 이후는 순차.

---

## 배경 및 제약

- 권동환 사원은 창고 담당자 / IT 업계 1년 반 경력. 복귀 시 가장 먼저 볼 것: 전체 흐름, ERD, 화면 정의서, 기준체계 변경 여부.
- 코드 동작은 일절 변경하지 않는다. 모든 작업은 구조/이름/문서 정비만.
- `frontend/app/legacy/` 폴더명은 URL 라우팅에 묶여 있어 이름 변경 불가. README로 설명 보완.
- `_archive/`, `frontend/_archive/`, `_attic/` 는 건드리지 않는다.
- 주간 보고 화면 관련 파일은 frozen — 건드리지 않는다.
- 커밋 형식: `YYYY-MM-DD area: summary` (날짜는 커밋 직전 `Get-Date -Format yyyy-MM-dd` 로 확인)
- 커밋·푸시 전 반드시 실행: `powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1`

---

## Phase 1 — 코드 정비

### Task 1: backend/app/schemas/ 패키지 분리 `Sonnet 병렬 가능`

**목적:** 1,203줄짜리 schemas.py(76개 클래스)를 도메인별 파일로 나눠 원하는 DTO를 바로 찾을 수 있게 한다. 기존 `from app.schemas import X` 임포트는 __init__.py re-export로 그대로 유지.

**Files:**
- Create: `backend/app/schemas/__init__.py` — 모든 도메인 파일에서 * import (backward compat)
- Create: `backend/app/schemas/item.py` — Item, BOM, ProductSymbol 관련 클래스
- Create: `backend/app/schemas/employee.py` — Employee, Pin 관련 클래스
- Create: `backend/app/schemas/inventory.py` — Inventory, Transfer, MarkDefective, SupplierReturn, Reconcile 관련 클래스
- Create: `backend/app/schemas/transaction.py` — Transaction, TransactionEditLog, TransactionQuantity 관련 클래스
- Create: `backend/app/schemas/stock_request.py` — StockRequest, StockRequestLine 관련 클래스
- Create: `backend/app/schemas/warehouse.py` — WarehouseAngle, WarehouseBox, WarehouseMap 관련 클래스
- Create: `backend/app/schemas/io.py` — Io, IoBundle, IoLine, IoBatch 관련 클래스
- Create: `backend/app/schemas/notification.py` — Notification, Handover 관련 클래스
- Create: `backend/app/schemas/department.py` — Department, ProductModel 관련 클래스
- Create: `backend/app/schemas/weekly.py` — Weekly, ProcessType, MesCode, BomCheck, Capacity, BackflushDetail 관련 클래스
- Create: `backend/app/schemas/common.py` — Integrity, Message, Error 등 시스템 공용 클래스
- Delete: `backend/app/schemas.py` (패키지로 교체)

**Steps:**

- [ ] **Step 1: 현재 schemas.py 전체 읽기**

  ```
  Read backend/app/schemas.py (전체)
  ```
  각 클래스의 이름과 import 의존성(다른 schemas 클래스 참조 여부)을 파악한다.

- [ ] **Step 2: schemas/ 디렉토리 생성 + 도메인별 파일 작성**

  각 도메인 파일에 해당 클래스만 넣는다. 파일 간 의존(예: IoLine이 InventoryResponse를 참조)이 있으면 해당 클래스를 직접 import한다. `from app.schemas.inventory import X` 형식.

  도메인별 클래스 분류 기준:
  - `item.py` — 클래스명이 Item*, BOM*, ProductSymbol*
  - `employee.py` — Employee*, Pin*
  - `inventory.py` — Inventory*, Transfer*, MarkDefective*, SupplierReturn*, Reconcile*
  - `transaction.py` — Transaction*, TransactionEditLog*, TransactionQuantity*
  - `stock_request.py` — StockRequest*, StockRequestLine*
  - `warehouse.py` — WarehouseAngle*, WarehouseBox*, WarehouseMap*
  - `io.py` — Io*, IoBundle*, IoLine*, IoBatch*
  - `notification.py` — Notification*, Handover*
  - `department.py` — Department*, ProductModel*
  - `weekly.py` — Weekly*, ProcessType*, MesCode*, BomCheck*, Capacity*, BackflushDetail*
  - `common.py` — 나머지(Integrity*, Message*, Error*, 기타 시스템 공용)

- [ ] **Step 3: __init__.py 작성**

  ```python
  # backward compat — 기존 'from app.schemas import X' 임포트가 그대로 동작
  from app.schemas.item import *
  from app.schemas.employee import *
  from app.schemas.inventory import *
  from app.schemas.transaction import *
  from app.schemas.stock_request import *
  from app.schemas.warehouse import *
  from app.schemas.io import *
  from app.schemas.notification import *
  from app.schemas.department import *
  from app.schemas.weekly import *
  from app.schemas.common import *
  ```

- [ ] **Step 4: 원본 schemas.py 삭제**

  ```powershell
  Remove-Item backend\app\schemas.py
  ```

- [ ] **Step 5: 백엔드 임포트 오류 확인**

  ```powershell
  cd backend
  python -c "from app.schemas import *; print('OK')"
  ```
  Expected: `OK`

- [ ] **Step 6: 전체 검증**

  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1
  ```
  Expected: 모든 체크 통과

- [ ] **Step 7: 커밋**

  ```powershell
  $d = Get-Date -Format yyyy-MM-dd
  git add backend/app/schemas/
  git rm backend/app/schemas.py
  git commit -m "$d backend: schemas.py → schemas/ 도메인별 패키지 분리"
  ```

---

### Task 2: 혼란스러운 폴더에 설명 파일 추가 `Haiku 순차`

**목적:** `legacy/`와 `_warehouse_v2/`는 이름만 보면 "낡은 코드", "임시 버전"처럼 보이지만 실제로는 현재 운영 중인 메인 UI다. README.md 한 장으로 오해를 방지한다.

**Files:**
- Create: `frontend/app/legacy/README.md`
- Create: `frontend/app/legacy/_components/_warehouse_v2/README.md`

**Steps:**

- [ ] **Step 1: frontend/app/legacy/README.md 작성**

  ```markdown
  # legacy/ — DEXCOWIN MES 메인 UI

  이 폴더는 낡거나 폐기된 코드가 아닙니다.
  현재 운영 중인 DEXCOWIN MES의 메인 화면이 모두 여기 있습니다.

  - `page.tsx` — 전체 레이아웃과 탭 라우팅 진입점
  - `_components/` — 모든 화면 컴포넌트
  - 이름이 `legacy`인 이유: Next.js App Router 전환 이전부터 사용한 경로명이며,
    URL 호환성 때문에 그대로 유지합니다.
  ```

- [ ] **Step 2: _warehouse_v2/README.md 작성**

  ```markdown
  # _warehouse_v2/ — 입출고 2.0 메인 컴포넌트

  이 폴더는 현재 운영 중인 입출고(IO) 화면의 핵심 컴포넌트입니다.

  - `IoComposeView.tsx` — 입출고 작업 전체 흐름 (품목 선택 → 수량 입력 → 제출)
  - `IoPreviewPanel.tsx` — BOM 전개 미리보기
  - `_hooks/` — 입출고 전용 커스텀 훅
  - 이름에 `v2`가 붙은 이유: 1세대 창고 화면을 대체해 만든 버전이며, 현재 정본입니다.
  ```

- [ ] **Step 3: 커밋**

  ```powershell
  $d = Get-Date -Format yyyy-MM-dd
  git add frontend/app/legacy/README.md frontend/app/legacy/_components/_warehouse_v2/README.md
  git commit -m "$d docs: legacy/_warehouse_v2 폴더 오해 방지 README 추가"
  ```

---

### Task 3: transactions.py 필터 헬퍼 분리 `Sonnet 병렬 가능`

**목적:** 1,096줄짜리 transactions.py에서 쿼리 필터 빌더 함수들을 별도 파일로 뽑아낸다. 엔드포인트 로직은 그대로 유지.

**Files:**
- Create: `backend/app/routers/inventory/_tx_filters.py` — 필터 헬퍼 함수 모음
- Modify: `backend/app/routers/inventory/transactions.py` — 헬퍼 import로 교체

**Steps:**

- [ ] **Step 1: 분리할 함수 목록 확인**

  `transactions.py`에서 다음 함수를 `_tx_filters.py`로 이동:
  - `_department_label_expr()`
  - `_process_step_filter()`
  - `_model_filter()`
  - `_department_filter()`
  - `_operation_filter()`
  - `_apply_common_filters()`
  - `_batch_name_map()`
  - `_to_log_response()`

  이동하지 않는 것: `_verify_editor()` (엔드포인트 전용 검증 로직)

- [ ] **Step 2: _tx_filters.py 생성**

  각 함수를 그대로 복사한 후 필요한 import(sqlalchemy, models 등)를 상단에 명시.
  함수 시그니처와 동작은 절대 바꾸지 않는다.

- [ ] **Step 3: transactions.py 상단에 import 추가 + 원본 함수 삭제**

  ```python
  from app.routers.inventory._tx_filters import (
      _department_label_expr,
      _process_step_filter,
      _model_filter,
      _department_filter,
      _operation_filter,
      _apply_common_filters,
      _batch_name_map,
      _to_log_response,
  )
  ```
  원본 함수 정의는 삭제.

- [ ] **Step 4: 전체 검증**

  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1
  ```
  Expected: 모든 체크 통과

- [ ] **Step 5: 커밋**

  ```powershell
  $d = Get-Date -Format yyyy-MM-dd
  git add backend/app/routers/inventory/_tx_filters.py backend/app/routers/inventory/transactions.py
  git commit -m "$d backend: transactions.py 필터/응답 헬퍼 → _tx_filters.py 분리"
  ```

---

## Phase 2 — Obsidian 볼트 갱신

### Task 4: vault-sync 브랜치 리빌드 `Sonnet 순차`

**목적:** 볼트가 5월 22일 이후 멈춰 있다. 6월에 추가된 기능(창고 지도, 인수인계 UX, 입출고 이력, mes_code 전환 등)을 반영한 최신 볼트로 갱신한다.

**작업 브랜치:** `vault-sync` (main이 아닌 vault 전용 브랜치)

**Steps:**

- [ ] **Step 1: /obsidian 스킬을 사용해 볼트 리빌드**

  이 태스크는 별도 세션에서 `/obsidian` 스킬을 직접 실행한다.
  스킬 내 Start Procedure(git fetch → checkout vault-sync → merge main → 리뷰 → 재생성 → 검증)를 그대로 따른다.

- [ ] **Step 2: 5월 22일 이후 변경된 영역 집중 갱신**

  다음 영역의 vault 노트를 새로 쓰거나 갱신:
  - `vault/ERP/frontend/app/legacy/_components/_warehouse_v2/` — 창고 지도 추가
  - `vault/ERP/backend/app/routers/inventory/` — 입출고 이력 3차 변경
  - `vault/ERP/backend/app/models/` — handover, notification 모델 추가
  - `vault/guides/전체_컨텍스트.md` — 최근 변경 사항 섹션 업데이트
  - `vault/guides/위험지대_지도.md` — 창고 지도, 인수인계서 위험도 추가

- [ ] **Step 3: 검증 후 커밋 & 푸시**

  스킬 내 Validation 절차(git diff, Test-Path 확인)를 완료한 뒤 vault-sync 푸시.

---

## Phase 3 — 리뷰용 문서 작성

> Task 5~7은 모두 vault-sync 브랜치에서 작업.
> Task 4(볼트 갱신) 완료 후 순차 실행.

---

### Task 5: ERD 문서 작성 `Sonnet 순차`

**목적:** 권동환 사원이 복귀해서 "DB 구조가 어떻게 생겼지?"를 바로 볼 수 있게 Mermaid ER 다이어그램을 만든다.

**Files:**
- Create: `vault/guides/ERD.md` (vault-sync 브랜치)

**Steps:**

- [ ] **Step 1: 모델 파일 전체 읽기**

  ```
  Read backend/app/models/base.py
  Read backend/app/models/item.py
  Read backend/app/models/inventory.py
  Read backend/app/models/employee.py
  Read backend/app/models/warehouse.py
  Read backend/app/models/transaction.py
  Read backend/app/models/stock_request.py
  Read backend/app/models/io_batch.py
  Read backend/app/models/notification.py
  Read backend/app/models/handover.py
  Read backend/app/models/audit.py
  Read backend/app/models/code.py
  Read backend/app/models/system.py
  ```

- [ ] **Step 2: ERD.md 작성**

  형식:
  ```markdown
  # ERD — DEXCOWIN MES 데이터베이스 설계도

  마지막 업데이트: 2026-06-XX
  실제 테이블 구조는 `backend/app/models/` 폴더가 기준입니다.

  ## 핵심 테이블 관계

  \`\`\`mermaid
  erDiagram
      ITEM ||--o{ BOM : "parent/child"
      ITEM ||--|| INVENTORY : "1:1"
      ...
  \`\`\`

  ## 테이블 설명

  ### items
  - ...

  ### inventory / inventory_locations
  - ...
  ```

  핵심 관계:
  - Item ←→ Inventory (1:1)
  - Item ←→ BOM (1:N, parent_item_id + child_item_id)
  - Item ←→ TransactionLog (1:N)
  - Inventory ←→ InventoryLocation (1:N, 부서×상태)
  - Employee ←→ StockRequest (1:N, requester + approver)
  - StockRequest ←→ StockRequestLine (1:N)
  - IoBatch ←→ IoLine (1:N, schema 레벨)
  - WarehouseAngle ←→ WarehouseBox (1:N)

- [ ] **Step 3: 커밋 (vault-sync 브랜치)**

  ```powershell
  $d = Get-Date -Format yyyy-MM-dd
  git add vault/guides/ERD.md
  git commit -m "$d docs: ERD 문서 추가 (Mermaid 다이어그램)"
  ```

---

### Task 6: 화면 정의서 작성 `Sonnet 순차`

**목적:** 권동환 사원이 "어떤 화면이 있고 뭘 할 수 있는지"를 한눈에 볼 수 있게 한다.

**Files:**
- Create: `vault/guides/화면_정의서.md` (vault-sync 브랜치)

**Steps:**

- [ ] **Step 1: 화면 목록 파악**

  ```
  Read frontend/app/legacy/page.tsx (전체)
  ```
  탭 구조, 라우팅 분기, 권한 분기를 파악해 화면 목록을 뽑는다.

- [ ] **Step 2: 화면_정의서.md 작성**

  각 화면에 대해:
  | 항목 | 내용 |
  |------|------|
  | 화면명 | 예: 입출고 작업 |
  | URL / 탭 위치 | 예: /legacy?tab=io |
  | 접근 가능 직급 | 예: 전 직원 |
  | 주요 기능 | 예: 재료 입고/출고 입력, BOM 전개 미리보기, 임시저장 |
  | 연결된 API | 예: POST /io/batches, GET /items |
  | 주의사항 | 예: 제출 후 수정 불가, 결재 승인 필요 |

- [ ] **Step 3: 커밋 (vault-sync 브랜치)**

  ```powershell
  $d = Get-Date -Format yyyy-MM-dd
  git add vault/guides/화면_정의서.md
  git commit -m "$d docs: 화면 정의서 추가"
  ```

---

### Task 7: 6월 변경 요약 문서 작성 `Sonnet 순차`

**목적:** 권동환 사원이 복귀 당일 "내가 없는 동안 뭐가 바뀌었나"를 빠르게 파악하게 한다. 코드 보기 전에 읽을 문서.

**Files:**
- Create: `vault/guides/변경_요약_2026-06.md` (vault-sync 브랜치)

**Steps:**

- [ ] **Step 1: 5월 29일 이후 git log 확인**

  ```powershell
  git log origin/main --oneline --since="2026-05-29" --no-merges
  ```

- [ ] **Step 2: 변경_요약_2026-06.md 작성**

  구성:
  ```markdown
  # 2026년 6월 변경 요약 (권동환 사원 복귀용)

  기간: 2026-05-29 ~ 2026-06-25
  작성: AI 보조 작업

  ## 휴직 전 합의 사항 이행 현황

  | 합의 사항 | 상태 | 비고 |
  |-----------|------|------|
  | 주간보고 사전 피드백 | 완료 | ... |
  | ...

  ## 주요 기능 변경

  ### 신규 기능
  - ...

  ### 수정된 기능
  - ...

  ## 기준체계 변경 사항
  - ItemCode → mes_code 전면 전환 완료
  - ...

  ## 미완료 / 보류 항목
  - ...

  ## 현장 실무자 적응 현황
  - ...
  ```

- [ ] **Step 3: 커밋 & 푸시 (vault-sync 브랜치)**

  ```powershell
  $d = Get-Date -Format yyyy-MM-dd
  git add vault/guides/변경_요약_2026-06.md
  git commit -m "$d docs: 6월 변경 요약 문서 추가 (복귀 리뷰용)"
  git push origin vault-sync
  ```

---

## 체크리스트 (전체 완료 기준)

권동환 사원 복귀 전(6월 25일) 이전에 다음이 모두 완료되어야 한다:

- [ ] `backend/app/schemas/` 패키지 분리 완료, 기존 임포트 동작 확인
- [ ] `frontend/app/legacy/README.md`, `_warehouse_v2/README.md` 추가
- [ ] `backend/app/routers/inventory/_tx_filters.py` 분리 완료
- [ ] `vault-sync` 브랜치 최신 코드 기준 리빌드 완료
- [ ] `vault/guides/ERD.md` 작성 완료
- [ ] `vault/guides/화면_정의서.md` 작성 완료
- [ ] `vault/guides/변경_요약_2026-06.md` 작성 완료, vault-sync 푸시 완료
- [ ] 모든 변경 후 `verify_local.ps1` 통과 확인

## 실행하지 않는 것 (이유)

- `frontend/app/legacy/` 폴더 이름 변경 — URL 라우팅과 묶여 있어 기능 리스크 있음
- `IoComposeView.tsx` 컴포넌트 분리 — 이미 hooks 분리가 잘 되어 있고, JSX 분리는 리스크 대비 효과가 낮음
- DB 구조 변경 — 이번 작업 범위 아님
- 주간 보고 관련 파일 — frozen, 건드리지 않음
