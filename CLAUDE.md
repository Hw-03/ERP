# CLAUDE.md

## Last Updated
2026-05-02 (Round-10A 완료, 안정성 ~96/100)

## Recent Phases
- Phase 5.x — N+1 제거, 에러 표준화, 운영 boot
- Round 3-9 — frontend feature/lib/api/lib/mes 분리
- Round-10A — parseError 통합, types 정본 flip, LEGACY_COLORS 본문 이전, useWarehouseDraft 추출, CI coverage/cache/openapi, wrapper 직접 import, 문서
- Round-10B (예정) — 거대 컴포넌트 5종 분해 (회사 PC 시각 회귀)

## Goal
MES 프로토타입 — 자재·재고·입출고·창고 승인·부서 재고·BOM·생산 실행 흐름 관리 시스템.

## System Name
- 시스템 공식 명칭: **DEXCOWIN MES** (ERP 아님, X-Ray 아님)
- 화면 표기·문서 작성 시 ERP → MES 통일

## Reporting
- 주간보고: `docs/주간보고.md` — 제목 날짜 범위, 진행 사항, 추후 예정 교체
- 개발현황 엑셀 재생성: `python scripts/dev/generate_devlog.py` → `data/개발현황.xlsx`

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

### 검증 (commit 전 필수)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1
```
5게이트(pytest / lint:strict / tsc / vitest+coverage / build) + OpenAPI drift 검사. CI 와 동일 기준.