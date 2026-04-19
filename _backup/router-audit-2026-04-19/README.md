# Router Audit Backup

Date: 2026-04-19

## Frontend candidates copied here
- `BarcodeScannerModal.tsx`
  - No import/reference found from active frontend route tree.
- `CategoryCard.tsx`
  - No import/reference found from active frontend route tree.
- `UKAlert.tsx`
  - No import/reference found from active frontend route tree.

## Backend router audit
- No unmounted router file was found under `backend/app/routers`.
- `backend/app/main.py` currently includes all router modules except `__init__.py`.

## Why different UI versions appear
- `frontend/app/page.tsx` routes to the legacy entry.
- `frontend/legacy/page.tsx` renders both mobile and desktop branches in one page.
- Mobile branch: wrapped with `lg:hidden`.
- Desktop branch: `DesktopLegacyShell`, wrapped with `hidden lg:block`.
- So the visible UI changes with viewport width / responsive breakpoint, not because a different frontend project is being launched.
