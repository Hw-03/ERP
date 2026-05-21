---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/README.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# README.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/README.md]]

## 원본 첫 줄 (또는 메타)

```
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

```
