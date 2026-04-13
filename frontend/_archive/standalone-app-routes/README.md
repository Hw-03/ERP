## Standalone App Routes Archive

These routes were earlier standalone Next.js pages for:
- `admin`
- `bom`
- `history`
- `inventory`
- `operations`

They are no longer the primary frontend.

The active primary frontend is now the legacy shell mounted from:
- `frontend/app/page.tsx`
- `frontend/app/legacy/page.tsx`

The archived routes are kept for reference only and are excluded from TypeScript checks by `frontend/tsconfig.json`.
