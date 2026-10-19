# main·후보 비교 — 현재 재개 지점

## 현재 재개 지점: 2026-10-19 실패 순간 보존 계획 실행

- 브랜치 `codex/mes-main-candidate-comparison-20261016`, 시작 HEAD121706c3. 사용자 검토3038/8038·BOM 초안·연구 요청 보존. 새 synthetic 진단3100/8021만 허용. main·직원 DB/서비스·예약 변경 금지.
- 새 [계획](../../../docs/superpowers/plans/2026-10-19-mes-failure-capture.md)과 [진행 결과](../../../docs/superpowers/plans/2026-10-19-mes-failure-capture-results.md)를 따른다. 아래11:10 차단 기록은 새 실행 승인 이전 기록이다.
- 현재 단계: CP1 도구 안전성·정적 검사 완료, 후보 진단 푸시 준비. Python22·Node12·actionlint·diff check 및 최종 kernel-selftest07 통과. 실제 React 입력 off/on 보존, namespace가 다른 kernel PID 연결, 원 assertion/timeout 전 DB0→cleanup 후1과 trace 보존을 확인. 이 검사는 원 제품 실패 재현이 아니다.
- 원 일반 보고서의 첫 시도301개/64파일과 현재 수집 순서 일치. 일반 E2E는 아직 실행하지 않았다. 다음 행동은 도구 최종 검사 → 후보 진단 커밋/푸시 → 해당 SHA 일반 CI만 취소 → 일반 cohort1회 관찰이다.
- 새 원문: 후보 `_attic/runtime/flaky-capture-20261019`, WSL `/home/hw/mes-flaky-capture-20261019`. 기존 원문·실패·사용자 DB는 그대로다. preflight.json과 starting-working-changes.patch가 현재 실행 시작 기준이다.
- 기존에 미커밋이던 AS 완료 문구·기록은 섞어 커밋하지 않는다. 이번 문서 상단 추가분만 분리한다. 도구 검사는 관련 소스가 동일한 근거를 재사용한다. 제품 코드·전체 기대값·복구·성능 검사를 반복하지 않는다.
- 한계: fixture 준비 단계에서 자체 정리가 먼저 수행되는 실패는 before-cleanup 전체 보존으로 인정하지 않는다. capture partial·kernel 기록 누락·순서 불일치면 진단 한계를 기록하고 제품 원인 확정에 쓰지 않는다.

**2026-10-16 20:35 KST:** 후보 `eddd08118fb8c0e02bb794ffdc19adceacf63c72`까지9커밋 푸시, [CI38886739485](https://github.com/Hw-03/ERP/actions/runs/38886739485)는8/8 job 성공이다. 일반 E2E는299건 첫 통과·2건 재시도 통과다. 원본 읽기 조사 결과 연결 reset 원인과 BOM 입력2→1 처리 순서가 미확정이어서 병합 판단은 보류한다. 업무 비교·production 핵심·상세 기록은 완료했고 종료 문서3개를 별도 커밋/푸시할 단계다. main 반영·직원 배포는 하지 않는다.

먼저 [첫 비교표·업무별8항목 상세](../../../docs/superpowers/plans/2026-10-16-mes-main-candidate-comparison-report.md), [활성 TODO](2026-10-16-mes-main-candidate-comparison-todo.md), [승인 계획](../../../docs/superpowers/plans/2026-10-16-mes-main-candidate-comparison.md)를 읽는다. 과거 중간 인계는 Git의 `eddd0811` 이전 판과 로컬 `R/resume-20261016-1845.md`, `resume-20261016-1925.md`에 보존돼 있다. 과거의 ‘다음 행동’을 현재 지시로 실행하지 않는다.

## 코드·DB·서버 식별값

| 구분 | A 현재 main | B 병합 후보 |
|---|---|---|
| 폴더 | C:/ERP | C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP |
| 브랜치 | main | codex/mes-main-candidate-comparison-20261016 |
| HEAD | 29583972129c8340aa19416e6c554ea60db3c490 | eddd08118fb8c0e02bb794ffdc19adceacf63c72 |
| 코드 구성 | 기존 main 유지 | e9560587에서 대기5927e532 전체 결합, c7c4628f에서 기타 입력 수정 |
| 주소·모드 | http://127.0.0.1:3001/mes · backend8011 · dev | http://localhost:3038/mes · backend8038 · production |
| 활성 검증 DB | C:/ERP/backend/mes.db | C:/ERP/_attic/runtime/main-candidate-20261016/B/qa.db |
| revision | 20261014_0046 | 20261015_0047 |

- R=`C:/ERP/_attic/runtime/main-candidate-20261016`, T=`C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP/_attic/runtime/comparison-checks`.
- 직원 원형 온라인 스냅샷: `R/backups/sqlite/mes-before-comparison-employee-source-20261016-143800-4492139c.db`, SHA256 `5b9b7211ffbe7a5a1cc9218f336d6e05dca02ade1748a000e5236391219d5bb8`. 19:33 재확인도 동일. `R/environment-check-1933.json`.
- 기존 개발 DB 보존: `R/A/development-before-switch.db`. 초기 분기·revision·행 보존: `R/pair-preparation.json`, `A/cutover.json`, `A/original-tables.json`, `B/original-tables.json`.
- B 소유 세션 `R/B/session.json`, boot_id=`782416342c5c4949892993d845a9d3a4`, build_id=`K4aEq29ysft3gVQjFIjku`, `.next-prod`. Node20.20.2는 `C:/ERP/_attic/runtime/tools/node-v20.20.2-win-x64/node.exe`.
- B 상태 확인: `py -3.12 C:/ERP/_attic/runtime/main-candidate-20261016/candidate_server.py status`. 서버 조작이 필요할 때만 이 소유권 도우미를 사용한다. 기존 개발 venv에는 psutil이 없으므로 이 도우미 실행에 사용하지 않는다.
- A/B는 사용자 검토용으로 계속 실행한다. IAB browser2/tabA2/tabB4, 1920×1080 확인. 원래 tab1은 건드리지 않았다. 압축 후 브라우저가 필요하면 `cua.rewriteDocumentation()`부터 호출한다.

## 완료 작업과 정확한 근거

- 같은 직원 원형에서 A/B 사본 분기, QA 계정 준비, 후보 명시 migration. 기존 업무86테이블과 승인 밖 값 보존·SQLite/FK·신규 nullable 백필 없음 확인. 직원 DB·서비스·예약 변경 없음.
- AP01/AP02/IO02/DF01/PR01/DF02/PR02/RW01/AS01/AS02/CONV01/ADJ01/SH01 지정 흐름의 UI 처리·위치 수량·예약·취소 대조 완료. 상세 보고서의 각 `*-comparison.json` 및 실제 화면 경로를 따른다. 숫자 복원과 DB 전체 원복을 혼동하지 않는다.
- SET01 설정 저장/취소/직원 격리, DETAIL01 검색·열린/닫힌 상세 복원·실제 품명 복사, REPORT01 취소 전환 일보와 REPORT02 현재 주 대표 수량 완료. 미실행 조건은 각 상세에 있다.
- B 최종 production의 `PROD-AP01-comparison.json`, `PROD-DF01-comparison.json`, `PROD-SH01-comparison.json` 완료. 부 담당자의 다른 공정 승인, 기타 메모 입력58px, 창고 복귀·한 작업 취소, 기본 BOM 출하·역순 취소까지 확인했다.
- BOM2·3은 입력 직후 다음/뒤로에서 유지 확인 후 실제 제출은 기본1·1로 복원했다. 변경 BOM을 실제 출하한 검사가 아니다.
- 일반 조회240회 오류0, 목록/검색/상세 응답 동일·지연 회귀 기준 내. 내역의 AS 승인자/시각 차이는 원형과 B 일치. `R/performance-run-02/summary.json`, `history-approval-display-review.json`. 원래 INCONCLUSIVE를 덮어쓰지 않고 별도 판정했다.
- 보고서 복원 때문에 기존 업무를 재실행하지 않았다. 이후 묶음마다 상세8항목·첫 표·TODO를 갱신했다. 로컬 갤러리 `R/documentation-paired-screens.md`, 원문 색인 `documentation-evidence-index.json`은 실제 직원 정보가 있어 ignored에만 보관한다.
- 읽기 감사: `R/final-local-review.md`, `final-completion-audit.md/json`, `final-doc-readonly-audit-1927.md`. 마지막 감사의 현재/과거 재개 지점 혼동은 이 문서의 단일 현재 블록으로 정리한다. 근거 경로 누락·과장·직원 개인정보 노출은 발견되지 않았다.

## CI 경과와 재사용할 검사

- 첫 CI38877549662: 프론트8실패(WorkChoice 관찰자 대역7·실사 회차 순서1), backend 알림의 옛 권한 기대1실패. `6f9a6aff`와 `5a77fbf1`에서 시험3파일만 보완했다. WorkChoice19·Stocktake92·ESLint·알림선택자1 및 원장check 통과. 제품 변경 없음. 실패·취소 원문은 `T/ci-38877549662-*`에 보존.
- 395cab9c/CI38882322838: 프론트4,601과 pytest/PostgreSQL 단계 성공, 마지막 OpenAPI description2곳만 실패. `7143b5c8`에서 기준 설명2줄만 갱신했고 전체 생성 명세와 SHA256 동일. `T/ci-openapi-red.json/.log`, `ci-openapi-green.json/.log`. 일반 E2E는 후속 푸시로 취소/미완료.
- 현재 eddd0811/CI38886739485: 프론트374파일4,601·커버리지·lint/type/build/bundle 성공. backend pytest·복구 readiness·PostgreSQL·OpenAPI까지 성공. `T/ci-eddd0811-frontend-success.log`, `ci-eddd0811-backend-success.log`, `ci-eddd0811-postgres/`. 번들3,379,878bytes≤3,407,872bytes(3.25MiB). 일반 E2E job도 성공했으나299첫통과·2재시도통과·0skip을 구분한다.
- 기존 유효 국소 근거: 권한72, IO126, 복귀확장34·출하4, 일괄복귀 계약 수정 후18, 정책소비자16, 보충IO5·상세24·Node12, RO단위80·E2E7(재시도0)·정적 검사·production 빌드. 정확 경로와 범위는 보고서 재사용 부록 및 `R/supplemental-checks-record.md`.
- 과거592cc5c6/CI38728379582의 선정9파일95조건은 당시 근거다. `R/reuse-scope-final-inputs.json`, `reuse-scope-final-draft.md`의 입력/조건 범위만 재사용. LF 정규화 동일과 raw SHA 동일을 구분한다.
- 소스입력967에는 시험도 포함됐다. 후속 시험3파일이 바뀐 뒤 전체967동일이라 주장하지 않는다. 제품 소스는 c7 이후 그대로이며 후기 변경은 시험·원장·API 설명·기록뿐이다.
- 원장 현재1,058조건 NOT_RUN과 과거 bindings/execution/원문을 보존했다. 이번 대표 UI·CI 성공을 전체 기대값의 새로운 PASS로 승격하지 않는다.

## 진행 중인 단계와 바로 다음 행동

1. CI watch6561은 완료됐다. `T/ci-eddd0811-result.json`에8job 성공을, `ci-eddd0811-general-success.log`와 `ci-eddd0811-playwright-general/`에301조건 중299첫통과·2flaky·0skip을 보존했다. CI 상태만 보고301첫통과라 쓰지 않는다.
2. 읽기 전용 조사 완료: R/ci-flaky-io-review.md 및 ci-flaky-shipping-review.md. IO 최초 실패 구간의 조립/창고 보존과 취소 응답은 확인했으나 reset 원인·취소 후 예약 전체 복원은 미확인. BOM은 실제 매칭 본문도1이고 기본BOM 응답은 입력 전 완료돼 지연 응답 덮어쓰기 가설은 배제했다. 실제 이벤트/state 순서와 재현 원인이 없어 추측패치하지 않는다. 둘 다 직원 영향0이라고 단정하지 않는다.
3. 결과에 맞춰 상세 첫 표·활성 TODO·이 인계의 종료 판정을 확정한다. main 원격이 여전히29583972인지 읽기 확인한다. 다른 세션 파일을 자동 포함하지 않는다.
4. 종료 문서만 명시 stage·cached check·smart PlanOnly·링크 검사, 기존 검사 도구의 유효 통과 근거 재사용 후 실제 날짜의 한국어 제목으로 후보에 커밋/푸시한다. 문서 후속 HEAD CI도 확인해 최종 응답에 정확히 구분한다. 종료 문서 자체 해시를 그 문서 안에 미리 단정하지 않는다.
5. A/B 검토 환경과 근거는 남긴다. 복원 절차는 보고서 ‘개발 DB 복원’ 절을 따른다. 이번에 복원·main 병합·직원 배포는 실행하지 않는다.

## 남은 한계·주의

- A/B 공통: 취소된 이동의 내부 io_batch가 completed로 남음. 요청/라인·관측 UI·재고는 취소 정상이나 전체 소비자 영향까지 확인하지 않았다.
- A/B 공통: AS 전용 완료 모달의 ‘창고 결재’ 문구. 실제 AS 담당 승인·취소는 정상이며 문구 수정은 하지 않았다.
- 실사 CI 내부 effect 순서는 미확정. 취소된 general 로그의 proxy ECONNRESET도 원인 미확정이다. 발생시각이 job 취소 전이므로 전부 취소 탓으로 돌리지 않는다.
- 현재 일반 E2E의 연결 reset·BOM2→1도 원인 미확정이며 별도8항목 기록을 보고서에 추가했다. 원인 조사를 이어갈 경우 새 업무가 아니라 이2조건의 서버/입력 이벤트 관측부터 시작한다. 전체 반복·무조건 재시도·원인 미확정 패치는 하지 않는다.
- 역할 회수/중복/동시 처리 등은 관련 자동·과거 근거와 신규 UI 조건을 구분한다. 모든 조합을 새 화면에서 반복한 것이 아니다. 실제 자료 부재·미실행은 상세에 남겼다.
- RW01 원자재 입고1과 QA-W dark/collapsed 설정은 검토 DB에 남는다. 현재3-AR-0004는 총440/창고439/조립1/예약0. B 추가 production의 정상·취소 이력도 남는다.
- A/B 업무 DB에 기존 E2E global setup·seed/reset을 실행하지 않는다. 합성 E2E의3100/8021 환경과 혼용 금지. PIN·직원 원문·DB·화면은 커밋하지 않는다.
- main의 C:/ERP에 후보 코드를 체크아웃하지 않는다. 정기 동기화와 겹치면 비교를 중지하고 자료를 보존한다. 직원 예약·서비스를 바꾸거나 새 운영 거래를 옛 백업으로 덮어쓰지 않는다.
