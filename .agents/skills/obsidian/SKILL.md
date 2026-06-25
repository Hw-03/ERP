---
name: obsidian
description: Use when synchronizing or rebuilding the DEXCOWIN MES Obsidian vault on the vault-sync branch after main has accumulated changes. Reviews the real ERP project code at the current repository root, preserves valuable existing vault explanations, regenerates vault/ERP as a folder-based mirror excluding the vault folder itself, and keeps only five guide documents under vault/guides. Do not use for generic Obsidian note-taking.
---

# Rebuild ERP Obsidian Vault

## Mission

Rebuild or refresh the Obsidian vault for the DEXCOWIN MES project.

The final vault must help a non-developer owner and future AI agents understand the real project by browsing a folder-based mirror of the current repository root.

The vault is not the product. The product is the code in the current repository root.

## Non-Negotiable Rules

1. `main` must stay vault-free.
2. `vault-sync` is the only branch that contains `vault/`.
3. In the Obsidian mirror, do not mirror `<repo root>\vault` into `vault/ERP/vault`.
4. `vault/ERP/` must represent the current repository root with only the `vault/` folder excluded.
5. Do not invent category folders inside `vault/ERP/` that do not exist in the real project.
6. Reading-help documents may exist only under `vault/guides/`.
7. Code is the source of truth. If old notes disagree with live code, trust code.
8. Preserve valuable existing explanations only after checking them against live code.
9. Do not include low-value cache/build/dependency internals as individual file notes.
10. Before finishing, verify code diff against `origin/main` is empty outside `vault/`.

## Final Target Structure

```text
vault/
├─ ERP/
│  ├─ 📁_ERP.md
│  ├─ backend/
│  ├─ frontend/
│  ├─ docs/
│  ├─ scripts/
│  ├─ data/
│  ├─ docker/
│  ├─ .github/
│  ├─ _attic/
│  ├─ _dev/
│  ├─ .claude/
│  ├─ 📁_.git.md        ← proxy note only, no actual .git/ folder
│  ├─ .pytest_cache/
│  ├─ .vscode/
│  └─ ...
└─ guides/
   ├─ 처음_읽는_사람.md
   ├─ 전체_컨텍스트.md
   ├─ 위험지대_지도.md
   ├─ 볼트_갱신_작업요령.md
   └─ 용어사전.md
```

## Core Mental Model

`vault/ERP/` is a readable mirror of the real project.

`vault/guides/` is not the project. It is the reading manual for the vault.

The user wants the Obsidian experience to feel like:

> "I opened the project folder inside Obsidian, and every folder has a helpful signboard."

## Start Procedure

1. Detect the repository root. All subsequent paths are relative to this:
   ```powershell
   $RepoRoot = git rev-parse --show-toplevel
   Set-Location $RepoRoot
   ```
   Examples in this skill may mention `C:\ERP`, but that is only the user's usual office path. At home or on another machine the path may be different. Always use `$RepoRoot`.

2. Check working tree is clean:
   ```powershell
   git status --short
   ```

   **Path A — clean working tree**: proceed directly.
   ```powershell
   git fetch origin main vault-sync
   git checkout vault-sync
   git pull --ff-only origin vault-sync
   ```

   **Path B — uncommitted changes exist**: create a separate worktree and do all vault work there.
   ```powershell
   git fetch origin main vault-sync
   $Parent = Split-Path $RepoRoot -Parent
   $WorktreePath = Join-Path $Parent "ERP-vault-sync"
   if (Test-Path $WorktreePath) {
     Write-Host "Worktree path already exists: $WorktreePath"
     Write-Host "Reuse it (Set-Location) or remove it first (git worktree remove)."
     exit 1
   }
   git worktree add $WorktreePath vault-sync
   Set-Location $WorktreePath
   # continue from step 3 inside the worktree
   ```

3. Before merging main, save a backup ref and count existing vault files:
   ```powershell
   git rev-parse HEAD | Out-File -Encoding utf8 $env:TEMP\vault_sync_backup_ref.txt
   $vaultCountBefore = (git ls-files vault/ | Measure-Object).Count
   ```

4. Merge main:
   ```powershell
   git merge origin/main --no-ff -m "Merge main into vault-sync (vault/ 보존)"
   ```

5. After merge, verify vault files were not lost:
   ```powershell
   $vaultCountAfter = (git ls-files vault/ | Measure-Object).Count
   $vaultCountAfter   # must be >= $vaultCountBefore
   git diff --exit-code origin/main HEAD -- ':!vault/'
   ```
   If vault file count dropped or the code diff is non-empty, stop and restore:
   ```powershell
   git checkout ORIG_HEAD -- vault/
   ```
   Then resolve before continuing.

## Review Phase

Before generating notes, inspect the real code. Do not trust the old vault blindly.

Review at least:

- root files: `README.md`, `CLAUDE.md`, `ONBOARDING.md`, `start.bat`, `.gitignore`, `.gitattributes`, `.mcp.json`
- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/routers/`
- `backend/app/services/`
- `frontend/app/page.tsx`
- `frontend/app/legacy/`
- `frontend/lib/api.ts`
- `frontend/lib/api/`
- `frontend/lib/mes/`
- `frontend/lib/ui/`
- `docs/`
- `scripts/dev/`
- `scripts/ops/`
- `scripts/migrations/`
- `data/`
- `.github/workflows/`

Use `rg`, `git ls-files`, and targeted file reads. The goal is not to memorize every line; the goal is to produce accurate folder/file explanations.

## Existing Vault Preservation Rules

Preserve from old vault when it is:

- accurate against current code
- written in plain language useful to a non-developer
- explaining business flow
- explaining risk
- explaining why a folder/file exists
- linking important related files
- useful for handoff

Discard or rewrite when it is:

- stale
- based on old folder structure
- only mechanically generated
- a cache/build artifact note
- duplicated without adding understanding
- inconsistent with code
- too developer-heavy for the user

Good old guides may be absorbed into the five `guides/` files or into `📁_folder.md` files.

## Folder Note Rule

Every mirrored folder should have a folder note:

```text
📁_foldername.md
```

For hidden or special folders:

```text
📁_.git.md
📁_.github.md
📁__attic.md
```

Each folder note must explain:

1. What this folder is
2. When a person should look here
3. Important child folders
4. Important files
5. What not to touch casually
6. Related notes/files

Tone: mixed.

- First explain simply for the user.
- Then give enough technical detail for a developer or AI agent.

Folder note template:

```md
# 📁 foldername

## 이 폴더는 뭐예요?

Plain Korean explanation.

## 언제 여기를 보나요?

- Situation 1
- Situation 2

## 주요 하위 폴더

- `child/` — explanation

## 주요 파일

- `file.ext` — explanation

## 건드릴 때 조심할 점

- risk

## 관련 파일

### 먼저 볼 파일
- [[ERP/path/to/file.ext]] — why

> [!info]- 더 연결된 파일
> - [[ERP/path/to/another.ext]]
```

## File Note Rule

Create individual file notes for files a person may reasonably inspect.

Examples to include:

- `.py`
- `.ts`
- `.tsx`
- `.js`
- `.mjs`
- `.json` when project-owned
- `.md`
- `.yml`, `.yaml`
- `.bat`, `.ps1`
- `.csv`
- `.xlsx` as metadata notes
- design HTML/CSS/assets as metadata or excerpts
- config files

Do not create individual notes for low-value internals such as:

- `.git` internals
- `node_modules` internals
- `.next` internals
- `.next-prod` internals
- `.pytest_cache` internals
- `__pycache__`
- `.pyc`
- coverage output
- build/dist output
- generated binary caches

For those folders, create only the folder note and explain:

- what creates it
- why it exists
- why people normally do not open it
- when it matters

## File Note Format

File notes should use summary + key excerpt.

```md
# file.ext

## 이 파일은 뭐예요?

Plain Korean explanation.

## 언제 보나요?

- Situation

## 중요한 내용

- Key point 1
- Key point 2

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/path/file]] — reason

> [!info]- 더 연결된 파일
> - [[ERP/path/other]]

## 조심할 점

Only include if meaningful.

## 핵심 발췌

\`\`\`language
short excerpt
\`\`\`
```

Do not paste huge files in full. Use short excerpts that explain structure.

## Related File Links

For each important file note:

- Show about 5 "먼저 볼 파일"
- Put extra links in a collapsed callout:
  ```md
  > [!info]- 더 연결된 파일
  > - [[ERP/...]]
  ```

Prefer links that follow real code flow:

```text
screen component
→ hook/state
→ frontend API client
→ backend router
→ backend service
→ model/schema
→ tests/docs
```

## Risk Marking

Do not add risk labels everywhere.

Add risk sections only for important folders/files.

High-risk examples:

- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/services/inventory.py`
- `backend/app/services/stock_requests.py`
- `backend/app/services/stock_math.py`
- `backend/app/routers/stock_requests.py`
- `backend/app/routers/settings.py`
- `backend/app/routers/inventory/*`
- `frontend/lib/api-core.ts`
- stock request UI flows
- admin danger/reset areas
- migration scripts
- backup/restore scripts

Risk format:

```md
## 위험도

🔴 높음

이 파일은 실제 재고 수량, DB 구조, 승인 상태, 감사 로그 중 하나에 영향을 줄 수 있습니다.
수정 전에는 관련 호출 흐름과 테스트를 확인하세요.
```

## The Five Guides

Only these guide files should exist under `vault/guides/`:

1. `처음_읽는_사람.md`
2. `전체_컨텍스트.md`
3. `위험지대_지도.md`
4. `볼트_갱신_작업요령.md`
5. `용어사전.md`

### 처음_읽는_사람.md

Purpose: show how to enter the vault.

Must explain:

- `ERP/` is the project mirror
- `guides/` is reading help
- start with `ERP/📁_ERP.md`
- then read `전체_컨텍스트`, `위험지대_지도`, `용어사전`
- code is truth

### 전체_컨텍스트.md

Purpose: compress the whole project.

Must include:

- what DEXCOWIN MES is
- branch policy
- project folder map
- backend overview
- frontend overview
- inventory / request / BOM / defect / audit concepts
- main workflows as collapsed sections
- what changed recently if known
- how to navigate from business question to code

Absorb old scenario notes here as collapsed sections:

```md
> [!example]- 재고 입출고 흐름
> ...
```

### 위험지대_지도.md

Purpose: warn where mistakes matter.

Must include:

- inventory math
- stock request state machine
- audit logs
- DB schema
- settings/admin reset
- migrations
- backup/restore
- live frontend `legacy` path
- `_attic` caution

### 볼트_갱신_작업요령.md

Purpose: future main-to-vault-sync refresh.

Must include:

- branch policy
- fetch/merge steps
- vault preservation
- code diff check
- how to review changed files
- how to preserve old notes
- how to regenerate
- staging with `git add -f`
- completion report format

### 용어사전.md

Purpose: medium-depth glossary.

For each term include:

- meaning
- old/current names if any
- where it appears
- related files

Terms should include at least:

- DEXCOWIN MES
- ERP legacy name
- ItemCode / erp_code
- warehouse / production / defective
- 사용 가능 재고
- 승인 대기 수량
- StockRequest
- TransactionLog
- AdminAuditLog
- BOM
- Backflush
- PIN
- legacy folder
- vault-sync
- _attic

## Special Folder Handling

### `vault/`

Do not mirror it under `ERP/`.

### `.git/`

Do NOT create an actual `vault/ERP/.git/` directory — Git treats `.git` as a special internal folder and pushing real content inside it causes repository corruption.

Instead, create a proxy note at the ERP level:

```text
vault/ERP/📁_.git.md
```

Explain that `.git/` is Git's internal storage, that it is not normally opened, and that its real location is `<repo root>\.git\`.

### `.pytest_cache/`, `__pycache__`, `.next`, `node_modules`, coverage/build outputs

Create folder notes only. Do not generate file notes inside.

### `_attic/`

Show it, but treat it as archive.

- Create folder notes for major subfolders.
- Preserve only valuable old explanations.
- Do not make it feel like current live code.
- Mark clearly: "보관소, 함부로 수정하지 말 것."

### `.claude`, `.vscode`, `.dev`, `playwright-mcp`

Show as project/tooling folders.

Use folder notes to explain:

- what tool uses it
- whether a normal user should open it
- whether it is committed or local-only

## Generation Strategy

Use an efficient, safe approach:

1. Create a full inventory of real project files, excluding `<repo root>\vault`.
2. Classify folders:
   - normal project folder
   - source code folder
   - docs/data folder
   - tooling folder
   - archive folder
   - cache/build/dependency folder
3. Read existing vault notes for candidate reusable content.
4. Read real code before trusting old notes.
5. **Generate into a draft path first**: write all new notes under `vault/_draft_ERP/` and `vault/_draft_guides/`. Do not touch `vault/ERP/` or `vault/guides/` yet.
6. Validate the draft structure (see Validation below).
7. Only after validation passes: confirm draft exists and paths are correct before deleting:
   ```powershell
   Test-Path vault\_draft_ERP    # must be True — abort if False
   Test-Path vault\_draft_guides # must be True — abort if False
   Resolve-Path vault\ERP     # must resolve inside the current repo's vault\ERP
   Resolve-Path vault\guides  # must resolve inside the current repo's vault\guides
   ```
   Then remove old structure and replace with draft:
   ```powershell
   Remove-Item -Recurse -Force vault\ERP, vault\guides
   Rename-Item vault\_draft_ERP   vault\ERP
   Rename-Item vault\_draft_guides vault\guides
   ```
8. Stage intended new vault files:
   ```powershell
   git add -f vault/ERP vault/guides
   ```
9. Report.

## Validation

Run these checks before final response:

```powershell
git diff --exit-code origin/main HEAD -- ':!vault/'
```

Must be empty.

Confirm expected structure:

```powershell
Test-Path vault\ERP\📁_ERP.md
Test-Path vault\guides\처음_읽는_사람.md
Test-Path vault\guides\전체_컨텍스트.md
Test-Path vault\guides\위험지대_지도.md
Test-Path vault\guides\볼트_갱신_작업요령.md
Test-Path vault\guides\용어사전.md
```

Confirm no mirrored project vault:

```powershell
Test-Path vault\ERP\vault
```

Expected result: `False`.

Check whether any intended vault files are being silently suppressed by `.gitignore`:

```powershell
git ls-files --others --ignored --exclude-standard vault/
```

Do not blindly add everything this lists — some ignored files inside `vault/` (e.g. `.obsidian/workspace.json`) are intentionally excluded. Only add the intended new notes:

```powershell
git add -f vault/ERP vault/guides
```

Re-run the check and confirm only unintended files remain in the ignored list before committing.

Also verify no code files are mixed into the staged commit:

```powershell
git diff --cached --name-only -- ':!vault/**'
```

Expected result: empty. If any non-vault file appears, stop and investigate before committing.

## Completion Report

Report in Korean:

```text
브랜치:
기준 main:
vault-sync 커밋:
생성/갱신한 구조:
보존한 기존 내용:
폐기한 기존 내용:
캐시/산출물 처리:
guides 5개 확인:
vault/ERP/vault 제외 확인:
origin/main 대비 코드 diff:
검증 결과:
주의할 점:
push 여부:
```

## Final Principle

This is not a simple documentation sync.

It is a rebuild of the reading experience.

The final vault should make the project feel like a browsable, explained version of the current repository root, with every meaningful folder carrying a human-readable signboard.
