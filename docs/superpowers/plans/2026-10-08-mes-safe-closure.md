**추천 모델: GPT-6 Astra** — 재고 정합성·성능·코드와 DB 복구를 함께 판단한다.
**추천 추론 수준: Extra High** — 위치 오류·동시 처리·검증 누락·복구 실패를 교차 검증한다.
**실행 방식: 하위 에이전트 병렬 작업** — 정책·성능·복구를 분담하고 부모가 원장·브라우저·통합 검증·Git을 담당한다.

# DEXCOWIN MES 추천안 적용 및 안전성 검증 최종 마무리

**GOAL:** 현재 격리 작업본에 추천안 세 가지를 적용하고, 전체 기대값·성능·위치별 재고·코드와 DB 복구 검증을 완료하여 기능별 커밋을 작업 브랜치에 푸시하고 최종 CI 성공까지 확인한다.

2026-10-08 사용자가 이 계획의 실행을 승인했다. 앞선 2026-10-07 계획을 이어서 수행하되 최종 목적지는 작업 브랜치이며 main 반영·직원 배포는 제외한다.

2026-10-10 사용자 범위 조정: 일반 품목·상세에서 이번 변경으로 생긴 회귀만 국소 검사·최소 수정으로 확인한다. 기존에도 느린 무거운 조회의 모든 부하 2초/10초 달성은 후속 과제로 분리하고 미충족 원문을 보존한다. 추가 최적화 탐색·전체 검사 반복을 중단하며 유효한 근거를 범위에 맞춰 재사용한다. 최신 소스의 전체 기대값 strict 재실행도 미실행으로 정직하게 기록한다. 남은 최종 코드·DB 복구→기능별 커밋→작업 브랜치 push→정확한 HEAD CI를 완료한다. 기존 CI의 전체 테스트·커버리지·빌드·번들·PostgreSQL 검사는 유지하고, 새 원장 CI는 원장 구조·증거 상태를 검사한다. 새 strict 전체 완료 검사는 후속 과제다. main 반영·직원 배포는 계속 제외한다.

## 환경과 소유권

- 기존 mes-expectation-closure 워크트리와 복제 DB를 사용한다. 작업 브랜치: `codex/mes-expectation-closure`.
- 시작 소스·DB 복구 사본과 영수증은 `_attic/runtime/closure/resume/latest.json`에서 찾는다.
- C:/ERP 다른 세션의 미커밋 내용, 원본 개발·직원 DB/서비스/예약 작업은 수정하지 않는다.
- 복제 실자료는 조회·마이그레이션 보존 검사, 별도 합성 DB는 업무 생성·취소·경합에 사용한다.
- DB 절대경로·스키마·해시·포트·소유 프로세스를 확인하고 보호 환경이면 실행을 거부한다.

## 확정 정책

1. 주간보고 동결 예외를 이번 범위에 한해 허용한다. 생산 0/PF 픽업 양수인 주의 모델표, KST 월요일 포함/다음 월요일 제외, 전체 정상재고 합계와 basis별 설명, 집계·검산·분류 안내를 수정한다. 재작업 불량/폐기 자식의 입고+불량 두 열 계산은 유지한다. 전면 재설계하지 않는다.
2. 출하 부족 검사는 최종 PF·동반 출하품의 가용재고/예약 기준으로 유지한다. BOM 구성품 부족만으로 이미 생산된 PF 출하를 막지 않는다. 기대값만 이 확정 정책에 맞춘다. 품목 삭제·BOM 변경·중복 요청·예약 부족 차단은 유지한다.
3. 직원 생성에서 메뉴 설정 생략 시 admin을 숨긴다. 명시 설정을 존중하며 기존 직원 수정에서 생략한 설정은 그대로다. 기존 직원·PIN·독립 결재 역할은 불변이다. 추가 등급/권한 체계를 만들지 않는다.

기존 0041~0043과 API를 사용하며 새 업무 API/컬럼은 기본적으로 추가하지 않는다. 회귀 수정은 기대값 충족과 이번 변경의 영향으로 한정한다.

2026-10-08 원격 main `353ee530` 통합: 튜브 원자재 입출고·전용 업체 기능을 작업 브랜치에 함께 보존한다. `20261008_0044`는 기존 `20261007_0043`과 main의 `20261008_0041`을 연결하는 무변경 merge revision이다. 최종 복구 대상은 0044로 갱신하며 두 부모 migration은 변경하지 않는다. 기존 모든 컬럼의 값은 보존하고, main에서 승인된 suppliers.scope 기본 warehouse 추가를 구분해 검증한다. 창고/튜브 반품 진입과 실제 튜브 TR 원건의 전용 업체 선택을 보존한다.

## 분담과 순서

- A: 주간·직원 정책과 관련 pytest/Vitest. 공유 원장·문서는 부모 소유.
- B: main 대비 읽기 성능·합성 증가/동시 사용 검증, 필요한 조회 수정. 서비스 프로세스 사용은 부모와 포트/시간을 조율한다.
- C: DB 보존·원격 main 통합 후 0044 공동복구, 실제 격리 프로세스 생명주기 검증 도구. 최종 빌드는 입력 고정 뒤 부모와 순차 실행한다.
- 부모: 출하 기대값·정책 연결, 기존 모든 조건 통합, UI 검증, 독립 사양/코드 리뷰, 최종 검사와 Git.
- 관련 RED→최소 수정→GREEN을 먼저 수행한다. 전체 검사는 입력 고정 뒤 한 번, 이후는 영향받은 검사만 반복한다.

## 성능 통과 기준

- 동일 논리 자료·런타임에서 메인/작업본 순서를 번갈아 내역 목록/검색/상세·일보·재고·정합성을 측정한다.
- 각 조회는 준비 호출 후 30회×3묶음, 최초 호출 별도. p95가 기본판보다 20%와 100ms를 모두 초과해 증가하면 실패다. 일반 목록/상세 p95 2초, 정합성 전체 10초도 상한이다.
- 합성 자료량 증가와 1/10/30명 동시 사용을 확인한다. 예상 업무 충돌과 서버 오류를 구분한다.
- 각 자료량·조회별 단독 30회×3묶음은 모두 측정한다. 동시 사용은 실자료와 최대 합성 자료량에서 목록/검색/상세/일보/재고/정합성 요청을 섞어 1/10/30 동시도로 실행하되, 각 조회가 버전별·동시도별로 묶음마다 30회씩, 총 90개 측정 표본을 갖게 한다. 준비 호출·최초 호출은 이 표본 수에서 제외한다. 혼합 전체 30회를 조회들에 나누지 않으며 실제 각 버전·묶음의 표본 수로 완료를 검증한다. 자료량 증가와 동시도의 전체 조합을 추가로 반복하지 않는다. 측정 중 다른 전체 검사·빌드는 중지한다.
- 쿼리 수·읽은 행·응답 크기·실행 계획을 분석한다. 전체 이력 재구성과 정합성 상세를 우선 점검한다. 결과 의미를 삭제/축소하거나 기준을 올려 통과시키지 않는다.

## 정합성·복구 검증

- 창고/서로 다른 부서/격리/예약을 셀별 비교하고 다른 품목·위치 불변을 검사한다. 복귀 재고의 실제 후속 사용까지 수행한다.
- 불량/B급/구형×부분/전량×단건/일괄 및 PC/모바일을 검증한다. 중복·중간 실패·역순 취소·동시 승인/사용/취소에서 추가 반영 없음과 원복을 확인한다.
- 복제 DB의 기존 모든 행·컬럼·연결을 비교한다. 승인된 employees.level 삭제만 제거 예외이며 신규 nullable 필드를 백필하지 않는다.
- 최종 0044 설치→강제 종료→명시 재개→이전 DB·코드·프론트·Node 정확 복원을 확인한다. 변조·다른 대상·경쟁 쓰기·불확실 소유권을 거부한다.
- 운영 경로 제한을 완화하지 않고 테스트 전용 어댑터로 실제 격리 서버의 상태/조회/종료/포트 해제를 확인한다. 운영 산출물의 바이트 복원 검사와 QA 주소 production 빌드 기동 검사는 구분한다.
- 실제 직원 예약 작업/배포 후 재개는 실행하지 않는다. 배포 전 쓰기 중지·확인·재개 순서는 안내에 남긴다.

## 최종 검사·종료

- 코드·테스트·설정 고정 후 전체 백엔드, 프론트 타입·정적·테스트·커버리지, production build, 승인된 3.00MB 번들 검사를 수행한다.
- 전체 기대값의 필요한 자동/브라우저 근거를 수집하여 promote하고 엄격 완료 검사를 통과한다. 대상 조건에 누락·SKIP·PARTIAL·FAIL·NOT_RUN을 남기지 않는다. 과거 관찰은 현재 PASS가 아니다.
- 필요한 PostgreSQL 검사는 격리 인스턴스 또는 CI에서 실제 실행한다. 환경 부재 skip은 통과로 보고하지 않는다.
- 독립 사양 검토 뒤 코드 품질 검토를 수행하고 완료를 막는 지적을 해결한다.
- 기능 커밋 순서: 스키마·보존→직원·부서→품목·BOM→입출고·불량→내역·일보→출하·주간→성능→복구→검증·문서. 공유 파일은 부분 stage한다.
- 커밋 직전 실제 날짜, 한국어 제목, staged 목록/diff/check 및 필요한 검증을 확인한다. 원격 main 변경은 작업 브랜치에서 정상 통합하고 영향 영역을 재검증한다. 강제 push하지 않는다.
- 작업 브랜치만 push하고 최종 HEAD CI 성공까지 확인한다. source DB·자격증명·실직원 원문·대용량 진단은 커밋하지 않는다.
- TODO·가이드·스킬·기대값 결정을 갱신한다. 전용 프로세스/포트를 정리하고 복구·재현 자료는 보존한다.
- 최종 보고: 브랜치/커밋/CI, 성능 비교, 위치별 검증, 복구 결과. 상태는 작업 브랜치 검증 완료·main 미반영·직원 환경 미적용이다.

## 2026-10-08 후속 근거의 범위 — IN_PROGRESS

- 프론트 최신 native 실행은 340파일·3,790 PASS·0 SKIP과 lint·타입·커버리지 exit 0, 입력 938소스 불변을 확인했다. 이전 실행과 합산하지 않으며 backend·브라우저·복구·CI 완료를 대신하지 않는다. [프론트 영수증](../../../_attic/runtime/closure/final-frontend-native-001/receipt.json).
- ignored `submission-metadata-pack-001`은 210개 전체 응답 동등성에도 30동시에서 3.29~3.31초로 2초 기준을 넘으므로 **NO ADOPTION**이다. 제품에 반영하지 않는다. warm cProfile은 준비 호출 뒤 단독 요청의 진단이며 cold나 동시 성능 판정을 대신하지 않는다. [후보 비교](../../../_attic/runtime/closure/performance/submission-metadata-pack-001/comparison-summary.json), [warm 구간](../../../_attic/runtime/closure/performance/submission-warm-cprofile-001/phases.json).
- SQLite 역거래 존재 검사는 문자열 PK만 CAST하고 숫자·REAL·BLOB·NULL은 기존 비교를 유지하도록 제품에 반영했다. 관련 최종 [contract GREEN](../../../_attic/runtime/closure/performance/reversal-affinity-contract-green.xml)은 73 PASS·0 SKIP·native exit 0이며, 최초 `reversal-affinity-red.xml`의 fixture 오류와 실패 1건이 남은 `reversal-affinity-green.xml`은 실패 이력으로 보존한다. [HTTP 비교](../../../_attic/runtime/closure/performance/reversal-affinity-http-001/receipt.json)는 native exit 0, 전체 본문 40개 동등·앱 185소스/DB hash 불변이다. [읽기 전용 SQL 진단](../../../_attic/runtime/closure/performance/sql-execution-probe-003/queries.json)은 같은 전체 16행을 반환하며 각 5회 측정의 중앙값이 약 65~75ms에서 3.9~5.6ms로 줄었다. 독립 읽기 검토에서 기존 비교 의미의 추가 차단 결함은 발견하지 못했지만 PostgreSQL 실제 실행은 미확인이고, 새 변경 후 mixed 성능은 아직 측정하지 않았다. 2초 기준 충족이나 전체 성능 PASS를 뜻하지 않는다.
- 불량 연결 후보의 60초 초과 탐색 중단도 제품에 반영했다. 안정 정렬·사용된 원건 제외·최초 일치 선택·정확히 60초 포함을 유지하며 관련 4파일 [124 PASS·0 SKIP](../../../_attic/runtime/closure/performance/defect-window-contract-green.xml)를 확인했다. [별도 진단](../../../_attic/runtime/closure/recovery/defect-window-probe-002/receipt.json)의 합성 전체 그룹 비교 2,060회와 실제 cold 6,093행/warm 1,306행 두 호출의 그룹 결과 동등성은 테스트 수와 합산하지 않는다. 실제 warm 입력의 함수 단독 ABBA 중앙값 41.665→4.835ms는 matcher 비교 감소의 근거이며 전체 알고리즘 O(N)이나 30동시 HTTP 성능 통과를 보장하지 않는다. 정상 nullable 문자열 도메인 밖의 정수 actor는 이전 오류가 시간 밖 탐색 중단으로 생략되는 한계가 있다. 주석·타입 보완 후 [불량 2개](../../../_attic/runtime/closure/performance/defect-window-annotations-green.xml)와 [역거래 1개](../../../_attic/runtime/closure/performance/reversal-affinity-annotations-green.xml) 재검사는 각각 기존 124개·73개와 중복 합산하지 않는다.
- 후속 GROUP MAX 보완까지 제품 소스를 고정했다(`transactions.py` SHA `f1493c52…`). MATERIALIZED source 재사용·26+26+32 고정폭 anchor와 기존 guard/fallback을 유지한 관련 [95 PASS·0 SKIP](../../../_attic/runtime/closure/performance/submission-groupmax-tdd/final-related.xml), Ruff·native exit 0을 확인했다. [완료 영수증](../../../_attic/runtime/closure/performance/submission-groupmax-tdd/completion.json)은 PostgreSQL 실제 실행과 정식 2초 판정은 미확인으로 구분한다. 역거래 affinity·불량 60초 탐색·GROUP MAX 세 변경을 함께 비교한 [final-read-http-001](../../../_attic/runtime/closure/performance/final-read-http-001/receipt.json)은 native exit 0, 전체 본문 40개 동등·앱 185소스/읽기 전용 복제 DB hash 불변이다. 앞선 검사 수와 합산하지 않으며 후속 전체 순회·구간 진단은 아래 별도 근거로 기록한다.
- [최종 입력 전체 순회](../../../_attic/runtime/closure/performance/final-read-all-pages-http-001/receipt.json)는 native exit 0, 전체 응답 435개 동등·앱 185소스/DB hash 불변을 확인했다. 실복제 33페이지와 합성 400페이지 모두 순회를 완료했으며 추가 cold 응답을 포함한 435개를 페이지 수로 쓰지 않는다. [실복제 구간 진단](../../../_attic/runtime/closure/performance/final-read-real-phases-001/summary.json)의 1/10/30사용자 timed HTTP 총 90회는 모두 200이지만 각 조회는 세 표본뿐이다. 30사용자 작업 그룹은 3.54~3.64초로 여전히 2초 상한 FAIL이며 정식 30회×3묶음 protocol PASS가 아니다. 정합성 599-query 분석은 개선 후보 검토이며 완료 근거가 아니다. 새 화면 검사·최종 backend·canonical·실제 복구·커밋·push·CI는 미완료다.
- 후속 [current-metadata-pack-paired-001](../../../_attic/runtime/closure/performance/current-metadata-pack-paired-001/paired-001/receipt.json)의 현재 소스 기준 AB/BA 두 비교는 각각 전체 응답 70개 동등·native exit 0·앱 185소스/DB hash 불변을 확인했다. 후보 작업 그룹은 30사용자에서 2.88~3.13초로 원문 경로보다 빨랐지만 2초 상한을 넘었으므로 **NO ADOPTION**으로 결정했다. 조회별 세 표본의 진단이며 `formal_acceptance_evidence=false`다. 제품에 반영하지 않고 정식 성능 PASS로 승격하지 않는다.
- 이후 정합성 PK 일괄조회와 snapshot 필요 열 읽기를 제품에 반영했다. [PK 관련 검사](../../../_attic/runtime/closure/recovery/integrity-pk-bulk-001/verification-summary.json)는 123 PASS·0 SKIP·native exit 0, [읽기 폭 관련 검사](../../../_attic/runtime/closure/performance/integrity-snapshot-width-tdd-001/completion.json)는 144 PASS·0 SKIP·native exit 0이며 중복 합산하지 않는다. 최종 `inventory_integrity.py` SHA는 `a3fa75e3…`다. 유효한 [integrity-bulk-width-http-002](../../../_attic/runtime/closure/performance/integrity-bulk-width-http-002/receipt.json)는 전체 40본문 동등·앱 185소스/DB 불변과 실복제 정합성 쿼리 599→226/18,153행 동일, 합성 29→29/20,203행 동일을 확인했다. [직접 도구 종료 관찰](../../../_attic/runtime/closure/performance/integrity-bulk-width-http-002/native-observation.json)은 native exit 0이다. 앞선 [-001](../../../_attic/runtime/closure/performance/integrity-bulk-width-http-001/native-observation.json)은 마지막 영수증 상대경로 기록 오류로 native exit 1이며 미통과로 보존한다.
- [후속 구간 진단](../../../_attic/runtime/closure/performance/integrity-bulk-width-real-phases-001/summary.json)의 30사용자 세 표본은 작업 그룹 3.87~4.16초, 정합성 5.95~6.93초다. 그룹은 2초를 초과하지만 정합성은 별도 10초 상한 안이다. 추가 phase 계측이 있는 unpaired 진단이므로 변경이 지연을 늘렸다고 단정하거나 정식 성능 PASS/FAIL 판정을 대신하지 않는다. AB/BA 비교 준비와 원래 canonical benchmark의 최종 재판정은 대기 중이다.
- 후속 [정합성 AB/BA 비교](../../../_attic/runtime/closure/performance/integrity-paired-current-001/paired-001/comparison-summary.json)는 전체 140본문 동등·native exit 0·소스/DB 불변을 확인했다. 같은 18,153행을 유지하며 쿼리 599→226, endpoint thread CPU 중앙값 1,687.50→1,390.62ms와 HTTP wall 중앙값 5,671.50→5,032.58ms를 관측했다. 앞선 unpaired 진단과 구분하며 `formal_acceptance_evidence=false`인 국소 개선 근거다.
- [canonical benchmark 진단](../../../_attic/runtime/closure/performance/integrity-width-canonical-diagnostic-001/report.json)은 [native exit 0](../../../_attic/runtime/closure/performance/integrity-width-canonical-diagnostic-001-exit.json)이지만 조회별 3회×1묶음으로 `complete_protocol=false`, `complete_matrix=false`, `accepted=false`다. 측정 60조건 중 12개가 진단 기준 미달이며 절대상한 4개·상대회귀 8개다. 실복제 u30 그룹은 main 9,015.5→현재 2,933.7ms, 합성 20,000 u30 일보는 30,566.0→3,717.5ms로 각각 2초를 넘는다. 실복제 u30 정합성은 11,169.7→4,915.0ms로 10초 안이지만 모두 세 표본의 진단값이다. `a3fa75e3…` 입력·앱 185소스·12개 worker DB 불변과 적용 대상 응답/조회 모집단 조건은 확인했으나 정식 성능 판정은 미완료다.
- [CI workflow](../../../.github/workflows/ci.yml)에 기존 PostgreSQL 5개 이후 PG16 도구·비 root·격리 DB head/테이블 준비와 추가 PostgreSQL 계약 53개/도구 단위 6개 실행을 적용했다. 두 JUnit과 native 종료 코드·수집 수·SKIP 거부 영수증을 보존하도록 구성했지만 실제 PostgreSQL 실행 통과는 아직 없다. 과거 SKIP 57개와 이후 snapshot 1개를 실제 실행하려는 구성 변경이다. 정적 검토와 적용안 대조만 확인했으며 실제 CI는 미실행이다.
- crash harness 19개와 ignored wrapper 9개 회귀는 각 범위에서 통과했지만 합산하거나 실제 복구 완료로 바꾸지 않는다. `failure-resume`·`hard-exit`·`normal` 실제 세 시나리오는 모두 NOT_RUN이다. [crash 검토](../../../_attic/runtime/closure/recovery/crash-audit-summary.json), [wrapper 검토](../../../_attic/runtime/closure/recovery/wrapper-binding-summary.json).
- 성능 acceptance는 여전히 FAIL이며 최종 backend 전체 검사·canonical full 9그룹·실제 복구·기능별 커밋·push·최종 HEAD CI는 미완료다. 원래 승인 기준과 완료 조건을 유지하고 [결과 문서](../specs/2026-10-08-mes-safe-closure-results.md)에 범위별 근거를 연결한다.

### 확정된 좁은 조회 보완과 독립 DB 보존 — 2026-10-08

- 일보의 `_batch_name_map` 호출에 기존 `include_line_details=False`만 명시했다. 소비하지 않는 IoBundle/IoLine 표시 유형 SQL을 1회에서 0회로 줄이고 요청자·승인자·시각·history_batch·로그·수량은 보존한다. 실제 전체 HTTP 본문 2건 동등, RED 2개 뒤 GREEN 2개와 관련 20 PASS·0 SKIP, Ruff·diff·native exit 0을 확인했다. [완료 영수증](../../../_attic/runtime/closure/performance/daily-line-detail-tdd-001/completion.json). 해당 일보 소스 SHA는 `ce35c3c4…`이며 새 성능 PASS 근거는 아니다.
- 제출 envelope의 `kind IS NULL OR kind != 'CANCELLATION'` 한 조건만 `COALESCE(kind, '') != 'CANCELLATION'`으로 바꿨다. 기존 UUID·날짜 guard, CTE·cursor·limit·fallback·응답 범위는 유지한다. 전체 typed 1,306행의 16개 값·타입·순서를 보존하는 비용 계약 RED→GREEN 1개와 관련 95 PASS·0 SKIP, Ruff·diff·native exit 0을 확인했다. [TDD](../../../_attic/runtime/closure/performance/envelope-kind-coalesce-tdd-001/green-receipt.json), [실복제 2SELECT 대조](../../../_attic/runtime/closure/performance/envelope-kind-coalesce-tdd-001/actual-typed-receipt.json). `transactions.py` SHA는 `f1493c52…`에서 `8d08fe43…`로 갱신했다. 앞선 교대 SQL 진단의 약 6ms 개선은 [진단 전용](../../../_attic/runtime/closure/performance/envelope-kind-coalesce-001/receipt.json)이며 HTTP 2초 기준 통과로 사용하지 않는다.
- 별도 실복제 0038→0044 DB 보존 실행은 `REAL_0038_TO_0044_DB_PRESERVATION_ONLY` 범위에서 PASS·native exit 0이다. 기존 테이블의 모든 행·컬럼 값은 승인된 `employees.level` 제거만 제외하고 동일하며 테이블 면제는 없다. [DB 영수증](../../../_attic/runtime/closure/recovery/db-preservation-0044-001/receipt.json), [종료](../../../_attic/runtime/closure/recovery/db-preservation-0044-001/exit.json). 0040의 submission·reason backfill은 [기존 main revision과 줄바꿈 정규화 후 동일](../../../_attic/runtime/closure/recovery/db-preservation-0044-001/0040-main-equivalence.json)한 동작이며 신규 백필로 설명하지 않는다. 0041~0043 nullable 추가값은 NULL, main의 suppliers.scope 추가값은 warehouse다. 원본·baseline DB 바이트와 migration/model 소스 불변을 확인했지만 `paired_artifact_restore_executed=false`이므로 실제 코드·프론트·Node 공동복구 완료를 뜻하지 않는다.
- 후속 UUID 공유 객체 캐시는 기존 반환 객체별 독립성이 달라져 NO-GO, 정수만 캐시하고 UUID를 새로 만드는 대안도 같은 실제 입력 replay의 모든 비교에서 느려져 NO-GO다. 둘 다 제품 미채택·native exit 0이며 새 DB/GET을 실행한 정식 성능 결과가 아니다. [공유 객체 경계](../../../_attic/runtime/closure/performance/uuid-cache-prototype/replay-receipt.json), [정수 replay](../../../_attic/runtime/closure/performance/uuid-cache-prototype/int-cache-replay-receipt.json), [종료 관찰](../../../_attic/runtime/closure/performance/uuid-cache-prototype/native-observation.json). 효과 nested JSON 후보도 SQLite `json_valid`가 literal NUL 뒤 원문을 유효하다고 판단해 기존 JSONDecodeError를 숨기는 반례로 NO-GO·미채택이다. [결과](../../../_attic/runtime/closure/performance/nested-json-nogo-001/result.json), [종료 native 0](../../../_attic/runtime/closure/performance/nested-json-nogo-001/exit.json). 원래 raw processor·오류 경로를 유지하며 추가 실험은 종료했다.
- 현재 모든 제품을 동결했다. 고정 SHA는 transactions `8d08fe43…`, daily `ce35c3c4…`, integrity `a3fa75e3…`, effect history `c5f02fbf…`, UUID base `d6981f3e…`다. [정식 실행 소스 manifest](../../../_attic/runtime/closure/performance/final-coalesce-formal-001/source-hashes.json)를 입력으로 부모의 승인된 30회×3묶음 성능 검증이 진행 중이다. 이 기록에서 완료 확인한 범위는 실복제·합성 1,000·5,000의 endpoint/users=1 세 scenario이며 각 조회·버전이 90표본이다. [부분 비교](../../../_attic/runtime/closure/performance/final-coalesce-formal-001/comparisons.json). 성능 전체·새 전체검사·실제 공동복구·커밋·CI는 미완료이며 원장 NOT_RUN, 체크리스트 2완료·7미완료와 전체 IN_PROGRESS를 유지한다. 기능별 경계를 유지하되 커밋 개수를 고정하지 않으며 최종 HEAD CI 성공 뒤 활성 TODO 갱신에 별도 문서 커밋이 필요할 수 있다.
