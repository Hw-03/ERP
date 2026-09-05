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
  - `efficient-verification`: before choosing broad test/verify commands, especially to avoid repeated slow full gates while keeping final proof reliable.
  - `verification-before-completion`: before claiming work is complete.
- Prefer proactive subagent use for broad investigations, code reviews, plan validation, and 2+ independent tasks:
  - Use `dispatching-parallel-agents` for parallel research/review when agents can work without editing the same files.
  - Use `subagent-driven-development` when executing a plan with independent implementation tasks in the current session.
  - Keep final integration, verification, commit, push, and deployment decisions in the parent session.
  - Do not dispatch multiple implementation subagents to edit the same files or tightly coupled behavior at the same time.
  - When spawning a subagent, select its GPT-5.6 model and reasoning level for the delegated task's complexity, risk, and expected depth. For all new parent and subagent work, use only GPT-5.6 Sol, Terra, or Luna; do not select any other model family.
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
- **Desktop shipping step 5 final card sizes are frozen (complete)**
  - `frontend/app/mes/_components/DesktopShippingView.tsx`: the `BOM·동반 출하품` and `변경된 구성품` card height allocation in step 5 (frozen: 2026-07-16).
  - `BOM·동반 출하품` must keep the remaining available height and scroll only its inner list.
  - `변경된 구성품` must keep one visible 58px row with two columns; additional items scroll vertically inside that card.
  - Do not change either card's height, grid row allocation, column count, or overflow behavior without an explicit user request.
- Do not mix sample data with real data.
- Do not perform large refactors, folder moves, or renames unless explicitly asked.
- Do not rename legacy internal identifiers such as `xray-erp` unless explicitly asked.
- **Renames and moves must be complete in the same change.** After renaming or moving a file/symbol/route, grep the old name across BOTH code and docs (`_attic/docs/`, READMEs) and update every hit, or explicitly note the ones intentionally kept (e.g. the `legacy_part` / `legacy_item_type` data fields). The same applies to facts inside docs: if you change behavior, fix or mark `[STALE]` the doc sentence that now lies about it.
- **Verify a claim about the code before reporting it.** Any judgment ("this is duplicated", "untestable", "not extracted into a service", "a bug", "needs refactoring") must be confirmed against the actual file and cited as `file:line`, not inferred from a name or a partial read. Separate what you verified by reading from what you only inferred.
- **Windows text encoding safety:** When editing Korean or other non-ASCII documents on Windows, prefer `apply_patch`. If a shell-based write is unavoidable, do not place Korean replacement text directly in the command line; use explicit UTF-8 file APIs or a temporary UTF-8 file/patch, preserve the existing encoding, and verify the real file content with `git diff` or a byte-safe read. Treat terminal mojibake as a display problem until the file bytes prove otherwise.

## Plan Mode - Codex Model Recommendation

After completing a plan, always place the recommended Codex model and reasoning level at the very top of the plan shown to the user. The model must be one of the Codex UI model choices, and the reasoning level must be written in Korean exactly as shown in the UI:

> **추천 모델: GPT-5.6 Terra** - [한 줄 이유]
> **추천 추론 수준: Medium** - [한 줄 이유]
> **울트라: 사용 안 함** - [필요할 때만 한 줄 이유]

Available model choices:
- **GPT-5.6 Sol**: Use for the hardest plans: broad architecture, security/permission changes, state machines, risky data-flow changes, or complex cross-file judgment.
- **GPT-5.6 Terra**: Default for most DEXCOWIN MES development plans: normal feature work, backend+frontend integration, bug fixes, moderate refactors, and test planning.
- **GPT-5.6 Luna**: Use for narrow, quick, low-risk plans: document edits, file searches, simple renames, small UI text/style tweaks, and mechanical cleanup.

UI 추론 수준과 선택 기준:
- **Light**: 답이나 변경 방법이 이미 명확하고, 탐색·도구 호출·검증에 깊은 판단이 거의 필요 없는 지연 시간 우선 작업. 파일 탐색, 기계적 이름 변경, 단순 문구·상수 변경, 좁은 문서 수정에 사용한다.
- **Medium**: 균형 잡힌 시작점이다. 기존 패턴이 분명한 일반 개발, 국소 버그 수정, 표준 API 연동, 제한된 테스트 추가처럼 보통의 판단과 도구 사용은 필요하지만 복잡한 대안 탐색은 필요 없는 작업에 사용한다.
- **High**: Medium으로는 놓치기 쉬운 의존성·예외·회귀 경로가 있고, 추가 추론이 결과 품질을 높일 구체적 이유가 있을 때만 사용한다. 여러 모듈의 상태 변화, 비자명한 디버깅, 데이터 흐름 검증, 테스트 설계가 그 예다.
- **Extra High**: 설계 대안 비교, 불명확한 결함 원인, 권한·동시성·상태 전이, 여러 독립 조사 결과의 통합처럼 탐색과 검증 자체가 핵심인 작업에 사용한다. 단순히 수정 파일 수가 많다는 이유만으로 올리지 않는다.
- **최대**: 품질 우선의 가장 어려운 작업에만 사용한다. 보안·데이터 정합성·아키텍처 변경처럼 잘못된 판단의 비용이 높고, Extra High보다 더 많은 탐색과 검증이 성공률을 실질적으로 높일 때 선택한다. 같은 유형의 반복 작업에서는 Extra High와 최대를 대표 사례로 비교해 더 나은 품질·지연·사용량 균형을 확인한다.

**울트라**는 위 다섯 단계와 같은 단순 추론 수준이 아니라, Codex가 여러 하위 에이전트를 적극적으로 조율하는 특수 실행 방식으로 취급한다. 서로 독립적인 작업 흐름을 병렬로 나눌 수 있고 그 결과를 통합하는 일이 병목일 때만 추천한다. 단일 문제의 깊은 분석, 순차 의존 작업, 단순히 규모가 크거나 오래 걸리는 작업에는 추천하지 않는다. 울트라는 사용량을 더 빨리 소모한다.

플랜에서는 먼저 `Light` 또는 `Medium`을 기준 후보로 잡고, 추가 추론이 품질을 높일 구체적 실패 위험을 한 줄 이유에 적을 수 있을 때만 `High` 이상을 추천한다. 추천 모델, 추론 수준, 울트라 사용 여부는 서로 독립적으로 판단한다.

For Codex plans, also include the recommended execution shape when useful: solo vs. subagents.
## Commit / Push

- Never auto-commit or auto-push.
- Never create or switch branches unless the user explicitly asks.
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

## Automations / Scheduling

- Interpret all user-requested automation, reminder, follow-up, monitor, and scheduled task times in the user's local timezone: `Asia/Seoul` (`KST`, `UTC+09:00`), unless the user explicitly specifies another timezone.
- Before creating or updating an automation, restate the exact scheduled time in absolute KST form, e.g. `2026-07-10 09:00 KST`.
- When converting to RRULE or any scheduler format, preserve the intended KST wall-clock time. Do not silently convert relative times using UTC or the model/session timezone.
- If the requested time is ambiguous, ask for clarification before creating or updating the automation.

## DB / Run / Verify

- Starting the server must not change the DB.
- Before DB-changing work, briefly explain the impact first.
- 브라우저로 개발 서버를 검증할 때는 관리자 계정 비밀번호 `0000`으로 로그인해 필요한 화면과 흐름을 자유롭게 검증한다. 이 자격 증명은 로컬 개발 서버 검증에만 사용한다.
- For setup, schema changes, migrations, or seed work:

```bash
cd backend
python bootstrap_db.py --all
```

- Run backend (canonical; auto-cleans zombie workers, uses `/health/live` for process ownership, and waits for `/health/ready`):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\start-backend.ps1
```

- Stop backend (uses the current repo profile: C:\ERP=8011, C:\ERP-dev=8010):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\stop-backend.ps1
```

- If the backend shows 0 log lines, suspect a zombie; run stop then start.

- Before commit/push, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode smart -ChangeSet staged
```

  기본 `-Mode smart -ChangeSet auto` 는 staged 변경이 있으면 staged만, 없으면 전체 작업 트리를 영향 분석 대상으로 선택합니다. 명시한 `-ChangeSet staged`는 staged 변경이 없어도 working tree로 fallback하지 않습니다. 게이트 명령은 현재 working tree에서 실행되므로 ignored 변경이 결과에 간접 영향을 줄 수 있으며, 정확한 staged 스냅샷 검증은 깨끗한 전용 worktree에서 실행합니다. `-Mode auto` 는 변경 영역의 전체 게이트를 실행하는 기존 호환 모드입니다. 인프라·검증 구조·미분류 경로는 자동으로 풀 게이트로 승격하며, 풀 게이트를 강제하려면 `-Mode full`, 영역을 직접 지정하려면 `-Mode frontend|backend|docs`를 사용합니다.

  구현 중에는 직접 관련 테스트만 반복합니다. 같은 세션에서 관련 영역 게이트가 이미 통과한 뒤 CI 실패를 재현·수정한 좁은 변경은 실패했던 테스트와 직접 영향받는 테스트만 다시 실행합니다. 인프라·검증 구조 변경, 아직 검증되지 않은 넓은 변경, 통합 경계 변경 또는 명시적 요청일 때만 `-Mode full`을 실행합니다. GitHub CI는 전체 테스트·커버리지·빌드·번들 검사를 계속 수행합니다.

## Shared AI Context and Session Handoff

At the start of a new session:

1. Read `_attic/ai/prompt_context.md` for the shared context order and current reference paths.
2. Check `_attic/handoff/active/` for the most recent relevant active handoff. `archive/` is historical and `deferred/` is read-only review material; never append new TODOs to either location.
3. Treat `_attic/ai/AI_HANDOVER.md` as historical archive material, not current context.

When work originates from an active TODO, update that document before committing: mark implemented headings complete with date and verification evidence, recalculate its dashboard counts, and verify the headings match the summary. Never leave an implemented active TODO open because the change is small or the session is ending.

Repository files above are the canonical shared context. Tool-private memory may supplement them but must not replace or override them.

## Resource Locations

Only files automatically referenced by tools remain at the root and in each folder. Everything else is consolidated into `_attic/`.

- Domain glossary and guides (GLOSSARY/CONTEXT/ARCHITECTURE/ERD/ADR/OPERATIONS/ITEM_CODE_RULES/ATTIC_POLICY): `_attic/docs/`
- One-off backend scripts (seed, sync, archive, backup): `_attic/backend-scripts/`
  - Run: `cd backend && python ../_attic/backend-scripts/<script>.py`
  - `sys.path` is patched to auto-include `backend/`
- Permanent runtime artifacts: `_attic/runtime/` (backups/logs/reports; local only, matched by `.gitignore`; not tracked)
- Tool-managed plans and specs: `docs/superpowers/` (the only active root `docs/` exception)
- Active app/tool exceptions: `backend/scripts/` and `backend/data/audit_csv/`; generated reports still go to `_attic/runtime/`.
- Local Obsidian metadata under ignored `vault/` paths may exist, but main tracks no active vault content.
- Legacy backups already under `backend/_backup/` stay in place but new operational backups are not written there.
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

## 5. Function-Level Craft (new & changed code)

Each function should do one thing and do it well. When writing or changing code, prefer:

1. **Pure where practical.** Take inputs as arguments, return results; don't mutate globals or shared state. Push side effects (DB, file, network) to the edges — a functional core with a thin I/O shell.
2. **Type hints + intent docstrings.** Annotate every parameter and return. Docstrings explain *why* / the contract / the gotchas — not a restatement of the code (a stale docstring that lies is worse than none).
3. **Business logic separated from I/O.** Keep pure validation/computation distinct from the code that reads Excel/DB/HTTP — but extract only when there's a real second consumer, not a speculative one.
4. **Granular exceptions + no resource leaks.** Catch what you can meaningfully handle and let the rest propagate to one boundary; don't wrap everything in try/except (silent failure is worse than a crash). Always close connections/files with `with`/`finally`, or a framework construct that guarantees it (e.g. FastAPI `Depends(get_db)`).
5. **Config/paths as top-level constants** (UPPERCASE) or externalized settings/env — not buried in function bodies. Don't hoist single-use local literals just to obey the letter of this.

**Scope guardrail (overrides a naive reading of the five above):** apply these to code you are adding or changing. Do NOT retrofit them into already-clean code or one-off/dead scripts just to "improve" them — that violates #2 Simplicity First and #3 Surgical Changes. These are directions for writing well, not a checklist to force onto working code.

---

These guidelines are working if there are fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
