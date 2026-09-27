---
name: efficient-verification
description: Choose the right verification scope for DEXCOWIN MES work without wasting time. Use before running tests, browser verification, verify_local, CI-fix checks, commit/push checks, or whenever broad validation might be slow; especially when a user asks to avoid inefficient repeated tests while still requiring reliable results.
---

# Efficient Verification

## Goal

Verify the real risk without turning every iteration into a full CI run. Choose checks from the current task's diff and reuse applicable results. Preview the staged smart plan before running a slow gate; its path-based escalation is a starting point for judgment.

This skill complements `verification-before-completion`; it does not replace it.

## Decision Tree

1. Identify changed areas first.
   - Run `git status --short` and inspect the diff scope.
   - Map changes to `frontend`, `backend`, `docs`, or infra scripts.

2. During implementation, prefer the smallest proof.
   - Frontend component change: run the relevant Vitest file(s).
   - Type/interface change: add `npm run lint:strict` or targeted type check if available.
   - Backend router/schema change: run the relevant pytest file(s).
   - Docs-only change: use docs verification only.
   - User-facing mobile/desktop flow: add browser verification for that flow after unit tests.

3. Do not loop full verification.
   - Avoid rerunning `verify_local.ps1 -Mode frontend` after every small edit.
   - If a targeted test fails, fix that failure and rerun only that test first.
   - Before commit or push, inspect the staged diff and reuse checks that still cover it. If verification is missing, preview the smart plan with `-Mode smart -ChangeSet staged -PlanOnly` before executing it.
   - A path under `scripts/`, a new test, an unknown path, or several changed files does not by itself justify full verification. Read the changed behavior and its consumers. For a localized operation script, prefer its safety/regression tests and relevant syntax or static checks; for layout changes, prefer the affected component tests and browser flow.
   - If the preview escalates broadly but targeted checks cover the actual risk, run those commands directly and record the reason. Do not run a full gate first merely to discover whether it was necessary.
   - Use a full gate for an explicit request, changes to gate selection/execution or shared test setup that undermine targeted evidence, or demonstrated broad integration risk. For DB or migration changes, verify the affected backend area; include frontend gates only when its contract or behavior is affected. If impact cannot be bounded after reading the diff and consumers, broaden verification and explain the unresolved risk.

4. When a full gate fails late, isolate the failing gate.
   - If lint/type/tests/build passed and only the final independent check failed, fix that check and rerun the failed command first.
   - Only rerun the full command when you need to claim the full command now passes.

5. Before completion, commit, push, or PR, use `verification-before-completion`.
   - Before commit or push, run `git diff --cached --check`. Execute only missing checks for the selected change and read their exit codes; use the smart runner when its preview matches the actual risk.
   - Gate commands read the working tree, even with staged impact planning. Account for ignored or unrelated changes when interpreting failures.
   - Before a full gate, state the specific changed behavior that needs broad evidence. Report which checks passed or were reused and any material remaining gap. Do not claim full-suite success from targeted checks.

## Project Commands

Preview the selected commit's verification plan in `C:\ERP`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode smart -ChangeSet staged -PlanOnly
```

Execute the smart plan when its scope matches the actual diff:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode smart -ChangeSet staged
```

Use legacy area-wide auto detection or a narrower explicit mode when needed:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode auto
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode frontend
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode backend
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode docs
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode full
```

For frontend iteration:

```powershell
cd frontend
npm test -- path/to/relevant.test.tsx
```

## Browser Verification

- Use the Codex in-app browser when the user says it is already open.
- Do not open Chrome unless the user asks for Chrome.
- Verify only the flows affected by the change.
- If you temporarily change viewport size, restore it before finishing.
- Report browser verification as user-facing behavior, not internal implementation detail.

## Communication Rules

- Tell the user the verification intent, not every internal metric.
- Say "the final verification gate" instead of raw byte math unless the user asks for exact numbers.
- If a gate is too tight for normal feature work, explain the policy decision briefly and adjust the threshold intentionally rather than repeatedly shaving code blindly.
- Keep progress updates short: what is running, why it matters, and whether it passed.

## Bundle-Size Gate

- Treat bundle-size failures as CI gate failures, not feature bugs.
- First try one small cleanup pass if new code obviously added unnecessary runtime strings or duplicate logic.
- If the app is already on the threshold and the overage is tiny, prefer an explicit small threshold bump with a clear reason over repeated low-value code contortions.
- After changing the gate, run the gate command and, if completion requires it, run the full required verification once.
