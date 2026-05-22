---
type: file-explanation
source_path: "_attic/ai/AI_HANDOVER.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# AI_HANDOVER.md — AI_HANDOVER.md 설명

## 이 파일은 무엇을 책임지나

`AI_HANDOVER.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AI Handover`
- `2026-05-08 — 루트 정리 (참조 변경)`
- `현재 상태 (2026-05-03 Round-17 update)`
- `Round 완료 갱신 체크리스트`
- `Round-13 ~ 17 결과 요약 (2026-05-02 ~ 2026-05-03)`
- `Round-13 — 거대 컴포넌트 250+ 19 → 1`
- `Round-14 — 구조 정리 (3 commit)`
- `Round-15 — 거대 컴포넌트 잔존 분해 (3 commit)`
- `Round-16 — 테스트 + 토큰 + CI (4 commit)`
- `Round-17 — 문서 (1 commit)`

## 연결되는 파일

- [[ERP/_attic/ai/📁_ai]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# AI Handover

이 문서는 Claude/Codex가 같은 MES 프로젝트를 이어서 작업할 때 보는 최신 인수인계 문서다.

## 2026-05-08 — 루트 정리 (참조 변경)

루트 가시 항목을 줄이기 위해 다음을 정리. **미래 AI 세션은 옛 경로 검색 시 다음 매핑으로 대체할 것.**

| 옛 경로 | 새 경로/상태 |
|---|---|
| `MES_MOBILE_CLAUDE_CODE_EXECUTION_PLAN.md` | **삭제** (모바일 작업 완료, commit `ee3c436`) |
| `deep-research-report.md` | `docs/research/2026-04-26-deep-research-report.md` |
| `backups/erp_before_*.db` | `data/db_backups/erp_before_*.db` |
| `verify_import_btn.png` | **삭제** (회귀 테스트 임시 산출물, gitignore 패턴) |
| 루트 `backups/` 폴더 | **제거** (DB 백업은 `data/db_backups/`로 단일화) |

`docker-compose.yml`은 항상 `docker/docker-compose.yml`(이동 없음, CLAUDE.md 참조 표기만 정확화).

정리 후 루트 가시 항목: 폴더 9개 (`_archive/`, `backend/`, `data/`, `docker/`, `docs/`, `frontend/`, `outputs/`, `scripts/`, `vault/`) + 파일 3개 (`CLAUDE.md`, `README.md`, `start.bat`).

## 현재 상태 (2026-05-03 Round-17 update)

- 프로젝트: DEXCOWIN 재고 관리 MES (경량 MES 프로토타입)
- 백엔드: FastAPI + SQLAlchemy + SQLite (`backend/erp.db`)
- 프론트엔드: Next.js 14 + Tailwind CSS
- 주 화면: `/legacy` (대시보드 / 입출고 / 입출고 내역 / 관리자)
- 기준 데이터: 통합 품목 971건
- 현재 브랜치: `main`
- 외부 객관 평가: 11 카테고리 평균 87.5 → ~95 추정 (Round-13 ~ Round-17 누적)

## Round 완료 갱신 체크리스트

각 Round 완료 후 본 섹션의 항목을 확인하고 본 문서를 갱신한다.

- [ ] `verify_local.ps1` 5+1 게이트 모두 통과 (pytest / lint:strict / tsc / vitest+coverage / build / bundle-size + OpenAPI drift)
- [ ] 250+ 라인 잔존 카운트 갱신 (현재 0 — DesktopWarehouseView 435줄로 250 미만)
- [ ] coverage 변동 기록 (현재 lib 평균 91.3%)
- [ ] 신규 sub-component / hook / 정본 모듈을 "정본 모듈" 섹션에 추가
- [ ] 문서 (본 파일 + `docs/CODEX_PROGRESS.md`) timeline 한 줄 추가
- [ ] commit 메시지 형식: `YYYY-MM-DD area: 요약 (Round-N #m)`
- [ ] main 직접 push 또는 feature branch 후 사용자 결정

## Round-13 ~ 17 결과 요약 (2026-05-02 ~ 2026-05-03)

### Round-13 — 거대 컴포넌트 250+ 19 → 1
17 commit, JSX 0 변경. sub-component / hook / inner-function 분리.
- DesktopWarehouseView 645→507 (4단계 분해)
- ItemsStep / HistoryDetailPanel / WarehouseQueuePanel / InventoryScreen mobile / BarcodeScannerModal / DraftCartPanel / InventoryDetailPanel / DesktopInventoryView (Phase 1)
- HistoryTable / BomComposeTab / StepItems warehouse / DeptWizardScreen / MyRequestsPanel / ItemDetailSheet / DesktopHistoryView / WarehouseStepLayout / WorkTypeStep / DesktopLe...

### Round-14 — 구조 정리 (3 commit)
- 14-1: `features/mes/shared` (Toast/ConfirmModal/BottomSheet) → `lib/ui` 이동, 27 import 경로 변경
- 14-2: `lib/api/types.ts` (legacy barrel) 제거 — `types/index.ts` 정본만 유지
- 14-3: `legacyUi.ts` wrapper 제거, 121 파일에서 `LEGACY_COLORS` 를 `@/lib/mes/color` 직접 import 로 마이그레이션 (Python 스크립트 UTF-8 안전)
```
