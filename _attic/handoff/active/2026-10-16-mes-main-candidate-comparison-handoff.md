# main·후보 비교 재개 지점

**최신 재개 지점 — 2026-10-16 18:42:** 알림 시험·원장 후속을 `5a77fbf1308105bdc2597565f9dd4ceea6b1809c`에 커밋했다. pytest선택자1·원장생성/check exit0, 적용JSON=보존가드제안JSON 확인. `6f9a6aff` CI38881026887의 프론트 단위/커버리지 단계는 통과했고 빌드 진행중이었다. 다음은 이3문서 명시stage·문서검사/커밋→후보만push→새HEAD 전체CI 확인이다. 이전CI backend/일반E2E는 새푸시로 취소될 수 있으며 최종통과로 세지 않는다. 제품소스는 동일하고 이번후속시험변경은 frontend2+backend1파일뿐이다. DB·서버 식별값은 아래표 그대로, 제품967표현은 시험도 포함한 당시소스입력집합이므로 현재전체불변으로 확대하지 않는다. 상세·첫표·TODO를 함께갱신했다.

**우선 읽기 — 2026-10-16 18:36:** `6f9a6aff` 후보푸시 완료, CI38881026887진행중. 첫CI backend는취소직전실제1FAIL: closure생산부알림시험에창고수신자옛기대남음. 부모가실제서비스·queue·정책읽고 `backend/tests/test_io_expectation_closure.py`531시험만수정(정·부수신,창고제외,창고queue200[]). 국소선택자PASS `T/ci-fix-department-notification.log`. 이수정은아직미커밋. comparison_b가읽기전용원장패치 `R/ci-notification-ledger-proposal.patch`준비중. 다음: 패치검토/적용→원장생성/check→해당수정·기록명시커밋→후보push→최종HEAD CI. 첫일반E2E는취소/미완료 `T/ci-38877549662-general-cancelled.log`; 중간proxyECONNRESET은원인미확정. 새업무검사반복/제품·DB변경불필요. 아래18:18~기록은이전단계로보존한다.

2026-10-16 18:18 기록 기준. **업무·production 상세를 완료하고4커밋을 후보만 푸시했다. 첫 CI 프론트8실패의 테스트2파일을 국소 보완 중이다.** WorkChoice19/Stocktake92·ESLint 통과, 제품 수정 없음. 새 HEAD CI는 아직이다. [상세 설명·첫 비교표](../../../docs/superpowers/plans/2026-10-16-mes-main-candidate-comparison-report.md), [활성 TODO](2026-10-16-mes-main-candidate-comparison-todo.md), [승인 계획](../../../docs/superpowers/plans/2026-10-16-mes-main-candidate-comparison.md)를 함께 읽는다. 완료업무는 다시 실행하지 않는다.

## 현재 식별값

| 구분 | A | B |
|---|---|---|
| 작업 폴더 | C:/ERP | C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP |
| 브랜치 | main | codex/mes-main-candidate-comparison-20261016 |
| 업무·시험 소스 기준 HEAD | 29583972129c8340aa19416e6c554ea60db3c490 | 5a77fbf1308105bdc2597565f9dd4ceea6b1809c (후속 기록 커밋은 뒤에 추가) |
| 병합 | 없음 | e9560587에서 대기5927e532 결합 완료, MERGE_HEAD 없음 |
| 주소 | http://127.0.0.1:3001 / backend8011 | http://localhost:3038 / backend8038 |
| 현재 모드 | dev | production, .next-prod 최종 빌드 사용 |
| 활성 DB | C:/ERP/backend/mes.db | C:/ERP/_attic/runtime/main-candidate-20261016/B/qa.db |
| DB revision | 20261014_0046 | 20261015_0047 |

**후보4커밋을 푸시했고 후속6f9a6aff를 커밋했다.** `e9560587` 병합/기존 복귀시험 계약, `c7c4628f` 기타 사유 RO 수정/검사, `5f660a90` 현재 원장연결, `fb2558d2` 정제4문서, `6f9a6aff` WorkChoice/Stocktake 시험2파일·현재binding4개/과거보존. 현재 미커밋은 보고/표·TODO·인계3문서다. 제품 SHA는 `documentation-checkpoint.json`, 첫 푸시 직후 동일성은 `final-source-fb2558d2.json`이다. A의 기존 untracked 계획 문서는 건드리지 않았다. 후속 푸시/CI 상태는 마지막 기록을 따른다.

로컬 R=`C:/ERP/_attic/runtime/main-candidate-20261016`, T=`C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP/_attic/runtime/comparison-checks`.

원형 온라인 스냅샷 `R/backups/sqlite/mes-before-comparison-employee-source-20261016-143800-4492139c.db`, SHA256 `5b9b7211ffbe7a5a1cc9218f336d6e05dca02ade1748a000e5236391219d5bb8`.
A 최초 개발 DB 보존 `R/A/development-before-switch.db`. A/B seed hash·revision은 `R/pair-preparation.json`에 있다. live DB raw hash는 업무 중 변하므로 초기값과 같다고 주장하지 않는다. A/B `documentation-checkpoint.json`은 AS02 완료 전 문서 복원 당시의 읽기 전용 논리 스냅샷이다. 최신 AS02 완료 수량·상태는 각 `AS02-cancelled.json`과 `AS02-comparison.json`을 따른다.

B 현재 소유권 영수증 `R/B/session.json`은17:25 production세션이며 boot_id `782416342c5c4949892993d845a9d3a4`, build_id `K4aEq29ysft3gVQjFIjku`다. 기존 dev영수증/로그는 `R/B/dev-before-production/`에 보존. `R/PROD00-start-receipt.json`은 제품967파일이 문서체크포인트와 동일하고 기동시업무행불변임을 확인했다. PID는 현재session의 생성시각·명령/포트를 다시 대조한다. Node20.20.2 `C:/ERP/_attic/runtime/tools/node-v20.20.2-win-x64/node.exe`. 기존 직원 서비스·예약은 변경 금지. B 전용 `R/candidate_server.py`만 사용하고 기존 직원/다른 소유 PID를 종료하지 않는다.

## 완료 작업과 근거

- CP0/1: 동일 원형 분기·QA 직원 준비·B 명시 migration·기존 업무86테이블 보존·SQLite/FK·신규 nullable 백필 없음. `pair-preparation.json`, `A/original-tables.json`, `B/original-tables.json`, `B/migration.log`, `A/cutover.json`.
- AP01/AP02/IO02/DF01/PR01/DF02/PR02/RW01/AS01/SH01의 지정 조건 완료. 전/후/역순 취소·무관 수량은 상세 문서와 업무별 comparison.json을 읽는다. 공통31단계 수량·예약 일치 `all-workflow-stock-parity.json`. 전체 업무 PASS는 아니다.
- AS02 완료: QA-B의 조립1 AS 사용 요청 → QA-AS 전용 승인 → 같은 QA-AS 취소. 총/창고/조립/조립예약은 440/439/1/1 → 439/439/0/0 → 440/439/1/0. 요청·라인·묶음 최종 취소, 원작업/역작업·원거래/역거래 유일 연결 및 SH01 종료 수량·예약 복원. `R/AS02-comparison.json`, `R/AS02-record.md`, A/B `AS02-pending.json`, `AS02-approved.json`, `AS02-cancelled.json`. A 승인 화면은 `AS02-approved-stable.png/.txt`, B는 `AS02-approved-detail.png/.txt`가 최종 근거다. 상세·첫 표·TODO 반영까지 끝났으며 다시 요청·승인·취소하지 않는다.
- 기타 사유 live 입력창 붕괴: A/B 공통 기존 결함. B ReasonFormFields의 container query를 content width ResizeObserver로 최소 대체. 실패 실험 보존, 7E2E/80단위/ESLint 통과. `DF02-layout-investigation.md`, T의 `defect-other-observed-width.log`, `DF02-RO-corrected-summary.json`.
- 4조회 각30회 A/B 교대 측정 완료. 목록/검색/상세 내용 동일·회귀 기준 내. 내역 AS 표시32차이의 원형 일치 읽기 전용 판정 완료. `performance-run-02/summary.json`, `history-approval-display-review.json`. 원INCONCLUSIVE 덮어쓰지 않음.
- production 빌드·타입·번들 3,379,878bytes(한도3,407,872) 통과. T/production-build.log, production-bundle.log. PROD-AP01은 QA-D(진공 소속 생산부 부)가 조립 요청 승인·취소, PROD-DF01은 기타 live입력·창고격리2/복귀/한작업취소·전품목복원까지 완료. 각각 comparison.json과 상세 문서를 재사용한다.
- 사용자의 추가 지시에 따라 새 업무를 잠시 멈추고 문서 복원: 상세·첫 표·33단계 짝지은 화면·파일해시 색인·TODO·이 인계 작성. 기록 때문에 유효한 검사를 다시 실행하지 않았다.
- 16:35 국소 보충 완료: IO5조건5/5, 상세wrapper2파일24/24, EOF 관련 Node12/12가 첫 실행에서 통과했고247입력 전후 해시가 같았다. `R/supplemental-checks-record.md`, `T/supplemental-20261016-01-summary.json` 및 해당 원문. 이전 재사용 초안의 이 세 미확인은 해소됐으며 입력이 바뀌지 않으면 반복하지 않는다.

## 현재 상태와 단일 재개 지점 — CI 실패만 국소 보완

**현재:** AS02·CONV01·ADJ01·SET01·DETAIL01·REPORT01/02와 B PROD-AP01/DF01 기록 완료. `3-AR-0004` 총440·창고439·조립1·예약0, RW01입고1은 남는다. QA-W만 dark/collapsed 저장, QA-N light/expanded. A tab2는 QA-N 주간PF, B tab4는 QA-B 출하 요청 목록이다. 원래 tab1은 건드리지 않는다. 압축 후 `cua.rewriteDocumentation`부터 호출하고 실제 UI·계정을 읽는다.

**다음:** CI38877549662의 backend 결과 확인 → 후보6f9a6aff push → 새 정확한 HEAD 전체CI 확인. 프론트는8실패(RO대역누락7+실사회차목록1)였고 두 시험파일만 수정하여19/92건·ESLint·원장 `--check` exit0, cached check/smart PlanOnly 후6f9a6aff커밋했다. 일반E2E 과거소요는58분이므로 옛HEAD를 끝까지 기다린 뒤 다시 전체CI를 시작하지 않는다. 새 푸시에 취소되는 옛E2E는 미완료로 남긴다. 새 업무·빌드·성능·전체기대값 로컬 반복 금지.

WorkChoice 원장은 `R/ci-workchoice-ledger-proposal.patch` 적용 후 현재4binding sourceHash·line243만 갱신하고 이전25binding snapshot을 history에 추가했다. Stocktake는 기존 main과 같은 시험·제품이었으며 `await act`와 선택지 표시 대기/펼침 단언만 추가했다. 정확한 CI effect 순서는 미확정(`R/ci-stocktake-review.md`). 실직원 DB 접근·제품수정 없음. 관련 원문은 `T/ci-38877549662-frontend.log`, `ci-fix-workchoice.log`, `ci-fix-stocktake.log`, `ci-fix-eslint.log`.

CONV01은 조립55/143/20/0→54/144/19/1→55/143/20/0, 창고0/0/480/420·예약불변. 원작업1/거래4와 역연결 유일. `CONV01-comparison.json`, `CONV01-record.md` 및 A/B각단계자료를 재사용. 후속사용미실행. 대표품목은 B 대상제품 우선 선택 코드로 원인 확인(`observed-display-differences-review.md`); 원comparison의 미확정은 당시기록으로보존. 재실행하지 않는다.

과거 경과: 문서 복원 당시에는 A만 AS02 RESERVED·조립예약1이고 B는 미실행이었다. 이후 양쪽 전용 승인·취소와16:44 문서 반영을 마쳤다. 과거 상태는 `documentation-checkpoint.json`으로 보존하며 현재 작업 지시로 사용하지 않는다.

## 재개 이후 순서

1. PROD-SH01 대조·8항목·정제4문서 커밋/푸시 완료. 현재 CI 실패만 위 순서로 보완하고 새 최종 HEAD CI를 확인한다. 완료업무는 재실행 금지.
2. 수량·예약·원장 대조 → 상세8항목·첫 표·TODO·이 인계를 갱신한 뒤 다음 묶음으로 이동한다.
3. `reuse-scope-final-draft.md`, `supplemental-checks-record.md`, 최종 읽기 감사의 재사용 범위를 확인한다. IO5·상세24·Node12와 보정/설정/상세/보고는 완료했으므로 다시 검사하지 않는다.
4. B production 핵심 입력·업무는 수행 완료했다. 최종 문서의 과거 pending 문구를 현재 결과와 연결하고 아직 하지 않은 조건은 그대로 표시한다.
5. 명시 stage·실제 날짜·cached diff check·smart PlanOnly와 실제 영향으로 부족 검사만 선택. 병합/국소수정/정제기록을 검토 가능한 커밋으로 분리. 후보만 push, 최종 HEAD 전체CI 확인. main 전진 여부는 후보에만 정상 통합.
6. A/B 사용자 검토 서버와 원형/실패 자료 보존, 개발 환경 복원법 안내. main 반영·직원 배포·운영 DB 덮어쓰기 금지.

## 실패·미확인·주의

- 원장17:06 국소 정렬은5f660a90에 커밋했다. 당시 두 권한문구·4파일85현재binding/6선언줄·과거binding/execution/원문보존·`--check` exit0. `ledger-check-20261016-02` 및 `ledger-check-20261016-01/post-apply-preservation.json`. 이번CI WorkChoice4binding 갱신은 별도 후속이다. 현재1058NOT_RUN은그대로이며 이번업무PASS와분리, 제품/도구변경없음.

- AP02 내부 io_batch completed 잔존은 A/B 기존 문제. 요청·라인/관측 UI취소 정상. 전체 소비자 영향 없음으로 확대 금지.
- AS02 실제 전용 승인·취소는 양쪽 완료. A 제출 전은 부서 결재, B는 AS 전용 결재로 표시됐고 완료 모달은 양쪽 창고 결재 문구인 기존 안내 문제다. 실제 승인 경로와 문구 차이는 `AS02-record.md`에 분리했다. 안내 문구 수정을 완료했다고 주장하지 않는다.
- DF02 기타 입력 자동검사 통과와 최종 production 실화면을 구분. 초기 RED 선택0/fixture422는 원인 재현FAIL이 아니다. 실제 결함 재현은 red-03.
- SH01 BOM2/3은 입력/미리보기 유지까지, 실제 출하는 표준1/1. 변경 BOM 출하 성공이라 기록 금지.
- RW01 입고1 잔존. PR02 후 최초 수량 복원 결과를 현재 전체 DB로 확대 금지. AS02 취소 후 양쪽 예약0이며, A만 예약1이던 상태는 과거 체크포인트다.
- 소스/로그/화면 원문에는 실제 직원 정보가 있으므로 ignored runtime에만 보관. Git에는 QA 역할·품목코드·정제한 수량/판정/경로만.
- 업무 DB 초기화 금지. 기존 E2E global setup은 3100/8021 합성 DB 전용이며 A/B 실자료 DB에 사용 금지.
- main C:/ERP에는 후보코드 checkout 금지. 정기 동기화 시간과 겹치면 중지/자료 보존, 직원 예약 변경 금지. 운영의 새 거래를 옛 백업으로 덮지 않음.

## 유효한 검사 재사용

T/approval-core.xml 72, io-approval-selected.xml126, restore-shipping-core.xml 중 복귀계약34·출하4, 수정 후 restore-main-adapted.txt18, policy-notifications.xml12·policy-admin-history.xml4, RO80·관련E2E7·ESLint. 각 해시 입력이 그대로면 재실행하지 않는다. 최초 복귀 묶음6FAIL은 단언 계약 수정 전 원문 보존; 전체 묶음을 PASS로 고치지 않는다.

과거592cc5c6/CI38728379582의 설정·삭제·전환·보고 근거는 `reuse-scope-final-inputs.json`/`reuse-scope-final-draft.md`의 정확 범위만 재사용. 103중93파일 LF 내용 같음은 raw byte 동일이 아니다. 과거조건95는 이번95 재실행이 아니다. 현재 전체 기대값 PASS로 승격 금지. 당시 미확인이던 IO5 제외조건·상세wrapper24·Node12는16:35 후속 국소 실행으로 해소했으며 위 보충 영수증을 우선한다. 상세 컴포넌트24통과를 실제 브라우저 clipboard·삭제/복원 업무까지 통과한 것으로 확대하지 않는다. 현재 빌드는 새 근거이므로 과거 초안의 빌드 미실행 문구보다 우선하되 파일 변경 시 영향을 재판정한다.
