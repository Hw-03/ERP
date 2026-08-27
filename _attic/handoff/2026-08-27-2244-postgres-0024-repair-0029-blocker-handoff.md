# PostgreSQL 0024 repair 통합·0029 후속 blocker handoff

- 작성 시각: 2026-08-27 22:44 KST
- 품질 worktree: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- 품질 branch: `codex/full-code-quality-improvement`
- 공식 시스템명: DEXCOWIN MES
- 최종 판정: **BLOCKED — CP4 제품 구현 시작 금지**

## 1. 결론과 단일 다음 행동

`20260821_0024`의 PostgreSQL index 오인은 별도 repair commit으로 해결했고 실제 0023→0024와 실패 복구까지 통과했다. 최신 `main` `759067e`와 repair를 품질 브랜치 방향으로만 통합한 뒤 실제 빈 PostgreSQL→0030을 재실행했지만, 0024 다음의 기존 main revision `20260826_0029_inventory_operations.py`가 `inventory_operation_role_enum`을 만들지 않은 채 `transaction_logs.operation_role`을 추가해 중단됐다.

**단일 다음 행동:** `0379648e`를 포함하는 별도 baseline repair branch에서 기존 main `0029`의 PostgreSQL enum 생성·0029 재실행·rollback/retry를 TDD로 교정하고, 새 repair commit을 이 품질 브랜치에 통합한다. 그 전에는 품질 dirty 변경을 commit/push하지 않고 CP4 제품 구현도 시작하지 않는다.

다음 baseline repair의 기본 파일 경계는 아래 두 파일이다. 실제 조사에서 이 경계를 넘어 기존 main migration을 더 고쳐야 하면 다시 중단한다.

- `backend/alembic/versions/20260826_0029_inventory_operations.py`
- `backend/tests/migrations/test_inventory_operations.py`

## 2. Git·worktree 상태

| 항목 | 현재 값 |
|---|---|
| fixed main / origin main | `759067e031aaf8245347952be3e86474981cab29` |
| repair worktree | `C:\ERP\.worktrees\fix-postgres-shipping-status-0024` |
| repair branch | `codex/fix-postgres-shipping-status-0024` |
| repair commit | `0379648ef024c665f19fa1d037a5bccb21729bd8` |
| quality HEAD | `cd7a81c9edc136b3be9bcce71a15ef709ae0aed0` |
| quality upstream | `origin/codex/full-code-quality-improvement` = `e0706c6de792fdc3c74dbeb824cfdbc055655bdf` |
| upstream 대비 | remote-only 0, local-only 79 |
| staged | 0 |
| push / PR / force-push | 0 |

이번 통합 commit은 다음 두 개다.

1. `ed47a46830bd94ee06183746e454a83eb30e4346` — `759067e`를 품질 브랜치 방향으로만 merge
2. `cd7a81c9edc136b3be9bcce71a15ef709ae0aed0` — repair commit `0379648e`를 품질 브랜치 방향으로만 merge

품질 worktree의 시작 dirty manifest는 예상 20 tracked+3 untracked와 23/23 일치했다. stash `2ecf798c683e058d5224fbfd9588f9ab19acb687`를 `--include-untracked`로 만들고 두 merge 뒤 23/23 충돌 없이 복원한 다음 stash를 삭제했다. 이 handoff 추가 뒤에는 기존 20 tracked와 untracked handoff 4개가 남는다.

`C:\ERP` 메인 worktree의 사용자 dirty 9개는 시작·종료 시 읽기 전용으로만 확인하며 수정·stage·stash·commit하지 않는다. `C:\ERP-dev`에는 파일·해시·검색·DB·process·port를 포함해 접근하지 않았다.

## 3. 최신 main delta 재감사

`38551726..759067e`는 commit 1개, 변경 경로 8개다. 체크리스트·이력 상세 panel UI와 handoff만 변경했고 migration, 인증, inventory-operation 경로와 교집합은 0이다. 주간보고, 모바일 하단 tab, desktop shipping step 5 동결 경로도 교집합 0이다. CP4 제품 구현 변경은 0이다.

## 4. 0024 repair와 검증

### 4.1 TDD 변경

RED에서 두 `pg_attribute` query의 relation filter가 0회임을 확인했고, 실제 PostgreSQL에서도 일반 `ix_shipping_requests_status.status`를 예상 밖 enum column으로 오인하는 원래 오류를 재현했다. production 변경은 `backend/alembic/versions/20260821_0024_remove_shipping_requested_status.py:147-175`에 `relation.relkind IN ('r', 'p')`를 두 번 추가한 것이 전부다.

회귀 테스트는 다음 계약을 고정한다.

- 두 dependency query 모두 ordinary/partitioned table만 검사
- 실제 ordinary index의 `status` attribute는 무시하고 0023→0024 성공
- 실제 table과 partitioned-table의 예상 밖 enum column은 relation 이름을 포함해 fail-closed
- 오류에는 index relation이 섞이지 않음

### 4.2 검증 결과

- 비-PostgreSQL migration/SQLite/policy 파일: 8 PASS, PostgreSQL 선택 test 4 SKIP
- 실제 PostgreSQL 핵심: index 성공 1 + table/partitioned-table fail-closed 2 = 3/3 PASS
- 실제 PostgreSQL을 포함하되 기존 main fresh test만 제외한 파일: 11/11 PASS
- failure recovery: 의도적 실패 뒤 revision `20260820_0023`, 기존 enum label 5개, replacement type 0; 원인 table 제거 뒤 retry revision `20260821_0024`, 현행 enum label 4개
- Ruff 대상 파일: PASS
- `git diff --check`: PASS
- repair staged smart gate: backend full pytest PASS, OpenAPI exact PASS, exit 0

repair branch는 요청대로 push하지 않았다.

## 5. migration 직렬화와 새 blocker

Alembic CLI는 `20260827_0030` 단일 head다. chain은 main `20260820_0023`→…→`20260826_0029`→quality `20260827_0030`이다. main 대비 migration 변경은 품질 선행 `0016` PostgreSQL 교정, 승인된 `0024` 두 줄 교정, 품질 전용 `0030`뿐이다. 중복 품질 internal-use 0024는 없고 operator-session은 `0029→0030`이다.

실제 PostgreSQL 16의 빈 `dexcowin_quality_fresh` DB에서 품질 worktree의 `python bootstrap_db.py --all`을 실행했다. 0024는 성공했지만 0029에서 다음 오류가 발생했다.

```text
psycopg2.errors.UndefinedObject: type "inventory_operation_role_enum" does not exist
ALTER TABLE transaction_logs ADD COLUMN operation_role inventory_operation_role_enum
```

검증된 원인은 다음과 같다.

- `backend/alembic/versions/20260826_0029_inventory_operations.py:459-471`은 `role_enum` Python 객체만 선언한다.
- 같은 파일 `:480-500`은 PostgreSQL enum type을 명시적으로 만들지 않고 batch add-column을 실행한다.
- `upgrade()`는 `_create_operation_tables()` 뒤 `_alter_transaction_logs()`를 그대로 호출한다(`:605-615`).
- 0029 blob SHA-1은 quality와 fixed main 모두 `7fd8fa7ee53a1707148fd99bb75b163b6b202b37`이다.

실패는 transactional DDL로 전부 rollback되어 public table 0, `alembic_version` 없음, `inventory_operation_role_enum` 0이었다. 뒤 `0030`으로 사후 복구할 수 없으며 기존 main migration 수정 hard stop에 해당한다.

## 6. 미실행·원격 상태

blocker 뒤 아래 단계는 성공으로 오인하지 않고 실행하지 않았다.

- 품질 branch `verify_local.ps1 -Mode full -DbReadOnlyCheck -IncludeE2E`: **NOT_RUN**
- 현재 quality HEAD의 GitHub E2E/PostgreSQL job: **NOT_RUN** — push하지 않음
- required-check 현재 HEAD 적용 판정: **NOT_VERIFIED**
- 독립 최종 명세 리뷰 / 코드 품질 리뷰: **NOT_RUN** — Critical/Important 0을 주장하지 않음
- 품질 dirty 논리 commit / push: **NOT_RUN**

기존 원격 `e0706c6`의 과거 CI 성공은 현재 local HEAD `cd7a81c9`의 증거가 아니다.

## 7. CP4 재판정과 다음 경계

| 카드 | 판정 | 이유 |
|---|---|---|
| `IC-03-A` | `PARTIAL` | main 원장 identity·취소·legacy adoption은 `RESOLVED_BY_MAIN`; correction 안전막은 미구현 |
| `IC-09` | `OPEN` | actor+route+ordered payload fingerprint와 ResultUnknown key 보존 미구현 |
| `IC-10` | `PARTIAL` | cancel lock·SQLite winner는 `RESOLVED_BY_MAIN`; handover/correction lock과 PostgreSQL 경합 미구현 |
| `IC-11` | `PARTIAL` | deleted history는 `RESOLVED_BY_MAIN`; active command·open-reference delete 보호 미구현 |
| baseline migration | `CONFLICT` | 0024는 해결됐으나 fixed-main 0029 PostgreSQL fresh upgrade 불가 |

제품 카드끼리 conflict는 없고 판정은 이전 handoff와 같다. baseline이 GREEN이 된 뒤에만 감사 계획 8.9.5의 세 구간을 시작한다. 현 HEAD `cd7a81c9`에서는 제품 파일을 건드리지 않는다.

## 8. DB·runtime·동결 영역 종료 상태

- 품질 worktree `backend/mes.db`: 수정하지 않음, SHA-256 `90FA7ABE83D2A8BF545531C15CDB75FDA2A3B9F519AA86F6EC396B8DE616C71E`, Alembic head `20260827_0030`
- 일회용 PostgreSQL DB 3개: 삭제 후 `pg_database` count 0
- PostgreSQL port `55432`: listener 0, server 정상 종료
- 일회용 cluster 파일: 삭제 정책이 recursive removal을 차단해 stopped 상태로 `C:\ERP\.worktrees\fix-postgres-shipping-status-0024\_attic\runtime\pg-0024-repair`에 ignored 보존
- E2E 서버·임시 SQLite DB: 이번 run에서 기동·생성하지 않음
- 주간보고, 모바일 하단 tab, desktop shipping step 5 동결 영역: 추가 편집 0

다음 작업자는 0029 baseline repair 외 CP4 제품 코드를 시작하지 않는다.

## 9. 다음 0029 repair의 확정 설계

### 원인과 최소 변경

- 원인은 `_alter_transaction_logs()`가 `sa.Enum(..., name="inventory_operation_role_enum")` 객체만 만들고 PostgreSQL type 생성은 수행하지 않은 채 `batch_op.add_column()`을 호출하는 것이다.
- SQLite는 named enum type을 별도 생성하지 않으므로 기존 `backend/tests/migrations/test_inventory_operations.py`만으로는 이 결함을 검출할 수 없다.
- 별도 repair branch에서 기존 `20260826_0029` 안에 PostgreSQL 전용 enum type 생성 경계를 추가한다. 새 후속 revision으로 우회하지 않는다. 빈 DB는 0029 자체를 통과해야 하고, 실패한 0029는 transactional DDL로 revision 표식 없이 rollback되므로 0030에서 복구할 수 없다.
- 권장 최소 구현은 enum 정의를 재사용 가능한 module-level `sa.Enum` 객체로 만들고, online PostgreSQL에서 transaction log column 추가 전에 `create(bind, checkfirst=True)`를 호출하는 것이다. SQLite와 offline SQL 계약은 기존 동작을 보존한다.
- `inventory_operation_kind_enum`, `inventory_operation_status_enum`, `inventory_operation_effect_kind_enum`은 `op.create_table()` 경로가 생성하므로 이번 blocker 범위에서 불필요하게 손대지 않는다.

### RED/GREEN 증거 행렬

1. 실제 PostgreSQL 빈 DB `base→0029→0030`: `inventory_operation_role_enum`과 `transaction_logs.operation_role` 생성, single head 확인.
2. 실제 PostgreSQL `0028→0029`: 기존 데이터와 FK 보존, enum label이 모델의 10개 값과 정확히 일치.
3. 의도적 0029 후반 실패: enum·원장 table·column·`alembic_version`이 모두 이전 상태로 rollback되는지 확인하고, 실패 원인 제거 후 동일 migration retry 성공.
4. 이미 동일 enum type이 존재하는 재검증 경로: `checkfirst=True`가 중복 type 오류를 만들지 않고, `_existing_schema_state()`의 complete/partial fail-closed 계약을 보존하는지 확인.
5. enum label 또는 schema가 다른 실제 type이 선재한 경우: 이를 정상으로 오인하지 않고 `partial` 또는 명시적 오류로 중단하는지 검증.
6. 기존 SQLite migration 보존·FK 테스트, offline PostgreSQL SQL 생성, Alembic single-head 검사를 함께 실행.

이 repair의 실제 migration 수정과 커밋은 기존 main revision 수정에 대한 사용자 승인 뒤에만 수행한다.
