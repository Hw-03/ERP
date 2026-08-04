> **추천 모델: GPT-5.6 Terra** - 다중 시트 XLSX 구조와 백엔드 생성 매핑을 함께 바꾸며 회귀 검증이 필요합니다.
> **추천 추론 수준: 높음** - 열 재배치와 서식 보존의 교차 영향 범위를 정확히 검증해야 합니다.

# F704-02 Ledger Layout Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**GOAL:** F704-02 다운로드 양식을 11열로 정리하고 본문 노란 채우기를 제거한 뒤, 생성 데이터와 서식을 자동 검증한다.

**Goal:** 모델명·규격 열 없는 11열 F704-02 파일을 다운로드하고 모든 본문 행을 무채움으로 유지한다.

**Architecture:** 원본 XLSX의 두 시트를 OOXML 수준에서 13열에서 11열로 재구성해 기존 인쇄·주석 등 패키지 자산을 보존한다. 생성 서비스는 새 열 위치만 기록하고, 단위·라우터 테스트는 양식 구조와 생성 결과를 함께 고정한다.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, pytest, openpyxl(검증 전용), OOXML/XLSX, `@oai/artifact-tool`(양식 시각 검증).

---

## Execution Strategy

**추천 구성: 솔로** - 템플릿 구조 변경 후 생성기 매핑이 따라가는 순차 의존 작업이며, 현재 세션에서 통합 검증하는 편이 안전하다.

---

## File structure

- Modify: `backend/app/assets/f704_02_template.xlsx` — `양식`, `양식_출력용`의 대장 표를 동일한 11열 구조와 무채움 본문으로 제공하고, 표 뒤의 빈 보조 열은 그대로 보존한다.
- Modify: `backend/app/services/f704_02_ledger.py` — 모델명 조회·규격 기록을 제거하고 A:K 매핑 및 자동필터·담당자 열 인덱스를 조정한다.
- Modify: `backend/tests/services/test_f704_02_ledger.py` — 렌더된 파일의 11열 구조, 본문 서식, 확장 행 범위를 검증한다.
- Modify: `backend/tests/routers/test_admin_audit_ledger.py` — 실제 다운로드의 새 열 위치를 검증한다.

### Task 1: F704-02 새 양식의 실패 테스트 작성 `[GPT-5.6 Terra | 순차]`

**Files:**
- Modify: `backend/tests/services/test_f704_02_ledger.py`
- Modify: `backend/tests/routers/test_admin_audit_ledger.py`

- [ ] **Step 1: 서비스 렌더링 기대값을 11열로 변경한다.**

  `test_render_workbook_extends_template_rows_with_same_data_style`에서 마지막 행의 품명을 `E1937`, 수량을 `F1937`, 자동필터를 `A3:K1937`로 기대한다. 템플릿 구조 테스트에는 두 시트 모두 3행 헤더가 `A:K`의 11개 열이고, `A61`의 채우기 타입이 비어 있음을 추가한다.

- [ ] **Step 2: 라우터 다운로드 기대값을 새 위치로 변경한다.**

  `COCOON` 모델명 `E4` 기대와 `ProductSymbol` 준비를 제거한다. 실제 거래에 대해 `E4` 품명, `F4` 수량, `G4` 입고/출고, `H4` 입/출고처, `I4` 담당자, `K4` 비고를 기대한다.

- [ ] **Step 3: 실패를 확인한다.**

  Run: `cd backend; python -m pytest tests/services/test_f704_02_ledger.py tests/routers/test_admin_audit_ledger.py -q`

  Expected: 기존 13열 자동필터·셀 위치·노란 채우기 때문에 실패한다.

### Task 2: 템플릿과 생성기 매핑을 11열로 전환한다 `[GPT-5.6 Terra | 순차]`

**Files:**
- Modify: `backend/app/assets/f704_02_template.xlsx`
- Modify: `backend/app/services/f704_02_ledger.py`

- [ ] **Step 1: 두 템플릿 시트를 같은 열 매핑으로 변환한다.**

  OOXML에서 기존 E·G열을 삭제하고, 대장 표의 남는 열을 `A→A`, `B→B`, `C→C`, `D→D`, `F→E`, `H→F`, `I→G`, `J→H`, `K→I`, `L→J`, `M→K`로 이동한다. 표 뒤의 빈 보조 열 N:P는 삭제에 맞춰 L:N으로만 이동해 보존한다. 열 너비·테두리·숫자 형식은 각 원본 열에서 이동시키고, 제목 영역·셀 참조·표·필터·인쇄 범위·열 정의를 새 구조로 맞춘다. 4행 이후 대장 표 셀의 채우기만 제거하여 행 61을 포함한 본문에서 노란색이 재발하지 않게 한다.

- [ ] **Step 2: 생성 데이터 구조와 조회를 줄인다.**

  `F704LedgerEntry`에서 `model_name`을 삭제하고 `ProductSymbol` import, 제품기호 조회, `_model_name` 함수를 제거한다. `collect_entries`는 품목 코드·이름 등 실제 대장 데이터만 수집한다.

- [ ] **Step 3: 새 열 위치로 값을 기록한다.**

  `_populate_worksheet`의 행 매핑을 아래처럼 교체한다.

  ```python
  values = {
      "A": ("number", offset + 1),
      "B": ("number", _excel_date(entry.occurred_on)),
      "C": ("text", ""),
      "D": ("text", entry.item_code),
      "E": ("text", entry.item_name),
      "F": ("number", entry.quantity),
      "G": ("text", entry.direction),
      "H": ("text", entry.counterpart),
      "I": ("text", entry.requester),
      "J": ("text", ""),
      "K": ("text", entry.remark),
  }
  ```

  `_update_ranges`의 시트 범위와 자동필터를 `A1:N{last_row}`, `A3:K{last_row}`로 변경하고, 담당자 열 숨김 해제 대상도 K열에서 I열로 이동한다.

- [ ] **Step 4: 변경한 테스트를 실행한다.**

  Run: `cd backend; python -m pytest tests/services/test_f704_02_ledger.py tests/routers/test_admin_audit_ledger.py -q`

  Expected: PASS.

### Task 3: 양식 시각·회귀 검증을 마친다 `[GPT-5.6 Terra | 순차]`

**Files:**
- Verify: `backend/app/assets/f704_02_template.xlsx`
- Verify: `backend/app/services/f704_02_ledger.py`
- Verify: `backend/tests/services/test_f704_02_ledger.py`
- Verify: `backend/tests/routers/test_admin_audit_ledger.py`

- [ ] **Step 1: 수정된 템플릿의 두 시트를 렌더링해 확인한다.**

  `@oai/artifact-tool`로 `양식`, `양식_출력용`의 A1:K10을 렌더링한다. 11개 헤더가 보이고, 품번·품명·수량 이후 열이 정상 정렬되며 본문에 노란 채우기가 없는지 확인한다.

- [ ] **Step 2: 변경 범위의 백엔드 게이트를 실행한다.**

  Run: `powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode backend`

  Expected: PASS.

- [ ] **Step 3: 변경 범위를 검토한다.**

  Run: `git diff --check; git diff -- backend/app/services/f704_02_ledger.py backend/tests/services/test_f704_02_ledger.py backend/tests/routers/test_admin_audit_ledger.py`

  Expected: 공백 오류가 없고 F704-02 관련 파일만 의도대로 변경되어 있다. 프로젝트 규칙에 따라 커밋·푸시는 수행하지 않는다.

## Self-review

- 설계의 열 삭제, 본문 노란 채우기 제거, 두 시트 동기화, 생성기 단순화, 품목명 처리 보류를 각각 Task 2에 포함했다.
- 테스트 우선 작성과 실패 확인은 Task 1, 통과 확인은 Task 2에 분리했다.
- 새 열 매핑·검증 명령·수정 파일을 모두 명시했으며 미정 항목은 남기지 않았다.
