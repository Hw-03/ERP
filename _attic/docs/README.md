# Docs Index

This folder now mixes two kinds of material:

- current reference docs that still describe the live repository, and
- archived plans, reviews, and research kept for historical context.

## Start Here

- [Root README](../../README.md): project entry point and startup guide.
- [AI Context](../ai/prompt_context.md): shared Claude Code/Codex context entry point.
- [Repo Layout](REPO_LAYOUT.md): current live paths, moved files, and archive boundaries.
- [Context](CONTEXT.md): business/domain overview.
- [Glossary](GLOSSARY.md): shared terms and process vocabulary.
- [Item Code Rules](ITEM_CODE_RULES.md): current item-code rules. Assembly F
  type is `AF`; `BF` is deprecated and must not be reintroduced.
- [Operations](OPERATIONS.md): operator/runtime procedures.
- [ERD](ERD.md): maintained database relationship reference; model declarations in
  `backend/app/models/` remain the schema source of truth.
- [User Guide](USER_GUIDE.md): current `/mes` desktop navigation and common work flows.

## Historical Notes

- [AI Handover](../ai/AI_HANDOVER.md): older Claude/Codex handoff notes. Treat
  this as archive context, not the current AI entry point.
- [Codex Progress](CODEX_PROGRESS.md): preserved implementation/progress
  snapshot. Do not use it as the current task status.
- [Architecture](ARCHITECTURE.md): stale architecture snapshot. Use
  [Context](CONTEXT.md), [Operations](OPERATIONS.md), and live code for current facts.
- [Mobile redesign plan](MOBILE_REDESIGN.md) and
  [mobile design system](mobile-design-system.md): historical mobile planning/design
  notes. Current mobile components live under `frontend/app/mes/_components/mobile/`.
- [Rendered ERD snapshot](ERD.html): stale HTML rendering; use [ERD.md](ERD.md).
- `operations/CONCURRENT_LOCAL_OPERATION.md`,
  `operations/DAILY_OPERATION_CHECKLIST.md`,
  `operations/INCIDENT_RESPONSE.md`, and
  `operations/POSTGRES_LOCAL_SERVER_RUNBOOK.md`: preserved historical operation
  notes. Use [Operations](OPERATIONS.md) for the current procedure.
- `operations/INVENTORY_CUTOVER_RUNBOOK.md`: preserved cutover runbook; consult it
  only for a deliberately approved inventory cutover.
- `research/`, one-off plans, review notes, and prototypes remain here for
  reference only unless a file explicitly says it is current.

## Current Repo Facts

- Root `docs/` has no general documentation tree. `docs/superpowers/` is the
  active exception for tool-managed plans and design documents.
- There is no active `vault/` folder.
- `schema.sql` lives at `backend/schema.sql`.
- Docker compose files live under `docker/`.
