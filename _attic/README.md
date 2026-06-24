# `_attic/`

`_attic/` is the repository's archive and reference area for material that is
not part of the runtime app tree.

Keep runtime files out of this folder. In particular:

- `backend/mes.db` stays in `backend/`.
- `backend/schema.sql` stays in `backend/`.
- `docker/docker-compose.yml` and `docker/docker-compose.nas.yml` stay in `docker/`.
- Development baselines stay in `_dev/baselines/`.

## Current Split

- `_attic/docs/`: current reference docs plus archived plans, reviews, research,
  and prototypes.
- `_attic/ai/`: historical AI handoff notes. Treat these as archive unless a
  file explicitly says otherwise.
- `_attic/data/`: raw spreadsheets, extracted image sources, and old DB
  snapshots.

There is no active `vault/` folder in the current repository layout.

## Where To Look First

- Root `README.md`: project entry point and startup guide.
- `_attic/docs/README.md`: docs index.
- `_attic/docs/REPO_LAYOUT.md`: current live paths, moved files, and archive boundaries.

## Development Baselines

`openapi.json` is not stored here anymore because CI and local verification use
it while development is still active.

Current location:

```text
_dev/baselines/openapi.json
```

If the API schema intentionally changes, regenerate that baseline and commit the
updated file with the code change.
