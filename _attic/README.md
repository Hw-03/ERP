# _attic/

`_attic/` is the repository's archive area for files that are not required for
app runtime or the current development verification flow.

Keep runtime files out of this folder. In particular:

- `backend/erp.db` stays in `backend/`.
- `backend/data/audit_csv/` stays in `backend/data/`.
- Development baselines stay in `_dev/baselines/`.

## Current Split

- `_attic/data/`: raw spreadsheets, extracted image sources, old DB snapshots.
- `_attic/docs/`: old plans, reviews, presentations, regression screenshots.
- `_attic/ai/`: AI handoff and progress notes that are not active runtime inputs.
- `_attic/vault/`: local/personal vault material.

## Development Baselines

`openapi.json` is not stored here anymore because CI and local verification use
it while development is still active.

Current location:

```text
_dev/baselines/openapi.json
```

If the API schema intentionally changes, regenerate that baseline and commit the
updated file with the code change.
