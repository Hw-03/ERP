# 레거시 잔재 제거 — `legacy/` → `mes/` 개명 (완료·2026-06-05)

> 완료된 플랜 보관본. 권동환 사원 복귀(2026-06-25) 코드리뷰 준비의 일환.

## Context

`frontend/app/legacy/`는 이름과 달리 **현재 운영 중인 메인 MES UI 전체**였다(루트 `/`가 re-export). 메인 화면이 `legacy`(낡은 것) 폴더에 든 것 + 비어있는 `features/mes` 골조 7개 + 대상 없는 ESLint 가드는 모두 "하다 만 미완성"으로 읽힌다. 원래의 `legacy→features/mes` 이전 계획은 Round-3에 빈 자리만 만들고 멈춰 실제 이전이 0건이었다(검증). 그래서 현실에 맞게: **빈 골조를 걷고, 살아있는 폴더를 정직한 이름 `mes/`로 개명하고, 진짜 죽은 코드만 삭제.** 동작 무변경(순수 구조·이름).

## 확정 결정 (grill 결과)

1. 죽은코드 삭제 + 개명 **둘 다**.
2. **단순 `git mv`** (features/mes 대규모 이전은 안 함).
3. 빈 `features/mes` 7파일 **삭제**.
4. 새 이름 **`mes/`**, URL `/legacy`→`/mes` (코드가 이미 `lib/mes`·`mes-status` 등 'mes' 접두어로 일관 + 공식명 DEXCOWIN MES).
5. DB 필드 `legacy_part`·`legacy_item_type`는 **이름이 정확**(옛 시스템 데이터)해서 **그대로 둠**.
6. 죽은 DB흔적(`legacy_model`·`option_code`·`erp_code`)은 **이미 DB에서 제거됨** → 손댈 것 없음. `backend/erp.db`는 git 미추적이라 제외.
7. `.eslintrc.json` overrides 블록 **통째 제거**(features/mes 전용이라 대상 사라짐).
8. `xray-erp`/`ERP` 내부 식별자는 **이번엔 안 건드림**(CLAUDE.md 금지·바꾸면 세션키 변경→전원 재로그인).

## 절대 건드리지 않은 것

- `legacy_part`/`legacy_item_type` (현역·이름 정확)
- 주간보고 frozen 파일(내용 무변경, 경로만 이동)
- `lib/mes-*`·`lib/ui/*`의 "기존 legacyUi/features/mes/shared 에서 이동" **역사 주석**
- `xray-erp` 식별자, `_attic/`·`_archive/` 아카이브

## 실행 단계 (요약)

1. 죽은 코드 삭제: `features/mes`(7) + `_archive`(4) `git rm`.
2. `git mv frontend/app/legacy frontend/app/mes`.
3. 참조 치환: 내부 nav 3 + 절대import 1 + `page.tsx` 재export + `error.tsx` + 모바일스크립트 3 + e2e 4 — 라우트/import만, 역사주석 보존.
4. `.eslintrc.json` overrides 제거 → `{ "extends": "next/core-web-vitals" }`.
5. `mes/README.md` 재작성.

## 검증 (worktree)

`lint:strict` 0 warnings · `tsc --noEmit` 통과 · vitest 65파일 644 green · `next build` 성공(라우트 `/`·`/mes`). 잔존 functional `/legacy` 0(역사주석 제외).

---

## 실행 결과 (2026-06-05)

- **격리 실행**: 동시 세션이 `C:\ERP`를 점유 중이라 `main` 기준 별도 worktree(`C:\ERP-legacy-mes`)에서 진행, 원본 무손상.
- **5커밋 분리 푸시** (`refactor/legacy-to-mes`): `b577189a`(features/mes 삭제) → `1c402557`(_archive 삭제) → `e61e12c4`(ESLint) → `6e7a637e`(개명+앱라우트, **291 rename 감지**) → `bbd7ed0f`(e2e·모바일스크립트 라우트).
- **CI 1차 — 백엔드 pytest 실패 발견 (플랜의 맹점):** `backend/tests/test_approval_rules_drift.py`가 프론트 `app/legacy/_components/_warehouse_v2/ioWorkType.ts`를 **하드코딩 경로**로 읽어(ADR-0005 FE↔BE 결재규칙 drift 가드) 개명 후 FileNotFound. "백엔드 무변경" 가정이 틀렸던 지점. → 6번째 커밋 `a4a74eaa`(fix): 테스트 경로 + `approval_rules.py` docstring + `CLAUDE.md`(frozen 경로) + `README.md`(트리·삭제된 features/mes 줄) → `app/mes/`.
- **main 동기화:** main이 `0dfff902`(다른 세션의 io-defect 로케이터 수정)로 전진 → `origin/main`을 브랜치에 병합(`e0a29b5d`). `io-defect.spec.ts` auto-merge로 그쪽 로케이터 수정 + 내 `/mes` 라우트 양립.
- **CI 2차 — 전체 green** (Frontend ✓ · Backend ✓ · E2E ✓).
- **main 머지:** `--no-ff`로 병합 후 푸시.

### 교훈

폴더 개명·이동 시 프론트 코드뿐 아니라 **백엔드/문서의 프론트 경로 하드코딩**도 반드시 grep 대상: FE↔BE parity 테스트(`test_approval_rules_drift.py`), 서비스 docstring, `CLAUDE.md` frozen 경로, `README.md` 트리. 로컬 frontend 검증만으론 안 잡히고 CI 백엔드 잡에서 드러남.
