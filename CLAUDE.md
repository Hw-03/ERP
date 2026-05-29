# CLAUDE.md

## Project Rules

- Official system name: **DEXCOWIN MES**. Do not call it ERP or X-Ray in user-facing text or documents.
- backend: `backend/`
- frontend: `frontend/`
- backend entry: `backend/app/main.py`
- Before editing frontend code, verify the real render/import path first.
- If docs and live code disagree, trust the live code.
- Do not edit `_archive/` or `frontend/_archive/` unless explicitly asked.
- Do not casually edit `_attic/`; it is the boxed-up storage for everything not at a tool-required path — domain docs (GLOSSARY/CONTEXT/ADR/ARCHITECTURE/ERD/OPERATIONS), one-off backend scripts, DB backups, ONBOARDING, finished plans.
- **주간보고 화면은 동결(완성)**
  - 프론트: `frontend/app/legacy/_components/_weekly_sections/` 디렉터리 전체 + `frontend/app/legacy/_components/DesktopWeeklyReportView.tsx` (동결일: 2026-05-24)
  - 백엔드: `backend/app/routers/inventory/weekly_report.py` (동결일: 2026-05-29)
  - 명시적 수정 요청이 있을 때만 손대고, 그렇지 않은 경우(주변 리팩터·전역 변경·이름 통일 등)는 해당 파일들을 우회. 신규 `TransactionTypeEnum` 추가 시에는 weekly_report.py 의 분류 set(`PRODUCTION_TX_TYPES` / `NON_PRODUCTION_TX_TYPES`) 만 갱신.
- Do not mix sample data with real data.
- Do not perform large refactors, folder moves, or renames unless explicitly asked.
- Do not rename legacy internal identifiers such as `xray-erp` unless explicitly asked.
- Respond in Korean, conclusion first, short and clear.

## Commit / Push

- Never auto-commit or auto-push.
- Commit and push only when the user explicitly asks.
- When explicitly asked to commit and push, run the required local checks first to avoid GitHub CI failures, and unless told otherwise, commit and push only the changes made in the current session.
- **Commit message 형식 (필수): `YYYY-MM-DD area: 요약`**
  - **날짜는 커밋 직전 `date +%Y-%m-%d` (Bash) 또는 `Get-Date -Format yyyy-MM-dd` (PowerShell) 로 확인한 실제 시점.** 세션 시작 시 컨텍스트에 박힌 날짜를 그대로 쓰면 세션이 자정을 넘어갔을 때 어긋남.
  - 예: `2026-05-26 backend: 시리얼 부여 수정`, `2026-05-26 vault: Obsidian 설정 갱신`
  - `area`는 자유 분류 — `frontend`, `backend`, `desktop`, `mobile`, `admin`, `docs`, `data`, `fix`, `refactor`, `chore`, `vault`, `defect`, `items`, `ux`, `weekly`, `history`, `capacity` 등 작업 영역
  - **금지 패턴** (절대 사용 X):
    - Conventional Commits: `type(scope): X` (예: `fix(items): X`, `docs(vault): X`)
    - Bracket prefix: `[chore] X`, `[W12-A] X`, `[defect][io] X`
    - 혼합형: `2026-05-26 fix(items): X` (날짜는 OK지만 area에 `type(scope)` 금지)
  - Merge 커밋(`Merge ...`)은 git이 만든 자동 메시지 그대로 유지 — 수정 X
  - 본문(body)은 자유 형식. 위 규칙은 제목 1줄에만 적용.

## DB / Run / Verify

- Starting the server must not change the DB.
- Before DB-changing work, briefly explain the impact first.
- For setup, schema changes, migrations, or seed work:

```bash
cd backend
python bootstrap_db.py --all
```

- Run backend (canonical — 좀비 워커 자동 정리 + /health/live 확인):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\start-backend.ps1
```

- Stop backend (포트 8010 잡은 모든 PID 강제 종료):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\stop-backend.ps1
```

- 백엔드에 로그가 0줄이면 좀비 의심 — stop 실행 후 start 로 재기동.

- Before commit/push, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1
```

## 세션 인수인계

새 세션 시작 시 가장 먼저 확인: `_attic/handoff/` 의 가장 최근 날짜 파일.
현재 최신: `_attic/handoff/2026-05-29-handoff.md` (정리 작업 결과 + 사원님 답장 대기 + 남은 작업 후보).

## 자료 위치 (2026-05-29 정리 후)

루트·각 폴더에는 도구가 자동 참조하는 파일만 남기고, 나머지는 모두 `_attic/` 보관소로 통합.

- 도메인 사전·가이드 (GLOSSARY/CONTEXT/ARCHITECTURE/ERD/ADR/OPERATIONS/ITEM_CODE_RULES/ATTIC_POLICY): `_attic/docs/`
- 1회성 backend 스크립트 (seed, sync, archive, backup): `_attic/backend-scripts/`
  - 실행: `cd backend && python ../_attic/backend-scripts/<script>.py`
  - sys.path 가 `backend/` 자동 추가하도록 패치됨
- DB 백업: `_attic/data/db_backups/` (로컬, `.gitignore` 매칭 — 추적 X)
- 신규 합류자 가이드: `_attic/ONBOARDING.md`
- 활성 DB: `backend/mes.db` (단일 — `app.db`, `erp.db` 흔적 제거됨)

---

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```text
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
