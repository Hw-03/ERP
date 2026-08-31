# 관리자 내보내기 독립 카드 구현 계획

> 상태: 2026-08-04 승인·구현된 `2026-08-04-admin-export-unified-card.md`가 이 계획의 독립 카드 구조를 대체한다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**GOAL:** 관리자 내보내기의 데이터 추출과 내부 원본 로그를 독립 카드로 분리하고 실행 버튼과 로그 스크롤 위치를 안정화한다.

**Goal:** 데이터 내보내기와 내부 원본 로그를 서로 독립된 반응형 카드로 재구성한다.

**Architecture:** `AdminExportSection`이 하단 50:50 그리드와 데이터 카드의 상태·실행을 소유한다. `AdminAuditCsvSection`은 접기 상태가 없는 원본 로그 전용 카드로 렌더링하고 단일 헤더 아래의 월별 목록만 스크롤을 소유한다.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Testing Library

---

## Execution Strategy

**추천 모델: GPT-5.6 Terra** — 두 컴포넌트의 높이·스크롤 계약과 기존 다운로드 회귀를 함께 다루는 프런트엔드 변경입니다.

**추천 추론 수준: 높음** — 범위별 조건부 UI와 반응형 스크롤 경계를 함께 확인해야 합니다.

**팀 구성: 불필요** — 두 컴포넌트와 테스트가 같은 레이아웃 계약을 공유해 순차 구현이 효율적입니다.

---

### Task 1: 독립 카드 계약 테스트 `[GPT-5.6 Terra] [순차]`

**Files:**
- Modify: `frontend/app/mes/_components/_admin_sections/__tests__/AdminExportSection.test.tsx`
- Modify: `frontend/app/mes/_components/_admin_sections/__tests__/AdminAuditCsvSection.test.tsx`

- [x] 하단 그리드에 `데이터 내보내기`와 `내부 원본 로그 관리` 독립 영역이 존재하고 50:50 `xl` 열을 사용하는 테스트를 작성한다.
- [x] 데이터 다운로드 버튼이 `mt-auto` 실행 영역에 있고 피드백이 버튼 위에 배치되는 계약을 작성한다.
- [x] 원본 로그에 `details`/`summary`가 없고 본문과 월별 목록이 즉시 노출되는 계약으로 기존 테스트를 변경한다.
- [x] `내부 원본 로그 (월별)` 제목과 월별 다운로드만 표시되고 백필·새로고침 조작은 없는 계약을 작성한다.
- [x] 다음 명령을 실행해 새 계약이 기존 구현에서 실패하는지 확인한다.

```powershell
cd C:\ERP\frontend
npm test -- app/mes/_components/_admin_sections/__tests__/AdminExportSection.test.tsx app/mes/_components/_admin_sections/__tests__/AdminAuditCsvSection.test.tsx
```

### Task 2: 독립 카드 최소 구현 `[GPT-5.6 Terra] [순차]`

**Files:**
- Modify: `frontend/app/mes/_components/_admin_sections/AdminExportSection.tsx`
- Modify: `frontend/app/mes/_components/_admin_sections/AdminAuditCsvSection.tsx`

- [x] `AdminExportSection`의 단일 데이터 표면을 하단 50:50 그리드와 독립 데이터 카드·원본 로그 카드로 분리한다.
- [x] 데이터 조작부를 `flex min-h-0 flex-1 flex-col`로 유지하고 피드백 다음 실행 버튼 래퍼에 `mt-auto`를 적용한다.
- [x] `AdminAuditCsvSection`의 `details`, `summary`, 펼침 아이콘과 접기 상태를 제거하고 `rounded-[20px]` 독립 `section`으로 바꾼다.
- [x] 원본 로그 카드의 제목·도구 영역은 고정하고 `audit-log-scroll`만 `min-h-0 flex-1 overflow-x-auto xl:overflow-auto`를 유지한다.
- [x] 원본 로그 제목을 `내부 원본 로그 (월별)`로 정리하고 백필·새로고침 상태와 조작부를 제거한다.
- [x] Task 1의 테스트를 다시 실행해 통과시킨다.

### Task 3: 문서와 수용 검증 `[GPT-5.6 Terra] [순차]`

**Files:**
- Modify: `_attic/handoff/archive/2026-08-28-todo-baseline/2026-08-03-admin-export-followup-todo.md`

- [x] 기존 “원본 로그 기본 닫힘·데이터 카드 내부 수납” 정책을 독립 카드·항상 펼침 정책으로 갱신한다.
- [x] `git diff --check`와 관련 Vitest를 실행한다.
- [x] `powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode frontend`를 한 번 실행한다.
- [x] 인앱 브라우저에서 1923×910, 1100px, 1280px와 라이트·다크 테마를 확인한 뒤 원래 상태로 복원한다.

커밋·푸시·브랜치 작업은 프로젝트 규칙과 사용자 요청에 따라 수행하지 않는다.
