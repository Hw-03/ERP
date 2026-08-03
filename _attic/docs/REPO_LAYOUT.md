# Repo Layout

This note records the current live file layout after the repo cleanup and file
moves.

## Current Live Paths

- Root guide: `README.md`
- Active reference docs: `_attic/docs/`
- Tool-managed plans and specs: `docs/superpowers/`
- Shared AI context entry point: `_attic/ai/prompt_context.md`
- Active task handoffs: `_attic/handoff/`
- Historical AI snapshot: `_attic/ai/AI_HANDOVER.md`
- Backend schema: `backend/schema.sql`
- Backend database: `backend/mes.db`
- Docker compose files:
  - `docker/docker-compose.yml`
  - `docker/docker-compose.nas.yml`

## Current Reference Docs

Use these first when you need the current rules or structure:

- `_attic/docs/CONTEXT.md`
- `_attic/docs/GLOSSARY.md`
- `_attic/docs/ITEM_CODE_RULES.md`
- `_attic/docs/CODEX_PROGRESS.md`
- `_attic/docs/OPERATIONS.md`

## Archive Boundaries

- The only active root `docs/` content is tool-managed material under
  `docs/superpowers/plans/` and `docs/superpowers/specs/`. All other docs
  belong under `_attic/docs/`.
- There is no tracked active `vault/` content. Ignored local `.obsidian`
  settings may exist for the Obsidian workflow or the `vault-sync` branch.
- `backend/scripts/` contains active maintenance and analysis tools used by
  tests. Generated reports from those tools belong under `_attic/runtime/`.
- `backend/data/audit_csv/` is an active application data path used by the
  audit CSV service and is not a general document or report directory.
- `_attic/ai/AI_HANDOVER.md` is archive-only historical context; use
  `_attic/ai/prompt_context.md` for the current AI entry point.
- `research/`, one-off plans, and prototype files under `_attic/docs/` are
  historical reference unless they explicitly say they are current.

## Path Drift Mapping

Older notes may still mention these paths:

- `schema.sql` -> `backend/schema.sql`
- `docker-compose.yml` -> `docker/docker-compose.yml`
- `docker-compose.nas.yml` -> `docker/docker-compose.nas.yml`
- General `docs/...` -> `_attic/docs/...`
- Tool-managed plans/specs -> `docs/superpowers/...`
- `vault/...` -> archive-only historical reference

## Item-Code Rule Reminder

The current process code set is the 18-code system documented in
`_attic/docs/ITEM_CODE_RULES.md`.

Assembly uses `AR/AA/AF`.

Do not reintroduce `BF` as a current assembly F code.
