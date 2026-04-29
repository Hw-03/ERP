# CLAUDE.md

## Goal
MES 프로토타입 — 자재·재고·입출고·창고 승인·부서 재고·BOM·생산 실행 흐름 관리 시스템.

## Paths
- backend: `backend/`
- frontend: `frontend/`
- backend entry: `backend/app/main.py`
- before editing frontend, verify real render/import path first

## Root
- `data/` source/output
- `scripts/` utils
- `docs/` docs
- `.dev/` dev tools
- `vault/` obsidian vault (only on `vault-sync`; not committed to `main`)
- `_archive/`, `_backup/` do not edit

## Core Rules
1. Self-drive when safe
2. Small edit / search / run / verify = no mid-confirm
3. Big change / destructive change = brief reason first
4. If ambiguous, choose safest option
5. Docs < actual live code path

## Do Not Edit
- `_archive/`
- `_backup/`
- `frontend/_archive/`

Only if user explicitly asks.

## Workflow
1. find files
2. verify active files
3. edit
4. run / verify
5. report

## Hard Warnings
- do not edit from route file only
- verify real component / import / API path first
- if docs != code, trust code
- do not mix sample data with real data
- no large refactor / folder move / rename unless asked

## Maintainability
- prevent file bloat
- if UI / state / API / helpers mix too much, prefer local helper/local component split
- do not spam new files
- do not fall back to giant single-file legacy
- preserve maintainability after redesign

## Branch Policy
- daytime confirmed work -> `main`
- night / experiment / overhaul / structural work -> feature branch
- avoid mixing `mobile` / `desktop` / `backend` / `docs` in one branch
- after work, report: merge-to-main? delete-branch?

## Branch Names
- `feat/...`
- `fix/...`
- `refactor/...`
- `docs/...`

Examples:
- `feat/mobile-ux-overhaul`
- `feat/backend-hardening`
- `fix/inventory-sync-bug`

## Commit Policy
- no auto commit
- no auto push
- commit only when user asks
- backup-point commit may be proposed before risky work
- avoid noisy micro-commits
- summarize change scope before commit

## Commit Message
Format:
`YYYY-MM-DD area: summary`

Areas:
`mobile`, `desktop`, `backend`, `admin`, `docs`, `fix`, `refactor`

Examples:
- `2026-04-24 mobile: refine inventory selection mode`
- `2026-04-24 backend: unify stock math`
- `2026-04-24 admin: add mobile admin hub`

Avoid vague messages:
- `test`
- `again`
- `update`

## Main Merge Policy
- feature branch -> merge to `main` only after run/review
- explain `merge` separately from `commit`
- if useful, also list branches safe to delete after merge

## Vault Branch Policy
- `main` is the runtime/deploy source branch and must stay vault-free.
- `vault-sync` keeps the same runtime progress as `main`, plus the `vault/` folder.
- `main` and `vault-sync` should differ only by the presence of `vault/`.
- When bringing `main` changes into `vault-sync`, do not apply any deletion/removal of `vault/`.
- Do not merge `vault-sync` directly into `main`.
- If runtime code from `vault-sync` must go to `main`, create a clean branch or cherry-pick excluding `vault/`.

## Response Style
- Korean
- conclusion first
- short, clear
- non-dev friendly
- prefer:
  - now done
  - not done
  - next 1 thing

## Report Format
- done
- changed files
- verification
- remaining issue
- next 1 thing

## Priority Files
- `README.md`
- `docs/AI_HANDOVER.md`
- `docs/CODEX_PROGRESS.md`
- `start.bat`
- `docker-compose.yml`
- `backend/app/main.py`
- `frontend/package.json`

## Run

### backend
```bash
cd backend
python -m uvicorn app.main:app --reload
```