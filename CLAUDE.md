# CLAUDE.md

## Project Rules

- Official system name: **DEXCOWIN MES**. Do not call it ERP or X-Ray in user-facing text or documents.
- backend: `backend/`
- frontend: `frontend/`
- backend entry: `backend/app/main.py`
- Before editing frontend code, verify the real render/import path first.
- If docs and live code disagree, trust the live code.
- Do not edit `_archive/`, `_backup/`, or `frontend/_archive/` unless explicitly asked.
- Do not casually edit `_attic/`; it contains archived source material, backups, and old working notes.
- **주간보고 화면은 동결(완성)** — `frontend/app/legacy/_components/_weekly_sections/` 디렉터리 전체와 `frontend/app/legacy/_components/DesktopWeeklyReportView.tsx` 는 수정 금지. 명시적 수정 요청이 있을 때만 손대고, 그렇지 않은 경우(주변 리팩터·전역 변경·이름 통일 등)는 해당 파일들을 우회. (동결일: 2026-05-24)
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
