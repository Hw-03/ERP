# AI Handover

이 문서는 Claude/Codex가 같은 ERP 프로젝트를 이어서 작업할 때 보는 최신 인수인계 문서다.

## 현재 상태 (2026-04-25)

- 프로젝트: DEXCOWIN 재고 관리/ERP 시스템 (내부 ERP/MES 프로토타입)
- 백엔드: FastAPI + SQLAlchemy + SQLite (`backend/erp.db`) — **이번 단계 미변경**
- 프론트엔드: Next.js 14 + Tailwind CSS — 데스크톱 셸 마감 중심으로 다듬음
- 주 화면: `/legacy` (대시보드 / 입출고 / 입출고 내역 / 관리자)
- 기준 데이터: 통합 품목 971건
- 현재 브랜치: `feat/erp-overhaul`

## 반드시 지킬 기준

- 품목코드 기준 문서: `docs/ITEM_CODE_RULES.md`
- 조립 F 타입은 `AF`. `BF` 는 사용하지 않는다.
- 부서 필터는 `process_type_code` 또는 백엔드 `department` 기준.
- "전체" 와 "모든 부서/모델 개별 선택" 은 같은 결과여야 한다.
- 입출고 wizard 5단계 흐름 / `selectedItems: Map` / `submit`·`dispatchSingleItem` 본체 / API 스펙 / DB 스키마 모두 보존한다.

## 이번 brunch (`feat/erp-overhaul`) 결과

### 구현됨

1. **공용 UI 부품 6종** — `frontend/app/legacy/_components/common/`
   - `EmptyState.tsx` — no-data / no-search-result / filtered-out 3변형
   - `LoadFailureCard.tsx` — 빨강 띠 + 새로고침 CTA
   - `LoadingSkeleton.tsx` — table / card / list 3변형 (animate-pulse)
   - `StatusPill.tsx` — info/success/warning/danger/neutral 톤 + `inferToneFromStatus()`
   - `ConfirmModal.tsx` — normal/caution/danger 톤. busy 중 ESC/배경 클릭 잠금
   - `ResultModal.tsx` — success/partial/fail 3종. 실패 리스트 + primaryAction
2. **입출고 UX 마감** (`DesktopWarehouseView.tsx` + `_warehouse_steps.tsx` + `SelectedItemsPanel.tsx`)
   - 필터 적용으로 선택 품목이 가려지면 노란 안내 + "필터 해제" 버튼
   - 출고 시 실행 후 재고가 음수인 행 빨강 강조 + "재고 부족" 라벨
   - blockerText에 "출고 후 재고가 음수입니다 — 수량을 다시 확인하세요" 추가
   - 메모 200자 권장 카운터 (200 초과 시 빨강)
   - submit 중 confirm 모달 ESC/배경 잠금(공용 부품 내장)
   - 인라인 loadFailure / resultModal / confirm 모달 모두 공용 부품으로 치환
3. **Inventory / History / Admin / Topbar 시각 언어 통일**
   - DesktopInventoryView: error → LoadFailureCard, 빈 상태 → EmptyState (필터 초기화 CTA 포함)
   - DesktopHistoryView: 거래 없음 / 거래 이력 없음 → EmptyState
   - DesktopAdminView: BOM 빈 상태 2곳 → EmptyState (위험 영역 코드 미변경)
   - DesktopTopbar: 인라인 status pill / 재고 경고 pill 모두 StatusPill 부품 사용
4. **운영 스크립트** — `scripts/backup_db.bat`, `scripts/healthcheck.bat`
5. **문서 신설/갱신**
   - 신규: `docs/USER_GUIDE.md`, `docs/OPERATIONS.md`, `docs/ARCHITECTURE.md`
   - 신규(보류 설계서): `docs/BACKEND_REFACTOR_PLAN.md`, `docs/FRONTEND_HOOKS_PLAN.md`
   - 갱신: `README.md`, `docs/AI_HANDOVER.md`, `docs/CODEX_PROGRESS.md`

### 변경 없음 (의도적)

- 백엔드 모든 파일
- `frontend/lib/api.ts`
- `start.bat`, `docker-compose.yml`
- `backend/erp.db`, 루트 `erp.db`
- `backend/seed*.py`, `bootstrap_db.py` 등 운영 보조 스크립트의 위치

### 검증

- `cd frontend && npx tsc --noEmit` — 통과
- `cd frontend && npm run lint` — No ESLint warnings or errors
- `cd frontend && npm run build` — 통과 (13/13 정적 페이지 생성)
- `python -m compileall backend` — 통과

## 다음 작업 후보 (보류 설계 → 다음 단계 구현)

`docs/BACKEND_REFACTOR_PLAN.md`, `docs/FRONTEND_HOOKS_PLAN.md` 참고.

- 백엔드: commit/refresh 표준화, 에러 detail 표준화, ship-package N+1, export 헬퍼, 운영 파일 위생
- 프론트: `useWarehouseWizardState`/`useWarehouseSubmit`/`useWarehouseFilters` hook 추출, View 섹션 분할, `useResource` 데이터 페칭 헬퍼
- 운영: docker-compose 포트 정렬, 루트 `erp.db` 정리, seed 스크립트 위치 정리

이 항목들은 본 brunch 에서 **명시적으로 보류**되었으며 다음 단계에서 별도 사이클로 진행하기로 한 결정.

## 검증 명령

```bash
python -m compileall backend
cd frontend
npm run lint
npx tsc --noEmit
npm run build
```

## 협업 규칙

- 코드 파일을 수정할 때는 `git diff` 로 현재 변경을 먼저 확인한다.
- `_archive/`, `_backup/`, `frontend/_archive/` 는 보관용 — 일반 작업 대상 아님.
- 보안/PIN/권한·CI·테스트는 별도 사이클에서 진행한다(이번 단계 범위 외).
