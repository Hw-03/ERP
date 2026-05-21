## Archive

This folder keeps reference assets and files that are not part of the active app/runtime path.

Current contents:
- `reference/files.zip`: original UI reference bundle kept for design comparison only.

Rules:
- Do not import from this folder in production code without reviewing ownership first.
- Prefer moving old snapshots here instead of deleting them when they may still be useful for comparison.
