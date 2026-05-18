# _attic/ — 배포 불필요 파일 격리소 · 용도별 카탈로그

이 폴더는 **삭제가 아니라 격리**다. DEXCOWIN MES 실서버 구동에 불필요한 파일을
여기 모았다. 물리 구조는 **원본 repo 트리를 그대로 미러링**한다(예:
`_attic/scripts/dev/...`, `_attic/data/...`). 이렇게 둬야 격리된 스크립트·게이트의
상대경로가 `_attic/` 안에서 그대로 동작한다.

> ⚠️ **물리 위치를 PARA식으로 옮기지 마라.** `_attic/{scripts,data,backend,outputs}/`
> 와 `_attic/docs/openapi.json` 은 15개+ 스크립트와 커밋 게이트가 상대경로로 결합돼
> 있어 이동·이름변경 시 깨진다. 정리는 **이 카탈로그(문서)로만** 한다.

분류 체계: PARA 변형 — **운영 · 참고 · 기록 · 보관**.
(PARA의 P=마감 있는 능동 프로젝트는 격리소 정의상 존재하지 않아 생략.)

> 📌 WS2(2026-05-18)에서 **운영 도구는 runtime 복귀**: `scripts/ops/`(백업/복구/
> 헬스/preflight/load_test), `docs/operations/`(런북 4종), `docs/OPERATIONS.md`
> 는 더 이상 `_attic/`에 없다(실서버 운영 필수라 원위치). 아래 카탈로그에서 제외됨.

---

## 1. 운영 (Operational) — 가끔 실행한다. 경로결합, 이동 금지

| 위치 | 용도 / 실행법 |
|---|---|
| `scripts/dev/verify_local.ps1` | 커밋 게이트(경로조정본). `powershell -ExecutionPolicy Bypass -File .\_attic\scripts\dev\verify_local.ps1` |
| `scripts/dev/import_real_inventory.py` | `data/재고_입력_양식.xlsx` → DB 일괄 반영 (`--apply`) |
| `scripts/dev/generate_inventory_template.py` | 입력 템플릿 재생성 |
| `scripts/dev/extract_io_bom_parents.py` | 입출고 관리대장 → BOM 부모후보 추출 |
| `scripts/dev/restart-frontend.ps1` | 프론트 dev 서버 재기동 |
| `scripts/migrations/` | 구 DB 업그레이드 시 1회성 마이그레이션 |
| `docs/openapi.json` | verify 게이트가 대조하는 기준선 — **이동 금지** |
| `data/재고_입력_양식.xlsx` | import_real_inventory 입력 양식 |
| `backend/` (erp.db 백업류) | restore_db 복구 대상 |

> 참고: `scripts/dev/generate_devlog.py`(→`docs/개발현황.xlsx`)는 상대경로 `docs/`를
> 쓰므로 **CWD를 `_attic/`로 두고** 실행해야 한다.

## 2. 참고 (Reference) — 읽기 전용. 실행 안 함

- `docs/`: ARCHITECTURE · ERD · GLOSSARY · ITEM_CODE_RULES · USER_GUIDE ·
  ONBOARDING · API_CHANGELOG · BACKEND_REFACTOR_PLAN · FRONTEND_HOOKS_PLAN ·
  MOBILE_SCAN_TESTING · README · 주간보고.md
  (OPERATIONS.md·operations/ 는 WS2에서 runtime 복귀 — 여기 없음)
- `docs/research/`(설계·감사 메모 40), `docs/design/`(로그인 디자인), `docs/presentation/`
- `_archive/`(bom-family-draft.html, reference/), `CODEX_HANDOFF_scroll_reset.md`
- `.dev/`(Playwright 스크린샷 자동화 셋업)

## 3. 기록 (Records) — 보존 가치 데이터·감사 원장

- `data/` 공급망 입력: `2026.03_생산부 자재_*.xlsx`, `F704-03 … 자재 재고 현황.xlsx`,
  `창고_재고.xlsx`, `생산부_재고_매칭작업.xlsx`
- `data/입출고 관리대장/` — 2024·2025·2026 제품 입출고 원장 (감사 추적)
- `data/` 생성물: `ERP_Master_DB.csv`, `ERP_Excluded_Items.csv`,
  `ERP_Source_Links.csv`, `ERP_Unmatched_A_Items.csv`, `입출고_BOM부모후보.xlsx`
- `outputs/`(bom_setup · inventory_cleanup 산출물), `docs/개발현황.xlsx`

## 4. 보관 (Archive) — 죽음. 롤백 대비로만 보관

- DB 백업 6종(아래 표), `backend/_archive/`, `frontend/_archive/`,
  `scripts/migrations/_archive/`(적용 완료: BA→AA 등)
- `docs/regression*/`, `docs/screenshots/`
- `scripts/dev/` 1회성: build_item_image_manifest · check_db · erp_integration ·
  extract_excel_images · import_inventory_cleanup · migrate_add_bom_completed_at ·
  normalize_stock_request_approvals · randomize_inventory · split_logo(+split_logos/) ·
  test_encoding · decowin_logo.png

---

## ⚠️ 지뢰 (참고만 — 어차피 안 돌아감)

- `outputs/bom_setup/build.py` — 경로 `C:/ERP/...` 절대 하드코딩
- `scripts/dev/normalize_uuid_format.py` — `C:\ERP\backend\erp.db` 절대 하드코딩

이 둘은 repo가 정확히 `C:\ERP\`일 때만 실행됨. 위치 무관하게 사실상 死파일.

## 🗑️ 삭제해도 되는 확정 후보 (정보용 — 여기서 삭제하지 않음)

| 대상 | 크기 | 사유 |
|---|---|---|
| `erp.db`(루트 스테일) | 528K | Apr 11 스냅샷, 어떤 경로도 안 씀 |
| `backend/erp.db.backup-2026-05-02` | 1.1M | 구 백업 |
| `backend/erp.db.bak-20260518-174631` | 1.5M | 구 백업 |
| `backend/_backup/*.db` (3개) | ~3.2M | PRE-MIG 등 구 백업 |
| `docs/regression*` (3개) | ~5.2M | 회귀 스크린샷, 재생성 가능 |
| `docs/screenshots/` | 2.2M | 스크린샷, .dev로 재생성 |
| `scripts/migrations/_archive/` | 소 | 적용 완료, git 이력 보존 |

> 합계 약 12MB+. 삭제는 사용자가 직접 결정. 이 카탈로그는 **분류·안내만** 한다.

## 되돌리기 / 출처

각 파일의 원래 위치 = `_attic/` 접두어를 뗀 경로. 추적 파일은
`git mv _attic/<경로> <원경로>` 또는 `git checkout`. 미추적 백업·DB는 단순 이동.
삭제한 것이 없으므로 손실 위험 0. 격리 1단계 상세는 플랜 파일 참조.
