# Repo Layout

This note records the current live file layout after the repo cleanup and file
moves.

## Current Live Paths

- Root guide: `README.md`
- Active reference docs: `_attic/docs/`
- Historical AI notes: `_attic/ai/`
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

- There is no active root `docs/` folder.
- There is no active `vault/` folder.
- `_attic/ai/AI_HANDOVER.md` is archive-only handoff context.
- `research/`, one-off plans, and prototype files under `_attic/docs/` are
  historical reference unless they explicitly say they are current.

## Path Drift Mapping

Older notes may still mention these paths:

- `schema.sql` -> `backend/schema.sql`
- `docker-compose.yml` -> `docker/docker-compose.yml`
- `docker-compose.nas.yml` -> `docker/docker-compose.nas.yml`
- `docs/...` -> `_attic/docs/...`
- `vault/...` -> archive-only historical reference

## Item-Code Rule Reminder

The current process code set is the 18-code system documented in
`_attic/docs/ITEM_CODE_RULES.md`.

Assembly uses `AR/AA/AF`.

Do not reintroduce `BF` as a current assembly F code.
