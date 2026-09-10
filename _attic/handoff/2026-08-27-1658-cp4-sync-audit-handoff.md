# DEXCOWIN MES CP4 기준선 동기화·재감사 인계

## 목표

커밋된 `main` SHA `38551726bba7d8253ad19fb39b146e7c60c2bc2d`를 품질 브랜치에만 통합하고, `957ec658..38551726`의 변경분을 재감사해 CP4 구현 범위를 결정 완료 상태로 만든다.

이 작업은 CP4 제품 구현 전용 작업이 아니다. 동기화·충돌 해결·migration 정리·재감사·검증·문서 갱신·품질 브랜치 push까지만 수행하고, 완료 인계를 남긴 뒤 멈춘다.

## 실행 위치와 Git 기준

- 품질 워크트리: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- 품질 브랜치: `codex/full-code-quality-improvement`
- 시작 HEAD·원격 HEAD: `e0706c6de792fdc3c74dbeb824cfdbc055655bdf`
- 통합할 main·origin/main: `38551726bba7d8253ad19fb39b146e7c60c2bc2d`
- 공통 기준: `957ec65805c3efe820416e49ba6eb839d6364665`
- 방향: `main -> 품질 브랜치`만 허용
- force-push, 새 브랜치, PR, main 수정·push·merge 금지

## 절대 제외할 main 미커밋 변경

다음은 사용자 작업이므로 읽기·수정·stage·commit·stash하지 않는다. 고정 SHA 병합에는 포함되지 않는다.

- `_attic/handoff/2026-08-20-warehouse-empty-work-area-height-todo.md`
- `_attic/handoff/2026-08-27-verified-unimplemented-todo.md`
- `frontend/app/mes/_components/DesktopRightPanel.tsx`
- `frontend/app/mes/_components/_history_sections/DesktopHistoryRightPanel.tsx`
- `frontend/app/mes/_components/_history_sections/__tests__/DesktopHistoryRightPanel.test.tsx`
- `frontend/app/mes/_components/common/SlidePanel.tsx`
- `frontend/app/mes/_components/common/__tests__/SlidePanel.test.tsx`
- `frontend/app/mes/_components/mobile/screens/MobileAssemblyChecklistScreen.tsx`
- `frontend/app/mes/_components/mobile/screens/__tests__/MobileAssemblyChecklistScreen.test.tsx`

`C:\ERP-dev`는 파일·해시·검색·DB·process·port까지 접근 금지다.

## 품질 워크트리 시작 상태

시작 시 다음 untracked handoff 하나가 이미 존재한다. 내용을 보존하고 동기화 closeout의 별도 docs commit에서 추적한다.

- `_attic/handoff/2026-08-21-1208-quality-checkpoints-supervisor-handoff.md`

이 인계 문서도 동기화 closeout에서 함께 추적한다.

## 작업 순서

1. `C:\ERP\AGENTS.md`, 위 supervisor handoff, 감사 계획의 8.9절을 읽는다.
2. 양쪽 SHA·status·merge-base를 다시 확인한다. 고정 SHA가 다르면 중단한다.
3. `957ec658..38551726`의 main 전용 74커밋과 전체 변경 경로 manifest를 ignored runtime에 보존한다.
4. CP4 관련 `inventory_operations`, cancellation, `transaction_actions`, `io_persist`, handover, item command/history, migration과 테스트를 정적으로 재감사한다.
5. `git merge --no-ff 38551726`으로 품질 브랜치에만 병합한다.
6. 충돌은 최신 main 업무 동작을 정본으로 두되 품질 브랜치의 `VerifiedActor`, cutover 차단, Node/CI gate를 유지한다. 동결 파일은 main blob을 그대로 사용하고 추가 편집하지 않는다.
7. 이미 main에 공개된 migration `20260820_0023`~`20260826_0029`는 revision ID와 내용을 보존한다. 품질 전용 operator-session migration은 main `0029` 뒤 `20260827_0030`으로 재작성하고 품질의 중복 internal-use migration은 제거한다.
8. temp DB에서 fresh upgrade, `0029 -> 0030`, failure rollback, single head를 검증한다. 품질 워크트리 `mes.db`는 ignored backup 후 전용 개발 DB로만 재생성한다. main DB는 건드리지 않는다.
9. CP4 카드를 `RESOLVED_BY_MAIN`, `PARTIAL`, `OPEN`, `SUPERSEDED`, `CONFLICT` 중 하나로 재판정하고 감사 계획의 CP4 범위·테스트·파일 경계를 갱신한다.
10. focused migration/auth/inventory-operation/cancel 테스트 후 전체 gate를 한 번 실행한다.
11. 구간별 로컬 commit을 만들고 기존 품질 브랜치에만 push한다. 실제 GitHub E2E·PostgreSQL workflow를 확인한다. required-check 설정은 변경하지 않는다.
12. 최종 branch/HEAD/status, 검증 수치, CP4 결정 완료 범위와 단일 다음 행동을 새 handoff에 기록하고 멈춘다.

## migration 통합 정책

운영 가능성이 있는 main migration은 절대 renumber하거나 수정하지 않는다. 품질 브랜치에만 존재하고 main에 미병합인 operator-session migration만 main head 뒤로 재배치한다. 품질 전용 DB는 폐기 가능한 개발 DB로 취급하되 먼저 ignored runtime에 백업한다.

## CP4 재판정 기준

- `IC-03-A`: main의 append-only inventory-operation과 atomic cancellation이 workflow 귀속·batch identity·wrong-bucket 차단을 모두 충족하는지 확인한다.
- `IC-09`: IO·StockRequest가 동일 actor·route·key·payload fingerprint만 재사용하고 다른 payload를 409로 막는지 확인한다.
- `IC-10`: handover·correction·cancel owning row lock과 PostgreSQL 두 connection winner 1 증거를 확인한다.
- `IC-11`: active command lookup, deleted history lookup, open-reference delete 409를 확인한다.

수량 정정은 원본 거래당 1회만 허용하는 정책으로 고정한다.

## 검증과 완료 조건

- Alembic single head와 fresh/upgrade/rollback PASS
- auth·inventory operation·cancel focused PASS
- `verify_local.ps1 -Mode full -DbReadOnlyCheck -IncludeE2E` PASS
- OpenAPI, frontend type, backend test, E2E, build, bundle, docs PASS
- `git diff --check` PASS
- 테스트 종료 후 8021·3100 listener와 임시 E2E DB 0
- main·직원 DB 변경 0
- 동결 UI에 품질 브랜치 추가 변경 0
- 품질 브랜치 push와 GitHub workflow 결과 기록
- CP4 구현 작업이 의사결정 없이 실행 가능한 handoff 작성

## 사용자 승인

사용자는 자리 비움 중 자동 진행을 승인했다. 각 GREEN hard stop 뒤 기존 품질 브랜치에 local commit·push하고 계속할 수 있다. 자동 진행 중단 조건은 승인 계획의 6절을 그대로 따른다.
