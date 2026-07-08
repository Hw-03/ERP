---
name: efficient-verification
description: Choose the right verification scope for DEXCOWIN MES work without wasting time. Use before running tests, browser verification, verify_local, CI-fix checks, commit/push checks, or whenever broad validation might be slow; especially when a user asks to avoid inefficient repeated tests while still requiring reliable results.
---

# Efficient Verification

## Goal

Verify the real risk without turning every iteration into a full CI run. Use targeted checks while developing, then run the required full gate only when the work is ready to claim complete, commit, or push.

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
   - Run the full gate once near the end, or when the user explicitly asks for it.

4. When a full gate fails late, isolate the failing gate.
   - If lint/type/tests/build passed and only the final independent check failed, fix that check and rerun the failed command first.
   - Only rerun the full command when you need to claim the full command now passes.

5. Before completion, commit, push, or PR, use `verification-before-completion`.
   - If the user or plan explicitly requires `verify_local`, run the full required command and read the final exit code.
   - If you intentionally use partial verification, say exactly which gate was not rerun.

## Project Commands

Use these defaults in `C:\ERP`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode auto
```

Use a narrower mode when the changed area is known:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode frontend
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode backend
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode docs
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
