# CLAUDE.md

**Always respond in Korean. Conclusion first, short and clear.**

## Project Rules

- Official system name: **DEXCOWIN MES**. Do not call it ERP or X-Ray in user-facing text or documents.
- backend: `backend/`
- frontend: `frontend/`
- backend entry: `backend/app/main.py`
- Before editing frontend code, verify the real render/import path first.
- If docs and live code disagree, trust the live code.
- Do not hardcode variable counts (item count, process/model count, etc.) in documents. Check actual values with `python _attic/backend-scripts/facts.py` (documents should only reference this command). Leave historical snapshot logs as-is.
- Do not edit `_archive/` or `frontend/_archive/` unless explicitly asked.
- Do not casually edit `_attic/`; it is the boxed-up storage for everything not at a tool-required path — domain docs (GLOSSARY/CONTEXT/ADR/ARCHITECTURE/ERD/OPERATIONS), one-off backend scripts, DB backups, ONBOARDING, finished plans.
- **Weekly report screen is frozen (complete)**
  - Frontend: entire `frontend/app/legacy/_components/_weekly_sections/` directory + `frontend/app/legacy/_components/DesktopWeeklyReportView.tsx` (frozen: 2026-05-24)
  - Backend: `backend/app/routers/inventory/weekly_report.py` (frozen: 2026-05-29)
  - Touch only when explicitly asked. Bypass these files for surrounding refactors, global renames, etc. When adding a new `TransactionTypeEnum`, only update the classification sets (`PRODUCTION_TX_TYPES` / `NON_PRODUCTION_TX_TYPES`) in weekly_report.py.
- Do not mix sample data with real data.
- Do not perform large refactors, folder moves, or renames unless explicitly asked.
- Do not rename legacy internal identifiers such as `xray-erp` unless explicitly asked.

## Plan Mode — Model Recommendation

After completing a plan, always place the recommended model at the very top of the plan shown to the user:

> **추천 모델 : Sonnet** — [한 줄 이유]

Criteria:
- **Haiku**: Simple repetitive tasks. e.g. variable rename, file search, minor text edits.
- **Sonnet**: General development tasks. e.g. bug fix, add a router, API integration, moderate refactor.
- **Opus**: High-complexity judgment tasks. e.g. redesigning the stock request state machine, security-related auth changes, structural changes spanning many files.

---

## Commit / Push

- Never auto-commit or auto-push.
- Commit and push only when the user explicitly asks.
- When explicitly asked to commit and push, run the required local checks first to avoid GitHub CI failures, and unless told otherwise, commit and push only the changes made in the current session.
- **Required commit message format: `YYYY-MM-DD area: summary`**
  - **Always check the real date immediately before committing** using `date +%Y-%m-%d` (Bash) or `Get-Date -Format yyyy-MM-dd` (PowerShell). Do not reuse the date baked into session context — sessions can span midnight.
  - Examples: `2026-05-26 backend: fix serial assignment`, `2026-05-26 vault: update Obsidian config`
  - `area` is free-form — `frontend`, `backend`, `desktop`, `mobile`, `admin`, `docs`, `data`, `fix`, `refactor`, `chore`, `vault`, `defect`, `items`, `ux`, `weekly`, `history`, `capacity`, etc.
  - **Forbidden patterns** (never use):
    - Conventional Commits: `type(scope): X` (e.g. `fix(items): X`, `docs(vault): X`)
    - Bracket prefix: `[chore] X`, `[W12-A] X`, `[defect][io] X`
    - Mixed: `2026-05-26 fix(items): X` (date is OK but `type(scope)` in area is forbidden)
  - Merge commits (`Merge ...`) keep git's auto-generated message as-is — do not edit.
  - The body is free-form. The above rules apply to the subject line only.

## DB / Run / Verify

- Starting the server must not change the DB.
- Before DB-changing work, briefly explain the impact first.
- For setup, schema changes, migrations, or seed work:

```bash
cd backend
python bootstrap_db.py --all
```

- Run backend (canonical — auto-cleans zombie workers + checks /health/live):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\start-backend.ps1
```

- Stop backend (force-kills all PIDs on port 8010):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\stop-backend.ps1
```

- If the backend shows 0 log lines, suspect a zombie — run stop then start.

- Before commit/push, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1
```

## Session Handoff

At the start of a new session, check the most recent file in `_attic/handoff/` first (newest date in filename).

## Resource Locations

Only files automatically referenced by tools remain at the root and in each folder. Everything else is consolidated into `_attic/`.

- Domain glossary and guides (GLOSSARY/CONTEXT/ARCHITECTURE/ERD/ADR/OPERATIONS/ITEM_CODE_RULES/ATTIC_POLICY): `_attic/docs/`
- One-off backend scripts (seed, sync, archive, backup): `_attic/backend-scripts/`
  - Run: `cd backend && python ../_attic/backend-scripts/<script>.py`
  - `sys.path` is patched to auto-include `backend/`
- DB backups: `_attic/data/db_backups/` (local only, matched by `.gitignore` — not tracked)
- New member guide: `_attic/ONBOARDING.md`
- Active DB: `backend/mes.db` (single — `app.db`, `erp.db` traces removed)

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
