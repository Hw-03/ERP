# 원자재 보류 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**GOAL:** 사용자가 수정한 원자재 분류 검토 엑셀에서 보류 61개를 품명·BOM·제품 구성 근거로 사출 또는 기타로 재분류하고, 삭제된 열에 맞춰 수식 오류 없이 요약과 기준을 갱신한다.

**Goal:** 검토 엑셀에서 최종 분류 `보류`를 제거하고 사용자가 축소한 7열 구조를 유지한다.

**Architecture:** 현재 엑셀을 가져와 F열의 기존 `보류` 61개에만 이름 기반의 구조성 플라스틱/기타 매핑을 적용한다. 요약·기준은 이 5개 최종 분류와 현 열 구조를 참조하도록 최소 수정한다.

**Tech Stack:** Excel `.xlsx`, `@oai/artifact-tool`, 읽기 전용 SQLite

---

## Execution Strategy

**추천 모델: GPT-5.6 Terra** — 품명·제품 구성·BOM 근거를 조합해 강제 분류의 오판 위험을 통제해야 합니다.

**추천 추론 수준: 높음** — 사용자 수정본의 수식 참조 손상과 61개 개별 품목의 판정을 함께 검증해야 합니다.

**팀 구성: 불필요** — 하나의 엑셀 파일 안에서 분류, 요약, 검증이 순차적으로 연결됩니다.

---

### Task 1: 보류 재분류 규칙 검증 `[GPT-5.6 Terra 순차]`

**Files:**
- Modify: `C:\ERP\.tmp\material-subcategory-workbook\classification-rules.test.mjs`
- Modify: `C:\ERP\.tmp\material-subcategory-workbook\classification-rules.mjs`

- [ ] `GUIDE`, `KEY`, `COVER`는 사출, `LED`, `LCD 판넬`, `USB`, `WIFI`, `방열`, `스티커`는 기타가 되는 실패 테스트를 추가한다.
- [ ] 테스트를 실행해 기존 규칙이 보류를 반환함을 확인한다.
- [ ] 보류 제거 전용 분류 함수를 추가하고 테스트를 통과시킨다.

### Task 2: 사용자 수정 엑셀 최소 갱신 `[GPT-5.6 Terra 순차]`

**Files:**
- Modify: `C:\ERP\.tmp\material-subcategory-workbook\build.mjs`
- Modify: `C:\ERP\outputs\01a01de8-ca0a-7c12-9bf8-6eb06c3c21b3\DEXCOWIN_MES_원자재_분류검토.xlsx`

- [ ] 현재 7열 구조와 사용자 메모를 불러온다.
- [ ] 기존 F열 값이 `보류`인 61개만 사출 또는 기타로 변경하고 판정 근거를 업데이트한다.
- [ ] F열 드롭다운을 `사출`, `보드`, `하네스`, `포장 자재`, `기타`로 제한한다.
- [ ] 요약의 삭제된 판정 상태 참조를 제거하고, 5개 최종 분류 집계 수식을 복구한다.
- [ ] 분류 기준 시트에서 `보류`를 `기타` 처리 원칙으로 변경한다.

### Task 3: 엑셀 검증 `[GPT-5.6 Terra 순차]`

**Files:**
- Verify: `C:\ERP\outputs\01a01de8-ca0a-7c12-9bf8-6eb06c3c21b3\DEXCOWIN_MES_원자재_분류검토.xlsx`

- [ ] 최종 분류 662개 중 `보류`가 0개인지, 5개 분류 합계가 662인지 검사한다.
- [ ] 오류 수식 검색과 최종 분류 변경 후 요약 수식 재계산을 확인한다.
- [ ] 요약·검토·기준 시트를 렌더링해 제목, 열, 집계 수치의 잘림이 없는지 확인한다.
