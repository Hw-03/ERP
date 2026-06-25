# AGENTS.md

This file is the Codex-facing companion to `CLAUDE.md`.
Keep both files aligned so Claude Code and Codex can work on DEXCOWIN MES with the same project rules and development flow.

**Always respond in Korean. Conclusion first, short and clear.**

## Agent Skills

- Repo-local skills live in `.agents/skills/` and should be treated as the shared Claude/Codex workflow layer for this MES project.
- Before starting a task, check whether a relevant skill applies. If a skill applies, **read the `SKILL.md` file directly** (e.g. `.agents/skills/brainstorming/SKILL.md`) and follow it before taking task actions.
- Prefer these workflow skills when relevant:
  - `using-superpowers`: skill discovery and activation discipline.
  - `brainstorming`: feature/design/change shaping before implementation.
  - `systematic-debugging`: bugs, test failures, and unexpected behavior.
  - `test-driven-development`: feature or bugfix implementation.
  - `writing-plans` and `executing-plans`: planning and carrying out implementation plans.
  - `verification-before-completion`: before claiming work is complete.
- Keep `.agents/skills/` aligned with the user's Claude/Codex skill set when intentionally updating shared workflows.

## Project Rules

- Official system name: **DEXCOWIN MES**. Do not call it ERP or X-Ray in user-facing text or documents.
- backend: `backend/`
- frontend: `frontend/`
- backend entry: `backend/app/main.py`
- Before editing frontend code, verify the real render/import path first.
- If docs and live code disagree, trust the live code.
- Do not hardcode variable counts (item count, process/model count, etc.) in documents. Check actual values with `python _attic/backend-scripts/facts.py` (documents should only reference this command). Leave historical snapshot logs as-is.
- Do not edit `_archive/` or `frontend/_archive/` unless explicitly asked.
- Do not casually edit `_attic/`; it is the boxed-up storage for everything not at a tool-required path: domain docs (GLOSSARY/CONTEXT/ADR/ARCHITECTURE/ERD/OPERATIONS), one-off backend scripts, DB backups, ONBOARDING, finished plans.
- **Weekly report screen is frozen (complete)**
  - Frontend: entire `frontend/app/mes/_components/_weekly_sections/` directory + `frontend/app/mes/_components/DesktopWeeklyReportView.tsx` (frozen: 2026-05-24)
  - Backend: `backend/app/routers/inventory/weekly_report.py` (frozen: 2026-05-29)
  - Touch only when explicitly asked. Bypass these files for surrounding refactors, global renames, etc. When adding a new `TransactionTypeEnum`, only update the classification sets (`PRODUCTION_TX_TYPES` / `NON_PRODUCTION_TX_TYPES`) in weekly_report.py.
- **Mobile bottom tab bar design is frozen (complete)**
  - `frontend/app/mes/_components/mobile/MobileShell.tsx`: the NavButton component and `<nav>` container styling (frozen: 2026-06-16). Sliding pill (`containerRef` / `pill` state / `useLayoutEffect`) implementation complete (2026-06-16).
  - `frontend/app/globals.css`: the `button.no-btn-inset` opt-out rule (frozen: 2026-06-16)
  - Do not touch the tab bar layout, button design, shadow, or pill styling without an explicit request.
  - **"More" behavior change (2026-06-17, user-approved)**: "More" was converted from a BottomSheet to a proper 5th full-width tab (`more`, `MobileMoreScreen`). `pillOverride`, the 470ms sheet delay, and `MobileMoreSheet` were removed. The NavButton, `<nav>`, and pill visual design itself remain frozen.
- Do not mix sample data with real data.
- Do not perform large refactors, folder moves, or renames unless explicitly asked.
- Do not rename legacy internal identifiers such as `xray-erp` unless explicitly asked.
- **Renames and moves must be complete in the same change.** After renaming or moving a file/symbol/route, grep the old name across BOTH code and docs (`_attic/docs/`, READMEs) and update every hit, or explicitly note the ones intentionally kept (e.g. the `legacy_part` / `legacy_item_type` data fields). The same applies to facts inside docs: if you change behavior, fix or mark `[STALE]` the doc sentence that now lies about it.
- **Verify a claim about the code before reporting it.** Any judgment ("this is duplicated", "untestable", "not extracted into a service", "a bug", "needs refactoring") must be confirmed against the actual file and cited as `file:line`, not inferred from a name or a partial read. Separate what you verified by reading from what you only inferred.

## Plan Mode - Model Recommendation

After completing a plan, always place the recommended model at the very top of the plan shown to the user:

> **Recommended model: Sonnet** - [one-line reason]

Criteria:
- **Haiku**: Simple repetitive tasks. e.g. variable rename, file search, minor text edits.
- **Sonnet**: General development tasks. e.g. bug fix, add a router, API integration, moderate refactor.
- **Opus**: High-complexity judgment tasks. e.g. redesigning the stock request state machine, security-related auth changes, structural changes spanning many files.

For Codex plans, also include the recommended execution shape when useful: solo vs. subagents, and any relevant effort/reasoning level supported by the current Codex surface.

## Commit / Push

- Never auto-commit or auto-push.
- Commit and push only when the user explicitly asks.
- When explicitly asked to commit and push, run the required local checks first to avoid GitHub CI failures, and unless told otherwise, commit and push only the changes made in the current session.
- **Required commit message format: `YYYY-MM-DD area: summary`**
  - **Always check the real date immediately before committing** using `date +%Y-%m-%d` (Bash) or `Get-Date -Format yyyy-MM-dd` (PowerShell). Do not reuse the date baked into session context; sessions can span midnight.
  - Commit subjects and bodies must be written in Korean, except for technical identifiers, paths, branch names, and commands.
  - Examples: `2026-05-26 backend: 시리얼 배정 오류 수정`, `2026-05-26 vault: Obsidian 설정 갱신`
  - `area` is free-form: `frontend`, `backend`, `desktop`, `mobile`, `admin`, `docs`, `data`, `fix`, `refactor`, `chore`, `vault`, `defect`, `items`, `ux`, `weekly`, `history`, `capacity`, etc.
  - **Forbidden patterns** (never use):
    - Conventional Commits: `type(scope): X` (e.g. `fix(items): X`, `docs(vault): X`)
    - Bracket prefix: `[chore] X`, `[W12-A] X`, `[defect][io] X`
    - Mixed: `2026-05-26 fix(items): X` (date is OK but `type(scope)` in area is forbidden)
  - Merge commits (`Merge ...`) keep git's auto-generated message as-is; do not edit.
  - The body is free-form. The above rules apply to the subject line only.
  - **Multi-line message safety:** Do not use the PowerShell here-string `@'...'@` when running `git commit` from a bash/sh shell — it corrupts the subject line. For multi-line messages use `git commit -F <file>` or multiple `-m` flags. In PowerShell, `@'...'@` is fine. **After every commit, verify the subject with `git log -1 --format=%s`.**
  - A local hook `.git/hooks/commit-msg` (not version-controlled; shared across sessions on this clone) enforces the `YYYY-MM-DD area: summary` format and rejects `@`-corrupted subjects. If it goes missing, recreate it.

## DB / Run / Verify

- Starting the server must not change the DB.
- Before DB-changing work, briefly explain the impact first.
- For setup, schema changes, migrations, or seed work:

```bash
cd backend
python bootstrap_db.py --all
```

- Run backend (canonical; auto-cleans zombie workers + checks `/health/live`):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\start-backend.ps1
```

- Stop backend (force-kills all PIDs on port 8010):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\stop-backend.ps1
```

- If the backend shows 0 log lines, suspect a zombie; run stop then start.

- Before commit/push, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1
```

## Session Handoff

At the start of a new session, check the most recent file in `_attic/handoff/` first (newest date in filename).

> **Note:** Claude Code maintains a private auto-memory at `~/.claude/projects/.../memory/` that is not accessible to Codex. For cross-session and cross-agent context, rely solely on `_attic/handoff/`.

## Resource Locations

Only files automatically referenced by tools remain at the root and in each folder. Everything else is consolidated into `_attic/`.

- Domain glossary and guides (GLOSSARY/CONTEXT/ARCHITECTURE/ERD/ADR/OPERATIONS/ITEM_CODE_RULES/ATTIC_POLICY): `_attic/docs/`
- One-off backend scripts (seed, sync, archive, backup): `_attic/backend-scripts/`
  - Run: `cd backend && python ../_attic/backend-scripts/<script>.py`
  - `sys.path` is patched to auto-include `backend/`
- DB backups: `backend/_backup/` (local only, matched by `.gitignore`; not tracked)
- New member guide: `_attic/ONBOARDING.md`
- Active DB: `backend/mes.db` (single; `app.db`, `erp.db` traces removed)

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't improve adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it; don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" -> "Write tests for invalid inputs, then make them pass"
- "Fix the bug" -> "Write a test that reproduces it, then make it pass"
- "Refactor X" -> "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```text
1. [Step] - verify: [check]
2. [Step] - verify: [check]
3. [Step] - verify: [check]
```

These guidelines are working if there are fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
