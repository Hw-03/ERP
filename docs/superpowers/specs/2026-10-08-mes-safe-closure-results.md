# DEXCOWIN MES 안전성 최종 마무리 결과

**상태: IN_PROGRESS — 최종 통합 검증 진행 중**

2026-10-10 사용자 지시로 성능 완료 범위를 축소했다. 무거운 조회의 모든 부하 2초/10초 목표와 최신 원장 전체 재실행은 후속 과제이며 기존 FAIL·NOT_RUN을 유지한다. 실패한 limiter·인증 세션 실험은 원문을 보존하고 제품에서 제거했다. 채택 코드의 앱 186개가 n5 입력과 바이트 일치하며 일반 품목 p95 247.933→313.909ms, 상세 323.577→268.164ms는 기존 상대 회귀 기준을 충족한다. 복원 후 관련 pytest 33개·Ruff·diff 검사도 통과했다. n5 각 판 내부 응답은 안정적이고 모집단이 일치하지만 메인과 작업판의 전체 응답 SHA가 같다는 뜻은 아니다. 무거운 묶음 4,116.804ms·정합성 14,938.241ms는 절대 상한 FAIL로 남긴다. 추가 최적화와 전체 검사 반복을 중단하고 유효한 과거 근거를 범위에 맞춰 재사용한다. 코드·DB 최종 복구, 잔여 커밋, 작업 브랜치 push 및 해당 HEAD CI를 이어서 완료한다. main·직원 환경에는 적용하지 않는다. 아래 시각별 기록은 당시 상태다.

**기록 기준: 2026-10-10 KST. 최종 PASS 또는 배포 준비 완료 판정 전 초안이다.**

현재 소스와 C13 실행 snapshot이 달라 C13의 조건 1,058개 실행 근거를 원장의 `historicalExecutions`로 보존하고 현재 실행은 전부 `NOT_RUN`으로 표시했다. 당시 C13의 실행·승격·strict 성공은 역사적 사실이며 현 소스의 전체 통과 판정이 아니다. 이번 CI의 새 원장 job은 구조·selector·생성 결과를 `--check`로 검사한다. `--require-complete`와 현 소스의 전체 실행·증거 재승격은 후속 과제다. 기존 main CI의 백엔드·프론트·PostgreSQL 검사는 유지한다.

2026-10-10 01:49 KST 현재: [n7 실제 비교](../../../_attic/runtime/closure/performance/n7/runs/native-639416ac586d4972ac2ff305e78c32ec/report.json)는 native 1·실자료 u10의 6 PASS/4 FAIL이다. 내역 묶음 p95 15,424.316→3,349.076ms, 정합성 34,763.220→12,196.321ms는 절대 상한을 넘었다. 일반 품목 318.718→620.854ms와 상세 317.547→602.742ms는 상대 회귀였다. 모든 HTTP 200·응답/모집단 동일·소스/준비 입력/보호 불변이며 소유 PID 6개 부재와 포트 해제를 부모가 다시 확인했다. 보고서 SHA `5e969e22…`, 나머지 u30은 NOT_RUN이다. 이 후보도 최종 채택하지 않는다.

PIN 인증 후 대기하는 연결 보유는 실제 인증 ASGI 회귀에서 RED를 확인했다. 라우트 전용 짧은 인증 세션과 limiter 뒤 새 handler 세션으로 수정한 뒤 관련 120개·Ruff를 통과했다. 테스트용 공유 Session을 닫는 fixture 충돌도 재현하고 해당 관리자 테스트 모듈의 요청별 SAVEPOINT Session으로 해결했다. 이후 fixture 타입 힌트만 추가하여 해당 모듈 6개·Ruff를 다시 통과했다. PIN 입력 우선순위·직원 식별 문자열·오류 응답·대기 요청 취소와 연결 반환은 검사했고, native 성능 개선으로 확대하지 않는다. 복구 연결 준비는 순수 24개·구문·원형 AST/해시 보존을 통과했지만 실제 최종 공동복구는 아직 실행하지 않았다. 최종 소스의 동시 조회 비용을 추가 진단하며 원격 main은 여전히 기준 커밋과 같다.

2026-10-10 01:27 KST 현재: 기능별 로컬 커밋은 `214330e5`, `9a1525d8`, `162d0adc`, `35ed8bd0`, `8de38c69`, `41f5172f`까지 완료했다. 각 staged 목록·차이·공백 검사와 실제 날짜·제목을 확인했다. 부분 스테이징으로 staged와 작업본이 달라 smart preview는 충돌을 보고했으며 실제 게이트를 실행하지 않았다. 해당 단계의 기존 기능 검증·누적 staged import 근거를 적용 범위에 한해 재사용했다. 원격 push는 아직 하지 않았다.

공유 입장 제한 후보의 [n6 실제 비교](../../../_attic/runtime/closure/performance/n6/runs/native-b572466abf65404da72d89cb5531b3af/report.json)는 8 PASS/2 FAIL이었다. 정합성 p95는 33,910.101→5,740.368ms로 기준을 충족했지만 내역 묶음 15,041.427→5,196.763ms는 절대 상한을 넘었고 작업 상세 198.969→463.793ms는 상대 회귀였다. 모든 HTTP 200·응답/소스/입력 보존 및 소유 프로세스·포트 정리는 확인했으며, 후보를 최종 성공으로 채택하지 않았다. 제한을 정합성 조회에만 적용한 다음 후보는 관련 81개·Ruff를 통과했고 n7에서 실제 비교 중이다. 독립 리뷰는 실제 PIN 확인 뒤 대기하는 요청의 DB 연결 보유를 발견했다. 이 조건은 앞선 mock 인증 테스트의 검증 범위 밖이므로 별도 수정·회귀 검증이 필요하다. 전체 성능·최종 공동복구·최종 코드 검증·push/HEAD CI는 미완료다. 아래 시각별 기록은 당시 결과이며 현재 전체 통과를 뜻하지 않는다.

2026-10-10 00:51 KST 현재: 기존 8개 좁은 ORM 조회의 scalar화는 관련 129개·Ruff를 통과했고 소스 `0ed60ab3…`로 실자료·합성 2만 nd2의 전체 응답 SHA 동일을 확인했다. [n5 실제 HTTP 부분 비교](../../../_attic/runtime/closure/performance/n5/runs/native-7b7cbe0d6fd943aa9df7503e4ee1181c/report.json)는 native 1·실자료 u10의 8 PASS/2 FAIL이다. 내역 묶음 p95 15,249.238→4,116.804ms, 정합성 34,285.347→14,938.241ms로 개선됐지만 절대 기준을 넘었다. 상대 회귀 없음·양쪽 항목별 30회×3묶음·모든 HTTP 200·모집단/본문 동일·소스/입력/보호 불변·소유 PID 6개 부재/포트 해제를 대조했다. 보고서 SHA `c60e4462…`, 나머지 u30은 NOT_RUN이다. 대기 시간도 포함하는 공유 입장 제한 후보를 별도 검증하며, 전체 성능·최종 공동복구·push/HEAD CI는 아직 미완료다. 앞선 n4 admission은 런타임 격리 옵션에 따른 Pydantic 버전 차이로 서버 실행 전 실패했고 원문을 보존했으며, 원형 런타임을 유지한 새 n5에서 admission을 실제 통과했다.

2026-10-10 후속 진단: operation/effect 조회의 scalar 최적화에서 UUID 별칭 PK가 원형 ORM의 첫 identity를 보존해야 한다는 독립 리뷰 지적을 재현했다. 별칭 회귀 2건 RED 후 첫 identity 중복 제거로 GREEN, 손상 별칭 JSON의 타입 검증도 유지했다. 직접 관련 테스트 125건·Ruff·diff 검사는 통과했다. 이후 [실자료 nd2](../../../_attic/runtime/closure/performance/nd2/runs/real-4e716a70e23044dc8ec984bdcfb6e988/receipt.json)와 [합성 nd2](../../../_attic/runtime/closure/performance/nd2/runs/synthetic_20000-0c767c6260db48499fe562819af16b9e/receipt.json)는 각각 native 0이며 전체 응답 SHA `8641a427…`가 기존과 같고, 조회 중 private DB·원본 입력·소스·helper·보호 8+6은 동일하다. 이는 결과 보존 진단이며 native 동시 부하 성능 통과 증거가 아니다.

같은 소스로 [내역 묶음 nd3](../../../_attic/runtime/closure/performance/nd3/runs/real-ceade2e3bfaf420b805c35cd1f4ea2c9/receipt.json)를 실제 실행해 native 0·전체 페이지 세 번 동일·private DB와 보호 입력 불변을 확인했다. 정상 호출 285.471ms 중 query 152.100ms·group 28.854ms·detail 54.881ms·stock 46.015ms였으며 기존 페이지 크기는 유지했다. 전용 복제본의 읽기 전용 SQL 대조에서 반환 metadata 1,306행과 connected 전체 스캔을 확인했고, 독립 거래를 단순히 자르는 수정은 묶음 의미와 개선폭을 입증하지 못해 적용하지 않는다. 원형 native 재측정용 n4는 준비만 했으며 실제 admission·HTTP·전체 성능·최종 공동복구·브랜치 push/HEAD CI는 아직 완료하지 않았다.

23:42 KST 후속: 완료된 u10/u30 성능 실패 뒤 부모는 소유권을 확인한 session-043 서버를 원형 stop.request watcher로 정상 종료했다. 중단된 합성 구간은 성능 근거에서 제외하며, native003 전체는 23:40:03 native/outer 1·44세션·**FAILED_OR_INCOMPLETE**다. [중단 의도](../../../_attic/runtime/closure/performance/n3/parent-stop-known-fail-001.json) SHA `35020f25…`, [원형 보고서](../../../_attic/runtime/closure/performance/n3/runs/native-c902c5303de64697a8fe3e9e1763b9e4/report.json) `8aa889bb…`, [부모 대조](../../../_attic/runtime/closure/performance/n3/parent-native003-completion-001.json)를 보존한다. 서버 native 0·강제 종료 없음·PID/포트 해제·보호 8+6/실행기/준비 입력 동일을 확인했다. 제품 수정 전 실제 비용 진단이 다음 단계다. 서버 종료 후 클라이언트 정리와 독립적으로 runtime003의 입력 수집→새 private 생성→직접 프로세스 probe를 각각 실행·대조해 native 0/PASS를 확인했다. [probe 원문](../../../_attic/runtime/closure/recovery/validator-venv-003-probe/result.json) SHA `a96c00a8…`, 직접 PID 18948·출생/image/prefix/-I/-B·패키지/module metadata 일치·입력/target 불변·소유 종료가 근거다. DB/서버를 실행한 검사가 아니며 전체 공동복구는 여전히 미완료다. 최종 변경 코드는 전체 성능·관련 기능·공동복구를 별도로 검증해야 한다.

23:28 KST 후속: native003 실자료 mixed/u30 완료 원문은 **3 PASS·7 FAIL**이다. 절대 상한 실패 6개(작업 p95 ms: 목록 2,111.121·묶음 13,680.857·검색 3,579.903·집중 품목 2,352.514·일보 3,070.084·정합성 47,140.468), 상대 회귀 2개(검색 +38.06%/+986.967ms, 일반 품목 +22.91%/+162.228ms)이며 검색은 중복이다. 각 판·항목 90 timed, 여섯 세션의 native 0·HTTP 200·응답/입력 보존·정리는 충족했다. [부분 결과](../../../_attic/runtime/closure/performance/n3-partial-real-mixed-u30-001.md)와 [계산 원문](../../../_attic/runtime/closure/performance/n3-partial-real-mixed-u30-001.json) SHA `36de9f41…`를 보존한다. 합성 2만 혼합 측정은 진행 중이며 전체 PASS가 아니다. 기준을 완화하지 않고 측정 종료 후 실제 병목을 진단한다. 이 실패를 기능 strict 완료나 과거 성능 결과와 합산하지 않는다.

23:14 KST 후속: native003 실자료 mixed/u10의 완료 원문은 **7 PASS·3 FAIL**이다. 내역 묶음 p95 15,166.181→4,427.227ms와 정합성 34,158.267→16,128.997ms는 개선됐지만 각각 2초·10초 절대 상한을 넘었다. 상세 조회 245.522→359.615ms는 상대 증가 46.47%·114.093ms로 회귀 기준을 위반했다. 각 판·항목 90 timed, 여섯 세션의 native 0·HTTP 200·완전성·응답 의미/입력 보존·정리는 충족했다. [부분 결과](../../../_attic/runtime/closure/performance/n3-partial-real-mixed-u10-001.md), [계산 원문](../../../_attic/runtime/closure/performance/n3-partial-real-mixed-u10-001.json) SHA `26307cbb…`를 보존한다. 현재 실자료 u30 측정 중이며 전체 성능 PASS로 판정하지 않는다. 기준을 완화하지 않고 측정 종료 후 실패 경로의 실제 비용을 진단한다. 제품 코드·기존 실패 원문은 변경하지 않았다.

23:01 KST 후속: native003 단일 사용자 검사는 실자료·합성 1천·5천·2만 각각 10/10, 총 40/40 기준 충족이다. 각 판·조회 90개 timed 표본, HTTP 200·native 0·요청 완전성 및 세션 입력/포트 정리를 완료 원문으로 대조했다. [실자료 부분 결과](../../../_attic/runtime/closure/performance/n3-partial-real-u1-001.md), [합성 1천·5천](../../../_attic/runtime/closure/performance/n3-partial-synthetic-u1-001.md), [합성 2만](../../../_attic/runtime/closure/performance/n3-partial-20000-u1-001.md)를 보존한다. 실자료 정합성 p95는 1,380.218→828.206ms, 합성 2만은 2,391.359→694.616ms다. 일부 조회의 증가도 원문에 남기며 동시 사용자·전체 성능 PASS로 확대하지 않는다. 지금은 혼합/동시 사용자 측정 중이다. C14 runtime002는 구버전 ready·조회 후 Windows venv launcher/child PID 분리로 exact PID 검사에서 native 1로 종료했다. 설치·마이그레이션 전이며 새 result/journal은 없다. 보호 8+6·소스 불변과 부모의 소유 PID 부재/포트 해제를 별도로 확인했다. 검사 완화 없이 새 직접 image QA runtime003을 순수 준비했고 실제 생성·probe·전체 공동복구는 대기다. 기능 strict 완료와 성능·복구·커밋/push·HEAD CI 완료를 구분한다.

21:52 KST 후속: c13 등록·normalize·strict는 모두 native 0으로 완료했다. 기본 계약 270개와 추가 실행 대상 75개, 고유 실행 조건 1,058개의 완료를 확인했고 보류 6개는 별도로 유지한다. [부모 완료 대조](../../../_attic/runtime/closure/final-c13-promotion-001-parent-completion.json)와 pipeline 종료 SHA `4abfad6d…`를 보존한다. 성능 admission은 공식 준비한 8개 DB의 raw/typed 복사·전체 업무값·보호 비교를 통과했지만, 실제 native002는 입력 JSON 복사 중 native 1로 종료해 서버·시간 표본은 0이다. 별도 원형 writer 텍스트 실험에서 Windows 임시 경로 259자 PASS·260자 일반 경로 실패·extended 경로 PASS를 재현했다. [텍스트 경계 원문](../../../_attic/runtime/closure/performance/native-path-probe-003/result.json) SHA `05941d51…`이며 원 실행의 예외 프레임은 로그에 없어 확정하지 않는다. 짧은 새 private 경로만 준비하며 측정 함수·성능 기준·보호·기존 실패 원문은 유지한다. 별도 C14 runtime002 설치 실패·복구 재개를 21:52:23에 한 번 시작했고, 정식 성능과 전체 공동복구·커밋/push·HEAD CI는 아직 완료하지 않았다.

21:09 KST 후속: c13 근거 승격은 native 0·1,058조건 등록이며 normalize와 strict는 진행 중이다. 성능용 새 private 복제본 8개는 공식 schema 준비와 기존 업무값 전수 비교·FK 위반 0을 통과했다. helper/wrapper/supervisor native 0, 보호 8파일·외부 6개 동일, 부모의 8 DB 최종 SHA 일치·소유 PID 부재 확인을 기록했다. [준비 보고서](../../../_attic/runtime/closure/performance/native-fixtures-002-001/report.json) SHA `a4b95141…`, [부모 대조](../../../_attic/runtime/closure/performance/fixture-generation-002-preparation/parent-execute-completion-001.json)이며, HTTP readiness와 응답 시간은 아직 미실행이다. 과거 성능 FAIL·C14 공동복구 FAIL 원문을 보존하고, 별도 사전 복원 PASS와 구분한다. 새 공동복구 기동·전체 엄격 완료·브랜치 커밋/push·HEAD CI는 미완료다.

18:59 KST 후속: 새 p10 동결은 native/outer 0이며 코드·프론트 맵은 p9와 같고 실행기 10개 SHA 불일치 0이다. 비교 원문 2개 차이 0, 보호 8개·외부 6개와 계측 입력 11개의 전후 동일을 확인했다. 동결 SHA `57a0cfe3…`와 [완료 영수증](../../../_attic/runtime/closure/recovery/p10-freeze-completion-001/receipt.json) `0209ba90…`를 보존한다. 운영용·QA용 실제 빌드를 18:56:02에 시작했고 운영용 install/build 단계가 진행 중이다. 실제 빌드·공동복구 성공 판정은 아직 없다.

별도 native TCP 성능 준비의 독립 리뷰는 prepared DB의 내용을 binding 시점에 고정하지 않는 검증 누락을 발견했다. 양쪽 자료가 같은 방식으로 변경되면 논리 동등성만으로 놓칠 수 있는 코드 경로이며 실제 자료 변경을 관찰한 것은 아니다. 기존 binding/리뷰를 보존하고 사전 DB 해시와 실행 전후 비교를 보강한다. 서버·DB 복제·실제 성능 표본은 아직 실행하지 않았다. [준비 리뷰](../../../_attic/runtime/closure/performance/native-formal-preparation-001/READONLY-REVIEW-001.md).

18:41 KST 읽기 진단: 비교 입력 기록 도우미는 순수 검사 23 PASS/native 0이며, 실제 별도 파일 관찰 5회는 p9 동결 보호값과 모두 같았다. 각 비교의 두 입력·정확한 차이·입력 식별 SHA를 원형 비교 직전에 별도 파일로 보존했다. 실제 진단 native 0·입력 SHA 불변·SQLite/네트워크/child 연결 0이다. 기존 p9 빌드를 실행하지 않았고 과거의 순간 불일치를 재현한 결과도 아니므로 실패 원인은 미확정으로 남긴다. 새 빌드·공동복구의 성공 근거로 확대하지 않는다. [읽기 진단](../../../_attic/runtime/closure/recovery/p9-guard-readonly-observation-001.json).

독립 읽기 검토에서도 원형 비교의 실패 누락 경로를 발견하지 못했다. 이 별도 진단의 `bindings.worker_sha256`은 실제 p9 빌드 worker가 아니라 진단 dispatcher `c6965648…`를 뜻한다. 원 p9 worker `197d6a3c…`는 `inputs`와 사전 admission에서 따로 핀되어 있다. 세 가지 감사 이벤트의 감시 범위와 이 입력 구분을 유지하며 완료 원문을 수정하지 않는다. [독립 검토](../../../_attic/runtime/closure/recovery/p9-guard-probe-readonly-review-001.md).

18:34 KST 후속: 현재 cutover·주간 응답 보관 수정 소스를 고정한 `final-c13-verified-20261009`를 18:20:58에 시작했다. 전체 실행과 원장 승격은 아직 진행 중이다. p9 동결은 native 0이지만 실제 빌드 준비는 18:25:38 native 1로 끝났고, 소스 복사 다음 보호 비교에서 중단돼 Next/npm 빌드는 시작되지 않았다. 동결·저장된 before/after의 보호 8개·외부 6개 값은 같지만 실패한 중간 `observe()`의 입력을 저장하지 않아 어느 값이 달랐는지 확정할 수 없다. WAL 변화나 제품 결함으로 단정하지 않으며, 기존 원문을 보존하고 원래 비교의 양쪽 입력을 남기는 별도 진단을 준비한다. 새 운영·QA 산출물, 조립 및 실제 공동복구는 미완료다. 소유 프로세스 종료와 8042/3042 해제는 확인했다. [실패 영수증](../../../_attic/runtime/closure/recovery/p9-build-failure-001/receipt.json).

17:32 KST 후속: c12 설치 실패·재개 모드는 17:24:28에 native 1/FAIL로 중단됐다. 첫 전방 코드 설치 실패 주입과 구묶음 정확 복원은 통과했고, 두 번째 frontend/code 설치도 완료했다. 이후 `recovery.begin()`의 보존 validator 검증이 262자 Windows 파일을 누락으로 보고해 실패했다. 독립 읽기에서 일반 `Path.is_file()`은 False, extended 경로는 True이며 실제 SHA가 journal의 기대값과 일치함을 확인했다. 실제 0044 이동·복구 중단/재개·강제 종료·정상 모드 성공으로 표시하지 않는다. 두 번째 journal은 INSTALLED여서 구묶음 복원 완료로 보고하지 않고, private DB·보존 자료·안전한 사전 마이그레이션 rollback 경로를 확인한다.

같은 실행의 보호 비교는 원본 `C:/ERP/backend/mes.db-wal`의 0바이트 파일이 없어졌다는 차이로도 실패했다. 다른 보호 7개와 외부 근거 6개는 같았으나 변경 원인 귀속은 미확정이다. 해당 원본에 DB 연결·쓰기·복원·서비스 조작을 수행하지 않으며 before/after·오류 원문을 보존한다. 소유 worker/supervisor는 종료됐고 8042/3042 listener 부재는 별도 읽기로 확인했다. 실패 supervisor의 `portsFree: false`는 native 실패 때 성공 경로 검사를 실행하지 않았다는 기록이며, 포트 해제 성공 영수증으로 재표시하지 않는다.

17:18 KST 후속: `final-c12-verified-20261009`는 16:17:43~17:15:56 KST에 9그룹·345대상 실행 후 native 1/FAIL로 종료했다. 첫 브라우저의 주간보고 본문 수명 오류 1개만 실패했고 나머지 8그룹은 native 0이다. 부모의 원문 대조에서 pytest 1,496 및 별도 6개, Vitest 772개는 FAIL/ERROR/SKIP 0이며, 9그룹의 소스 입력 2,198개는 현재 SHA 충돌/변경 0·원문 SHA 불일치 0이다. QA 8021/3100은 해제됐고 보호 복제 DB는 `08fd9b80…`로 동일하다. 실행 원문은 보존하며 FAIL 실행을 승격하지 않는다.

독립 loopback Chromium 실험은 이전 문서의 응답을 잡은 뒤 hard navigation 후 본문을 읽는 오류를 5/5 재현했다. `route.fetch()`로 실제 응답을 읽고 같은 응답을 UI에 전달하는 대안은 5/5 본문 일치·native 0이다. 원형 테스트 소스는 그대로이고, 이 실험은 c12의 실제 요청 출처 확증이나 DEXCOWIN MES 브라우저 PASS를 대신하지 않는다. 최소 패치는 아직 적용하지 않았다. 복구의 현재 동결 검증을 마친 뒤 테스트 보완과 실제 재검증을 수행한다. [진단 원문](../../../_attic/runtime/closure/c12-weekly-response-diagnostic-001/standalone-route-probe.json).

17:04 KST 기록: c12 복구 묶음 동결·조립은 각각 native 0/PASS다. 실제 운영용 산출물·QA production 산출물·Node 전체 바이트 및 현재 코드/실행기 19개의 SHA를 대조했고, 보호 8개와 외부 근거 6개는 전후 동일했다. 부모도 manifest `9790d71bf42bede81e7ef856e933dd591b696cffa2beafcc67922019d8d68cdd`, 실행기, 보호 복제 DB·private 구 DB 및 격리 포트 해제를 확인했다. 기존 DB003 입력 84개가 같아 그 검사는 재사용하며 새 실행으로 세지 않는다. 실제 설치 실패·재개 모드를 17:00:45 KST에 시작했고 강제 종료 및 정상 모드는 아직 미실행이다. [준비 근거](../../../_attic/runtime/closure/recovery/c12-preparation/completion.json).

당시 c12 첫 브라우저 묶음은 258 PASS·1 FAIL이었다. 실패는 주간보고 화면 값 비교 전에 `response.json()`에서 발생한 Chrome `Network.getResponseBody: No resource with given identifier found`다. 당시 실패 원문·이미지·영상과 실행 근거를 보존했고 응답 수명/화면 이동 경계를 조사했다. 이는 화면이나 서버가 잘못 계산했다는 확정 근거도, 후속 전체 PASS 근거도 아니다. 나머지 실행을 계속하되 실패한 묶음을 임의 승격하지 않았다. 그 시점에는 정식 성능, 엄격 완료, 공동복구, 커밋/푸시와 최종 HEAD CI가 미완료였다.

05:42 KST 기록: 원래 `SHIP-REMATCH 8.12-05`를 실제 Chromium에서 다시 실행해 1 PASS·재시도/FAIL/SKIP/flaky 0·native 0을 확인했다. 원문 E2E·60초 제한은 그대로이며 부모도 성공 PNG에서 BOM 재확인 안내·다음 비활성·제출 부재를 직접 확인했다. 소스·보호 DB 전후 동일 및 소유 프로세스 종료·8021/3100 해제를 확인했다. 이는 단일 회귀의 현재 성공이며 canonical 전체 성공으로 승격하지 않는다. [실제 브라우저](../../../_attic/runtime/closure/shipping-rematch-browser-001/completion.json).

새 TCP 보완 진단은 monitor·supervisor·네 child native 0, 네 포트 해제, 저장 HTTP 202개 모두 200으로 완료했다. 계측 전후 같은 버전의 본문 차이는 없지만 baseline/current 일보의 기존 필드 변화는 따로 검토한다. 경로당 세 표본 중앙값에서 groups는 baseline 8.19초→current 3.17초, 정합성은 10.64초→5.17초였고 일반 품목은 0.42초→0.72초였다. 표본 수와 부하 지속 시간이 정식 검사와 다르므로 p95·전체 성능 PASS로 표시하지 않는다. groups의 2초 상한과 작은 조회의 회귀 신호가 남아 있으며 공식 20 FAIL은 유지한다. 추가 프로파일 준비와 새 p7/q7 빌드·프론트 전체 검사 진행 중이다. [독립 TCP 진단](../../../_attic/runtime/closure/performance/tcp-complement-preparation-001/jobs/tcp-768f71ac93524236b3e3ffc0ec38dd5a/result.json).

05:24 KST 후속 기록: `final-c8-verified-20261009` 전체 기대값 실행은 native 1로 끝났다. 첫 브라우저 묶음은 258 PASS·1 FAIL이며, Vitest의 실제 770 PASS와 별개로 중복 테스트 이름 때문에 실행 근거 검증이 거부됐다. 실패 원문·영상·이미지는 보존했다. 출하 단계 URL이 아직 반영되지 않았을 때 이전 페이지로 잘못 이동하는 경계를 단위 검사에서 먼저 재현했고, 제품의 한 조건을 수정한 뒤 관련 29개가 통과했다. 이 수정 후 실제 실패 브라우저와 전체 실행은 아직 다시 완료하지 않았다. 테스트 이름만 구별한 검사는 큐 17개 및 내역·출하 대상 7개가 통과했지만, 선택하지 않은 검사를 통과로 합산하지 않는다.

긴 경로 설치 오류도 tracked 실제 함수에서 재현한 뒤 세 `copytree` 경로만 수정했다. 기존 검사와 신규 검사는 총 30 PASS·0 SKIP·native 0이다. 공동복구는 새 p7/q7 빌드와 c9 실행이 필요하며, 이전 p6/q6 및 c8 자료를 최종 코드 성공으로 재표시하지 않는다. 첫 TCP 성능 보완 진단은 허용 포트 할당 검사에서 native 1로 중단됐고 HTTP 측정은 0회다. 순수 검사에서 도우미 수정 후 새 독립 진단을 진행하며, 정식 성능 20 FAIL 및 사용자 답변 대기 상태는 유지한다. 엄격 완료·커밋·푸시·최종 CI는 미완료다.

04:59 KST 기록: c8 실제 설치 실패·재개 리허설은 native 1로 종료했다. 의도한 설치 실패 주입 이전에 `employee_frontend_release.py`의 일반 `copytree`가 Windows 긴 경로에서 실패했다. 구 버전 백엔드·QA production 프론트의 격리 기동·조회·종료는 실제 수행했지만 새 버전 설치·재개·공동복구 성공을 뜻하지 않는다. 실패 후 구 코드·프론트·Node·설정·복제 DB와 백업의 정확 일치, journal `ROLLED_BACK`, 전용 8042/3042 해제를 따로 확인했다. hard-exit 및 정상 모드는 미실행이다. [실패 후 확인](../../../_attic/runtime/closure/recovery/c8-failed-install-diagnostic-002/result.json).

동시에 원본 두 DB의 과거 물리 해시 변경을 발견했다. 기존 예약 동기화의 별도 영수증은 04:01~04:24 실행 및 원본 교체·기존 서버 재기동을 기록하고 있다. 부모의 읽기 전용 비교에서 해당 동기화 후보 DB와 현재 `C:\ERP` 원본의 전체 테이블 정의·행 집합이 일치했고, 원본은 파일 복사 및 비교 전후 동일했다. 원본 SQLite 연결·쓰기·서버/예약 작업 조작은 수행하지 않았다. 이 관찰은 과거 원본 해시 불변을 주장하는 근거가 아니며, DB003의 당시 전후 불변과 구분한다. `C:\ERP-dev`에도 기존 동기화의 작업 적용·재기동 기록이 있다. [별도 동기화 대조](../../../_attic/runtime/closure/original-sync-logical-comparison-001/receipt.json), [읽기 전용 관찰](../../../_attic/runtime/closure/original-drift-readonly-001.json). 이번 작업 브랜치의 main 반영·직원 배포는 수행하지 않았다.

04:13 KST 기록: 최신 UUID 서비스의 실제 PostgreSQL 4개와 일관된 내역 snapshot 1개는 각각 새 전용 실행에서 건너뜀 없이 통과했다. 소스 275개 전후·현재 SHA와 프로세스 정리·포트 해제를 확인했으며, 신규 검사는 CI에서 실행하도록 연결했다. 누적 아홉 커밋 단계의 import도 native 0이다. 전체 기대값 `final-c8-verified-20261009`와 새 c8 공동복구 준비는 진행 중이다. 기존 PostgreSQL 84개·전체 백엔드003을 최신 코드로 다시 실행했다고 표시하지 않는다.

04:02 KST 후속 기록: 전체 백엔드003은 native 0으로 종료했다(3,875개 중 3,796 PASS·79 SKIP·실패/오류 0, 실행 중 소스·보호 DB 불변). 이후 UUID 원문 저장 형식의 대상 조회 누락과 중복 정규화 차이를 6개 실패로 재현하여 좁게 수정했고, 관련 176개가 건너뜀 없이 통과했다. 정상 UUID의 조회 수·구간 제한과 NUMERIC 열의 인덱스 계약도 확인했다. 이 후속 수정에는 관련 검사 근거를 별도로 연결하며 003을 최신 전체 실행으로 표시하지 않는다. PostgreSQL의 새 서비스 경로 실제 검사는 진행 대기다. c7 실제 조립과 DB003 보존 검사는 native 0으로 끝났지만 실제 공동복구 세 모드는 미실행이다. 최신 코드는 c8으로 따로 동결하고, 불변 입력의 빌드·DB 검사만 원래 이력과 해시를 보존하여 재사용한다. 다음 문단은 이 후속 기록 이전의 진행 이력이다.

승인된 표본 수를 충족한 정식 성능 실행은 100비교 중 80 PASS·20 FAIL로 종료했다. 이후 날짜 조회 코드가 바뀌었으므로 이 결과는 해당 실행 소스의 실패 이력이며 최종 소스의 성능 완료 근거가 아니다. 실제 PostgreSQL의 신규 설치·보존·잠금·snapshot·dump/restore 필수 84개는 건너뜀 없이 통과했다. DB 보존002와 p6 운영·q6 QA production 빌드는 당시 동결 소스로 통과했다. 전체 백엔드002는 3,772 PASS·1 FAIL·79 SKIP으로 종료했고, 유일한 실패의 테스트 대기를 신호 방식으로 고친 뒤 관련 파일 19개가 통과했다. SQLite의 ISO-T·초 단위 원문, 혼합 MIN/MAX, 유효하지 않은 달력 날짜·24시 및 NUL 원문에 의한 실제 누락을 재현해 수정했으며 최종 관련 165개가 통과했다. 현재 동결 소스로 전체 백엔드003을 실행 중이고, c7의 기존 프론트 빌드·Node·환경 재검증은 통과했다. 새 DB003 및 실제 공동복구 결과는 아직 대기다. QA 직원명은 합성 이름으로 바꾼 뒤 실제 대상 브라우저 4흐름·안전성 검사 9개·PNG 열람을 완료했다. `final-verified-20261009`는 소스 변경 때문에 의도적으로 중단했고, 당시 브라우저 자료 293개를 해시 대조하여 로컬에 보존했다. [중단 영수증](../../../_attic/runtime/closure/final-verified-20261009-aborted-browser/ABORTED.json). 이전 빌드 성공을 새 코드·DB 공동복구 완료로 확대하지 않는다. 아래 이전 실행은 당시 이력으로 구분해 읽는다.

승인된 정책과 관련 회귀 수정을 작업 브랜치에 반영했다. c3 production 빌드와 번들은 한도를 통과했지만 성능 matrix는 17:24:48 KST에 당시 검증기 기준 **100개 비교 중 83 PASS·17 FAIL**로 종료했다. 후속 검토에서 혼합 조회의 endpoint별 표본이 요구한 90개 대신 9개뿐임을 확인했으므로 당시 `complete_protocol=true`를 승인된 측정 완료로 인정하지 않는다. 단일 UNION snapshot 보정과 관련 로컬 검사는 마쳤고 PostgreSQL 실제 CI 실행은 대기다. 당시 고정 소스의 `final-core-frozen-20261008`은 15:19 KST에 종료가 확인됐으나 완료 receipt가 없어 중단으로 보존한다. 첫 c4 복구 실행도 완료 근거 없이 종료됐으며 후속 초기 복제본 확인과 실제 리허설을 구분한다. 효과 이력 packing·SQLite 길이 경계 보정과 일보의 미사용 컬럼 제외에 이어, 묶음 내역의 배치 라인 상세 조회를 페이지 선택 뒤로 옮겼다. 이 후속 소스의 단독 진단도 동시 사용자 조건에서 2초 상한을 충족하지 못했다. 실패·중단·실험 진단을 성공으로 승격하지 않으며, 성능 기준 충족·0044 공동복구·원장 strict·기능별 커밋과 최종 HEAD CI가 모두 확정되기 전 전체 PASS 또는 READY로 판정하지 않는다.

기준은 [승인 계획](../plans/2026-10-08-mes-safe-closure.md)과 [활성 TODO](../../../_attic/handoff/active/2026-10-07-mes-expectations-closure-todo.md)다. 작업 브랜치는 `codex/mes-expectation-closure`, 통합한 원격 main은 `2d79cd2848900fb66f99443af411fcec347877cd`다. main 반영과 직원 환경 적용은 이번 종료 범위에 포함하지 않는다.

아래 검사 개수·성능 수치는 각 로그 실행 시점의 역사적 스냅샷이다. 현재 기대값 분모는 [원장](2026-10-07-mes-expectations.json)과 정규화 명령으로 다시 산출한다. 품목·공정·모델의 현재 개수를 이 문서에 고정하지 않는다. `_attic/runtime/` 링크는 로컬에 보존한 검증 자료이며 Git에 포함할 운영 자료가 아니다.

## 승인된 세 정책과 반영 내용

| 정책 | 반영한 기준 | 보존한 경계 |
| --- | --- | --- |
| 주간보고의 제한된 동결 예외 | 생산이 없고 PF 픽업만 있는 주의 모델표, 한국 시간 월요일 경계, 전체 정상재고 합계와 basis별 안내, 집계·검산·분류 설명을 보완한다. | 기존 재작업 불량·폐기 자식의 입고와 불량 두 열 계산을 유지한다. 서로 다른 모델표와 공정 합계가 같다고 설명하지 않는다. |
| 출하 부족 검사 | 실제 출하할 PF와 동반 출하품의 가용재고·예약으로 판정한다. 이미 생산된 PF의 BOM 구성품 부족만으로 출하를 막도록 확대하지 않는다. | 품목 삭제·분류/BOM 변경·중복 요청·예약 부족 검증을 유지한다. |
| 신규 직원 관리자 메뉴 | 생성 시 메뉴 설정 생략은 관리자 메뉴 기본 숨김, 명시 설정은 그대로 반영한다. 기존 직원 수정에서 생략한 설정은 보존한다. | 기존 직원·PIN·독립 결재 역할과 관리자 PIN 계약을 보존한다. 새 등급 권한 체계를 추가하지 않는다. |

결정 ID는 각각 `CLOSURE-WEEKLY-SCOPE`, `CLOSURE-SHIPPING-STOCK`, `CLOSURE-NEW-EMPLOYEE-MENU`다. [정책 원장](2026-10-07-mes-expectations.decisions.json)과 [승인 전 보존본](2026-10-07-mes-expectations.sources/recommendation-before.json)을 함께 유지한다. 직원 생성의 실제 기본값은 `backend/app/routers/employees.py:298`에서 확인할 수 있다. 정책 반영과 최종 브라우저·원장 실행 완료는 구분한다.

## 주요 구현과 통합 범위

| 영역 | 실제 반영 내용 및 검토 근거 |
| --- | --- |
| 스키마·기존 자료 | 직원 등급 제거와 관련 보존 계약, 거래 위치 근거를 보완했다. 원격 main의 튜브 원자재·업체 범위를 유지하고 두 migration 가지를 무변경 merge revision `20261008_0044`로 연결했다. 최종 공동복구 결과는 아래 별도 표에서 확정한다. |
| 직원·부서·품목·BOM | 관리자 메뉴 기본값, 독립 결재 역할·요청 단계, 품목 코드 미리보기와 오류 상태, BOM 저장·변경 충돌의 계약을 연결했다. 상세 검증 조건은 [단언 registry](2026-10-07-mes-expectations.assertions.json)를 기준으로 추적한다. |
| 입출고·불량·격리 복귀 | 실제 출처 위치의 정상·격리·예약 셀만 바꾸고 취소에서 같은 셀을 역전하도록 보완했다. 창고와 튜브 반품 진입, 실제 튜브 TR 원건의 전용 업체 제약 등 통합한 main 동작을 보존했다. [위치별 검토](../../../_attic/runtime/closure/location-validation-coverage-review.md), [튜브 정책 회귀 로그](../../../_attic/runtime/closure/tube-main-policy-final.log). |
| 내역·일보 | 실제 위치별 전후 수량, 원거래·취소의 담당자/승인자·메모·작업 분류를 맞췄다. 일보는 로그 수와 작업 수를 구분하고 다음 날 취소도 원작업 상세에 접근한다. 품목 전환은 회수품보다 대상품을 대표로 유지한다. [통합 품질 검토](../../../_attic/runtime/closure/integrated-quality-review.md), [전환 이력 검토](../../../_attic/runtime/closure/conversion-history-race-review.md). |
| 출하·주간 | 실제 예약·픽업·취소의 원복, 변경 전후 구성과 준비 유지/해제, 실제 F705 다운로드와 화면 수치 대조를 보강했다. 준비 상세의 동일 표시행만 공유하며 step 5 고정 카드 배치는 유지했다. [출하 검토](../../../_attic/runtime/closure/shipping-frontend-verification-summary.json), [표시행 수정 검증](../../../_attic/runtime/closure/performance/prep-row-verification.json). |
| 조회 성능 | 실제 대상에 필요한 포함 경계의 이력 suffix 조회, 없는 선택적 검색 근거의 정규화 생략, 정합성 조회의 필요한 컬럼 projection을 적용했다. 전체 legacy 취소 경계와 응답 의미의 보존을 별도로 검증했다. 2026-10-09 00:37 KST에 끝난 당시 ASGITransport 전체 matrix는 80 PASS·20 FAIL이었다. 후속 native003 TCP 전체 matrix는 측정 중이며 최종 판정은 미확정이다. [최적화 근거](../../../_attic/runtime/closure/performance/optimization-evidence.json), [당시 전체 비교](../../../_attic/runtime/closure/performance/final-coalesce-formal-001/comparisons.json). |
| 복구·검증 도구 | admission·원본 hash·쓰기 차단·명시 재개, Windows 긴 경로·조회 연결 종료·프로세스 소유권 판독을 보완했다. 원장은 실제 실행 receipt, 대상 단언과 소스, 모든 매개변수 인스턴스, 브라우저 캡처 및 DB 식별 정보를 검사한다. [증거 도구 검토](../../../_attic/runtime/closure/evidence-final-review.md). |

## 현재 확인한 검사 결과와 남은 근거

| 검사 | 기록된 결과 | 최종 판정에 남은 부분 |
| --- | --- | --- |
| 프론트 이전 전체 검사(001) | 2026-10-08 19:00:46~19:09:38 KST, Node 20에서 lint·타입·전체 커버리지 검사의 native exit가 모두 0이다. `maxWorkers=4/minWorkers=1`로 340파일·3,790 PASS·0 SKIP, statements/lines 95%·branches 92.61%·functions 88.94%를 확인했다. 영수증은 `pass=true`, 938개 입력 소스의 `source_unchanged=true`다. [실행 영수증](../../../_attic/runtime/closure/final-frontend-native-001/receipt.json), [전체 커버리지 로그](../../../_attic/runtime/closure/final-frontend-native-001/coverage.log). | 이전 3,784개 [실행](../../../_attic/runtime/closure/final-frontend-coverage-limited.log)과 합산하지 않는다. 당시 프론트 소스의 로컬 검사 근거이며 backend·브라우저·성능·복구·최종 HEAD CI 전체 통과로 확대하지 않는다. 후속 004 전체 검사는 아래에 별도 기록한다. c3 production 빌드의 동일 소스 재사용 여부는 별도 근거로 판정한다. |
| 백엔드 이전 전체 검사(001) | 2026-10-09 00:38:19~00:59:11 KST, 전체 3,832개 중 3,772 PASS·0 실패·0 오류·60 SKIP, native exit 0. 실행 소스·보호 DB hash 불변을 확인했다. [영수증](../../../_attic/runtime/closure/final-backend-20261009-001/receipt.json), [XML](../../../_attic/runtime/closure/final-backend-20261009-001/backend.xml). | 당시 `complete_without_skip=false`였다. PostgreSQL 환경 부재와 경로 전용 SKIP은 실제 실행 성공으로 세지 않으며, 후속 004 전체 검사와 필수 PostgreSQL 근거는 아래에 별도 기록한다. 최종 CI는 대기다. |
| 백엔드 이전 전체 검사 | 3,568개 중 3,505 통과·4 실패·59 건너뜀으로 종료. [XML](../../../_attic/runtime/closure/final-backend.xml), [로그](../../../_attic/runtime/closure/final-backend.log). | 이전 실패 실행을 보존하며 최신 실행과 합산하지 않는다. |
| 백엔드 실패 후 교정 | 최종 migration head 기대값은 0044로 정렬하고 해당 파일 재검증. 로그 다중 프로세스 검사는 기존 제한을 유지한 단독 재실행 통과. Windows 포트 판독은 실제 UTF-8 충돌 재현 후 native bytes로 수정하고 관련 검사 통과. [head 교정](../../../_attic/runtime/closure/final-backfill-corrected.xml), [로그 단독 검사](../../../_attic/runtime/closure/final-logging-isolated.xml), [소유권 교정](../../../_attic/runtime/closure/recovery/owner-native-bytes-summary.json). | 관련 재검증은 앞선 전체 실패 기록을 대체하지 않는다. 최종 HEAD CI 및 필수 PostgreSQL 실제 실행 결과를 기다린다. |
| 앞선 canonical 실행 | `final-main2d79-20261008`은 FAIL. 첫 브라우저 그룹에 5개 실패가 있었고, pytest는 exit 0이어도 실행 중 입력 변경, Vitest는 수정 전 대상 행과 새 실행 위치의 불일치로 증거 검증이 차단됐다. [완료 receipt](../../../_attic/runtime/mes-expectations/final-main2d79-20261008/run.json). | 원본 실패 자료를 보존하며 승격하지 않는다. 테스트 exit 0과 원장 증거 유효성은 다른 판정이다. |
| 실패 브라우저 흐름 집중 재검증 | 메모 중복 선택, 필터 전 응답 수신, 목록 표식 detach, 자동 펼침과 클릭 경합, 상세 수량의 오래된 텍스트 기대를 보완했다. 연관 case를 포함한 6개가 1.9분에 통과했고 teardown에서 보호 DB 불변과 정리를 확인했다. [로그](../../../_attic/runtime/closure/final-browser-five-focused.log). | 이 부분 실행으로 전체 조건을 PASS 처리하지 않는다. |
| 두 번째 canonical 실행 | `final-frozen-20261008`: **중단·미완료, 승격 금지**. c2 번들 초과로 국소 수정이 필요해졌고 부모가 소유 프로세스를 확인하여 정리했다. [실행 로그](../../../_attic/runtime/closure/final-frozen-expectations-run.log). | 이전 미완료 기록을 보존한다. |
| 과거 canonical 중단 실행 | `final-core-frozen-20261008`: **종료 확인·완료 근거 없음, 승격 금지**. 15:19 KST 실제 프로세스 목록에서 실행기와 부모가 없었고 `run.json`도 없었다. 마지막 일반 브라우저 진행은 15:16:25의 203/258이며 종료 원인은 미확정이다. [중단 기록](../../../_attic/runtime/mes-expectations/final-core-frozen-20261008/ABORTED.md), [소유권·보호 DB 확인](../../../_attic/runtime/closure/final-core-aborted-owned-processes.json). | 소유 백엔드만 정리했고 보호 DB hash는 같았다. 부분 진행을 테스트 성공 또는 제품 결함으로 단정하지 않는다. 당시에는 새 실행의 완료 receipt·source 일치·승격·strict 결과가 필요했다. 후속 C13 결과는 아래에 별도 기록한다. |
| CI 브라우저 분할 | 당시 실제 CI 인자로 `--list`만 수행하여 298개 = general 289 + ASR fallback 1 + ASR UI 8, 교집합·누락·추가 0을 확인했다. [수집 대조](../../../_attic/runtime/closure/ci-collection-review.json). | 수집 검사이며 테스트 실행 성공은 아니다. 최종 CI job URL과 결과를 추가한다. |

## 위치별 API 검증과 PC·모바일 검증

새 [복귀→생산→출하 연속 테스트](../../../backend/tests/test_restore_production_shipping_chain.py)는 창고·튜브·고압 × 불량·B급·구형 × 단건 부분·단건 전량·일괄 전량의 27개 조합을 실제 API로 수행했다. 최초 실행 로그의 전 조합 통과와 검토 근거는 [실행 로그](../../../_attic/runtime/closure/restore-production-shipping-chain-first.log), [범위 대조](../../../_attic/runtime/closure/location-validation-coverage-review.md)에 보존했다.

복귀 전에는 생산이 거부되는 것을 확인한 뒤, 선택 원건의 정상 복귀·필요한 창고 이동·BOM 소비·PF 생산·출하 준비/픽업을 수행한다. 이후 픽업 취소의 예약 복원부터 준비·생산·이동·복귀를 역순 취소하고 매 단계 전체 셀을 비교한다. 다른 품목·부서·격리·예약에도 비영 값을 두어 불변을 검사한다. 지원하지 않는 부분 일괄 UI를 새로 추가한 것은 아니다.

일괄 복귀의 전량 계약에는 별도 거부 검증을 추가했다. 창고·튜브·고압 × 불량·B급·구형의 9개 조합에서 잔량 2인 원건 둘에 전량 2와 부분 1을 섞어 요청하고, 실제 API의 422·`VALIDATION_ERROR`·수량 변경 안내를 확인한다. 거부 뒤 모든 Inventory/InventoryLocation의 수량·예약 셀, 두 원건 잔량, TransactionLog·InventoryOperation·DefectInventoryMovement 건수가 그대로임을 DB 재조회로 단언했다. 기존 서비스의 사전 전량 검사 계약을 검증한 것이며 제품 변경은 없다. 최종 단언 보강 후 **9 PASS·0 SKIP**이고 같은 9개의 앞선 통과와 중복 합산하지 않는다. 기존 연속 흐름 함수는 보존 초안과 AST가 동일하므로 당시 27개 통과 근거를 재사용하며, 36개를 현재 한 번에 재실행했다고 표현하지 않는다. [최종 9개 XML](../../../_attic/runtime/closure/bulk-partial-restore-guard-contract-green.xml), [위치 범위 검토](../../../_attic/runtime/closure/location-validation-coverage-review.md).

| 화면 근거 | 검증 범위 | 제한 |
| --- | --- | --- |
| PC·모바일 정상 복귀 탐색 | B급·구형의 창고 부분/전량 복귀, 잔량·원건 소멸, Back/Forward·목록 상태와 실제 재고 변화. | 모든 위치의 전체 분류 조합을 두 화면에서 반복한 증거는 아니다. |
| PC 불량 단건·일괄 복귀 | 실제 원건 ID·처리 수량·위치/예약 보존·작업 묶음과 이력. | API 27조합의 전체 후속 생산·출하를 UI로 수행한 것은 아니다. |
| PC·모바일 일괄 경계 | 부서·품목·필터 전환의 선택 초기화, 타부서 원건 제외, 지원하는 전량 처리 안내. | 경계 테스트 중 실행 완료까지 단언하지 않는 사례를 완료 근거에 포함하지 않는다. |
| PC·모바일 출하 cycle | 실제 준비·픽업·픽업 취소·준비 취소·요청 취소와 물리 재고/예약 복원. | 이 fixture는 복귀한 원재고에서 시작하는 연속 API fixture와 다르다. |

UI 선택자·실제 단언은 위 범위 대조 문서에 기록했다. 최종 브라우저 결과는 다시 고정한 소스의 새 canonical 실행에서 해당 인스턴스로 확정한다. SQLite 별도 연결에서 확인한 동시 승인·사용·취소도 PostgreSQL row-lock 검증을 대신하지 않는다.

## 성능: 기존 matrix 종료·표본 계약과 지연 기준 미충족

기준은 동일 논리 자료와 런타임에서 버전을 번갈아 측정하고 **각 조회에 준비 호출 후 30회 × 3묶음**을 수집하는 것이다. 단독·혼합 모두 endpoint마다 버전별·동시도별 90개 측정 표본이 필요하며 준비 호출·최초 호출은 제외한다. 혼합 요청은 순서를 섞고 동시도를 제한하되 이 표본 예산을 endpoint 사이에 나누지 않는다. p95가 기준보다 20%와 100ms를 **모두** 초과해 증가하면 회귀다. 일반 조회의 p95 2초, 전체 정합성 10초 상한도 유지한다. 실복제 및 합성 자료량별 단독 측정과 실복제/최대 합성 자료의 1·10·30 동시 혼합 요청을 분리한다.

후속 독립 검토에서 기존 runner가 혼합 전체 30회를 10개 endpoint에 배분해 묶음마다 각각 3회, 총 9개만 수집한 결함을 확인했다. `complete_protocol`도 실제 표본 수 대신 CLI의 `calls>=30`, `groups>=3`만 검사했다. 신규 표본 계약 6조건 중 5개가 실패해 실제 ASGI 혼합 분배 부족과 `3/3/3`, `29/31/30`을 완료로 인정하는 오류를 재현했다. 각 버전·각 묶음의 실제 표본을 확인하도록 보정하고 요구한 표본을 다시 수집하기 전 성능 검증은 미완료다. 기존 보고 JSON·비교표·실패 표본은 그대로 보존하며 새 통과 결과로 바꾸지 않는다. [표본 계약 RED](../../../_attic/runtime/closure/performance/benchmark-sample-contract-red.xml).

표본 배분은 mixed에서도 endpoint마다 `calls`회로 보정했고 양 버전의 각 묶음이 요청한 표본 수와 정확히 같은지 검사하도록 변경했다. 관련 전체 20개 검사는 통과했다. [표본 계약 GREEN](../../../_attic/runtime/closure/performance/benchmark-sample-contract-green.xml). 후속 읽기 검토에서 발견한 endpoint 빈 목록·공통 누락의 false PASS 경계도 요청 목록과 각 worker의 반환 목록을 집계 전에 정확히 대조하고 불일치 시 `ValueError`로 차단하도록 보완했다. 빈 목록·누락·예상 밖 항목의 신규 3개 RED 후 관련 전체 **23 PASS·0 SKIP**이며 앞선 20개·6개와 중복 합산하지 않는다. [목록 경계 RED](../../../_attic/runtime/closure/performance/benchmark-endpoint-set-red.xml), [23개 GREEN](../../../_attic/runtime/closure/performance/benchmark-endpoint-set-green.xml). 최종 읽기 검토에서 이 표본·목록 보정 범위의 추가 false PASS 차단 결함은 발견하지 못했다. 이 도구의 국소 검사 통과를 충분한 표본의 실제 성능 측정이나 최종 PASS로 확대하지 않는다.

측정기는 별도 worker 프로세스에서 `httpx.ASGITransport`로 FastAPI 라우팅·요청 검증·응답 직렬화까지 호출한다(`scripts/ops/benchmark_mes_reads.py:334`). 응답 동등성의 “실제 API”는 실제 라우터 응답을 뜻하며 TCP 네트워크 지연이나 별도 네트워크 서버의 부하를 포함한다는 뜻은 아니다. cold는 새 worker의 endpoint 첫 호출이고 프로세스 시작 시간·OS 캐시 초기화는 포함하지 않는다. 실제 포트를 열어 확인하는 브라우저 및 복구의 HTTP 기동 검사는 별도 근거다.

정합성은 양쪽 버전 모두 **전건 findings 비교 조건**으로 맞춘다. 벤치 어댑터는 현재 함수에 `sample_limit=None`을 전달하고, 구 main의 샘플 제한 구현에는 `inventory_integrity_engine.SAMPLE_LIMIT=None`을 적용한다(`scripts/ops/benchmark_mes_reads.py:326`). 따라서 구 main의 기본 샘플 제한 응답을 그대로 측정한 수치가 아니다. 이 비교용 설정은 앱 SQL·제품 소스 변경과 구분하며, 응답을 줄여 얻은 개선으로 해석하지 않는다.

아래는 **최적화 전 `final-main353-v3`의 역사적 실패 측정**이다. 최신 소스의 최종 수치로 사용하지 않는다. 당시 각 버전의 표본은 90회였고 응답 모집단·상세 동등성을 확인했지만 두 상대 성능 기준은 실패했다. [원 비교표](../../../_attic/runtime/closure/performance/final-main353-v3/comparisons.json).

| 실복제·단독 조회 | 기준 p95(ms) | 당시 작업본 p95(ms) | 증가(ms) | 당시 판정 |
| --- | ---: | ---: | ---: | --- |
| 내역 검색 | 241.39 | 343.41 | 102.02 | 상대 회귀 FAIL |
| 전체 정합성 | 1,571.61 | 1,958.35 | 386.75 | 상대 회귀 FAIL |

후속 최적화의 독립 비교는 당시 2,400개 원장·7,191개 대상 계산에서 불일치 0, ASGITransport를 통한 실제 라우터 응답 비교는 실복제/최대 합성의 조회별 결과가 동일했다. 이는 고정 자료의 의미 보존 근거이며 p95나 동시 변경의 최종 판정을 대신하지 않는다. [최적화 근거](../../../_attic/runtime/closure/performance/optimization-evidence.json), [라우터 응답 동등성](../../../_attic/runtime/closure/performance/request-suffix-response-equivalence.json).

2026-10-08 12:47~12:53 KST의 `final-main2d79-mixed30`은 source·DB hash를 고정한 합성 20k/30 동시 혼합의 확정 측정이다. 전체 matrix는 미완료이며 이 시나리오도 **FAIL**이다. 모든 endpoint의 로그 모집단은 같고 HTTP 오류/timeout은 0이지만, 기준 main과 현재 작업본의 전체 응답 hash가 모두 같다는 뜻은 아니다. 새 필드·정책 차이와 최적화 전후 동등성을 분리한다. [원표본 결과](../../../_attic/runtime/closure/performance/final-main2d79-mixed30/report.json), [요약](../../../_attic/runtime/closure/performance/final-main2d79-mixed30/final-summary.json), [응답 범위 대조](../../../_attic/runtime/closure/performance/final-main2d79-mixed30/acceptance-review.json).

| 합성 20k·동시 혼합 30 | 기준 p95(ms) | 당시 후보 p95(ms) | 판정 |
| --- | ---: | ---: | --- |
| 내역 목록 | 31,710.3 | 877.9 | 해당 경로 통과 |
| 작업 그룹 | 46,703.4 | 12,807.2 | 절대 상한 FAIL |
| 내역 검색 | 37,338.9 | 1,769.5 | 해당 경로 통과 |
| 집중 품목 | 33,335.6 | 853.4 | 해당 경로 통과 |
| 일반 품목 | 329.7 | 620.4 | 상대 회귀 FAIL |
| 내역 상세 | 30,106.1 | 562.2 | 해당 경로 통과 |
| 일보 | 39,339.9 | 8,909.5 | 절대 상한 FAIL |
| 재고 | 353.9 | 634.1 | 상대 회귀 FAIL |
| 전체 정합성 | 56,361.9 | 19,893.4 | 절대 상한 FAIL |
| 작업 상세 | 29,042.0 | 588.3 | 해당 경로 통과 |

이후 정합성의 기존 공정 제외 조건을 SQL로 이동한 관련 47개 검사와 고정 자료 전체 응답 동등성은 통과했다. 순수 solo 행만 limit+1로 제한하는 변경은 관련 63개와 고정 자료 라우터 응답 30개 동등성을 확인했다. 하지만 당시 `transactions.py:558`과 `:570`의 두 SELECT 사이에 legacy 취소가 원거래의 `operation_id`를 설정하면 READ COMMITTED에서 두 집합 모두에서 빠질 수 있다는 독립 리뷰 지적이 나왔다. **고정 자료 검증은 이 동시성 조건을 충족한 근거가 아니다.** [정합성 후속 근거](../../../_attic/runtime/closure/performance/integrity-weekly-filter-evidence.json), [그룹 조회 검토](../../../_attic/runtime/closure/history-daily-performance-read-review.md), [분리 조회 버전의 고정 자료 응답 비교](../../../_attic/runtime/closure/performance/solo-page-http-equivalence/comparisons.json).

후속 보정은 연결 집합과 제한된 solo를 단일 `UNION ALL` SQL snapshot으로 읽는다. 두 메타 SELECT를 검출하는 신규 검사에서 RED를 확인한 뒤 관련 64개가 통과했고 PostgreSQL 전용 검사는 환경 부재로 1개 건너뛰었다. [RED](../../../_attic/runtime/closure/performance/solo-snapshot-red.log), [64 PASS·1 SKIP](../../../_attic/runtime/closure/performance/solo-snapshot-green.log). 새 [PostgreSQL 회귀](../../../backend/tests/concurrency/test_display_group_snapshot_postgres.py)는 독립 READ COMMITTED 연결의 legacy 편입 commit을 메타 조회 직후에 끼워 넣어 전체 페이지의 원거래 보존·무중복을 검사한다. CI의 PostgreSQL 필수 step에 이 파일과 SKIP 거부 검사를 연결했으나 실제 job 실행은 아직 대기다.

후속 `final-main2d79-mixed30-v2`는 이 지적에 따라 소유 worker를 확인하고 중단했다. 완성 worker 표본이 없으므로 새 성능 수치나 판정은 만들지 않는다. 앞선 확정 FAIL을 유지하며 보정 후 응답·동시성·성능 검증이 필요하다. [중단 기록](../../../_attic/runtime/closure/performance/final-main2d79-mixed30-v2/ABORTED.json).

단일 snapshot 보정 후 `final-main2d79-mixed30-v3`의 3묶음은 완료했지만, 검색 p95 **2,033.2ms**와 일보 **8,388.1ms**가 일반 조회 2초 상한을 초과하여 FAIL이다. 나머지 8개 경로는 이 시나리오의 기준을 충족했으며 HTTP 오류/timeout은 0이다. 이것은 전체 자료량·동시성 matrix 완료를 뜻하지 않는다. [v3 실제 표](../../../_attic/runtime/closure/performance/final-main2d79-mixed30-v3/final-report.md), [원 결과](../../../_attic/runtime/closure/performance/final-main2d79-mixed30-v3/report.json).

이후 `inventory_effect_history.py`와 `inventory_integrity.py`의 선택한 컬럼 읽기를 SQLAlchemy Core로 바꾸고 정합성 비교 oracle을 현재 호출 경로에 맞췄다. 관련 검사는 23개와 71개, 합계 94개가 통과했고 실복제/20k의 초기·검색·cursor 응답 30쌍 전체가 동일했다. [직접 검사](../../../_attic/runtime/closure/performance/scalar-read-core/checks.json), [현재 소스 hash](../../../_attic/runtime/closure/performance/scalar-read-core/after-hashes.json), [응답 비교](../../../_attic/runtime/closure/performance/scalar-core-http-equivalence/comparisons.json), [동등성 receipt](../../../_attic/runtime/closure/performance/scalar-core-http-equivalence/receipt.json). JSON 변환 prototype은 제품에 편입하지 않았다.

Core 수정 후 후보만의 30회 혼합 **1묶음 진단**에서 일보의 세 표본은 약 4,103.2·6,355.9·6,848.1ms로 모두 일반 상한을 초과했다. [원표본](../../../_attic/runtime/closure/performance/scalar-read-core/probe-current.json). 3묶음 기준/후보 비교나 최종 성능 PASS 근거로 사용하지 않는다. 현재 성능 판정은 미완료·실패를 유지한다.

14:48:22~14:49:10 KST의 추가 구간 진단에서는 일보의 큰 fetch 경계 wall time이 3.77~6.24초, 같은 스레드 CPU는 0.59~0.66초였다. 이 구간의 비실행 대기가 긴 지연의 주요 부분임은 확인했으나 GIL·OS 스케줄링·SQLite 중 어느 원인인지는 분리하지 못했다. 중첩 구간의 시간을 합산하거나 실제 네트워크 대기로 해석하지 않는다. [구간 원자료](../../../_attic/runtime/closure/performance/scalar-read-core/mixed-phase-result.json).

JSON memo와 future suffix 실험은 요청 전체의 개선을 입증하지 못해 제품에서 제외했다. 첫 `bounded-packing-prototype`의 검증 범위는 hot item의 16,000행이며, 값 동등성과 DB/소스 불변은 확인했지만 전송도 16,000행·최대 chunk 1행이었다. 이후 SQL 그룹 키의 괄호 누락을 재현했으므로 이 결과를 “실자료 효과가 모두 유일하여 압축 불가”의 확정 근거로 사용하지 않는다. 첫 검사가 전체 20,000행을 검증했다고 표현하지도 않는다. [첫 후보 결과](../../../_attic/runtime/closure/performance/bounded-packing-prototype/actual-row-result.json), [그룹 키 RED](../../../_attic/runtime/closure/performance/raw-chunk-prototype/parent-grouping-red.log).

부모가 `self_group()`으로 괄호를 보정한 별도 `raw-chunk-prototype` 사본은 20,000행 전체의 typed 값과 전 대상 재고 역산이 같았고 전송은 313행·최대 chunk 64행이었다. 별도의 15개 경계 확인도 보존했다. [전체 값·역산 비교](../../../_attic/runtime/closure/performance/raw-chunk-prototype/parent-fixed-oracle-result.json), [경계 결과](../../../_attic/runtime/closure/performance/raw-chunk-prototype/parent-small-result.json). 아래는 모두 **당시 제품 미편입 사본의 1묶음 진단**이다. 각 행의 시간은 일보 세 표본의 최댓값이며 승인된 3묶음 p95 결과가 아니다.

| ignored 후보 | 기록된 범위 | 진단 결과와 한계 |
| --- | --- | --- |
| `parent-mixed30` | 효과 이력 packing, 10개 전체 응답 동일·DB/제품 소스 불변 | 일보 10.61→5.24초. 개선 후보지만 2초 상한 미달. [receipt](../../../_attic/runtime/closure/performance/raw-chunk-prototype/parent-mixed30/receipt.json) |
| `parent-slim-mixed30` | 위 후보에 일보의 미사용 Item/IoBatch 컬럼 축소 추가, 전체 응답 동일 | 일보 최대 4.54초로 상한 미달. [receipt](../../../_attic/runtime/closure/performance/raw-chunk-prototype/parent-slim-mixed30/receipt.json) |
| `parent-both-mixed30` | 정합성 10컬럼에도 packing 적용한 사본, 전체 응답 동일·DB/제품 소스 불변 | 후속 receipt 생성 확인. 일보 최대 5.55초, 검색 최대 4.31초로 일반 상한 미달. [receipt](../../../_attic/runtime/closure/performance/raw-chunk-prototype/parent-both-mixed30/receipt.json) |

이 후보들은 정온 교대 측정·전체 matrix·원장 조건 실행 근거를 대신하지 않는다. 정합성까지의 generic packing은 채택하지 않았다. 후속 제품에는 효과 이력 4컬럼의 fixed64 raw TEXT packing과 일보 Item/IoBatch 미사용 컬럼의 `load_only` 제외만 반영했다. 효과 이력의 독립 리뷰에서 기존 Core는 읽지만 CTE 부가 열 때문에 SQLite 행 길이 제한을 넘는 P2를 재현했다. 정확한 `SQLITE_TOOBIG` 코드에만 원 Core를 재시도하도록 보정했고, 다른 오류 전파·원 Core도 큰 경우의 동일 실패를 포함한 관련 25개가 통과했다. 첫 RED/GREEN과 최종 실행은 대화 도구 기록이며 별도 재현 로그와 구분해 [경계 수정 근거](../../../_attic/runtime/closure/performance/effect-length-boundary-evidence/README.md)에 연결했다. 후속 독립 읽기 검토와 메모리 재현에서 추가 차단 결함은 발견하지 못했다.

일보는 현재 사용하는 Item 4필드와 IoBatch 4필드만 읽고 `raiseload=True`로 누락 필드의 암묵적 추가 조회를 막는다. 실제 과거/현재 품목 표시와 요청 연결/NULL 응답 및 큰 미사용 컬럼 제외를 검증한 신규 4개와 기존 39개, 총 43개가 통과했다. [일보 검사](../../../_attic/runtime/closure/performance/daily-slim-green.xml). packing의 상한은 **한 transport chunk**에 적용되며 전체 메모리 상한을 뜻하지 않는다. 현재 [구현](../../../backend/app/services/inventory_effect_history.py)은 `fetched`, `raw_rows`, `restored`를 전체 보관하므로 메모리 사용은 여전히 O(N)이다.

`final-packing-diagnostic`은 길이 경계 수정 전 효과 소스(`0fde4281…`)의 30동시·30호출·1묶음 진단이다. 10개 endpoint의 cold 전체 응답 hash와 DB hash가 이전 Core 진단과 같고, 후속 호출은 성공 상태를 확인했다. 일보 세 표본은 2.43~3.37초로 모두 2초 상한을 넘으므로 성능 통과가 아니다. [진단 receipt](../../../_attic/runtime/closure/performance/final-packing-diagnostic/receipt.json), [비교 범위 코드](../../../_attic/runtime/closure/performance/final-packing-diagnostic.py). 일보 전체 JOIN까지 Core로 바꾼 별도 ignored 후보도 cold 전체 응답은 같았으나 일보 3.71~6.12초로 속도 이익을 입증하지 못해 채택하지 않았다. 호스트 변동을 통제한 교대 측정이 아니므로 성능 회귀의 원인으로 단정하지 않는다. [Core 후보 진단](../../../_attic/runtime/closure/performance/daily-core.stdout.log).

`final-packing-full-matrix`는 16:23:26~17:24:48 KST에 당시 runner가 계획한 모든 시나리오를 수행하고 종료했다. 시작 snapshot의 효과 소스 `c5f02fbf…`와 일보 소스 `5f31694e…`는 길이 경계 수정 후 고정 작업본과 일치하며 결과의 `source_unchanged=true`다. [입력 소스 hash](../../../_attic/runtime/closure/performance/final-packing-full-matrix/source-hashes.json). 원본에는 프로세스 exit 0, `complete_protocol=true`, `complete_matrix=true`, `accepted=false`, 결과 `pass=false`가 기록됐다. 그러나 단독 4시나리오는 endpoint별 90개인 반면 혼합 6시나리오는 각각 9개뿐이므로 `complete_protocol=true`는 검증기의 당시 판정이며 사용자 요구 충족 근거가 아니다. 시나리오 실행 종료와 충분한 표본 확보·성능 통과를 구분한다. [종료 receipt](../../../_attic/runtime/closure/performance/final-packing-full-matrix-exit.json), [원본 보고 JSON](../../../_attic/runtime/closure/performance/final-packing-full-matrix/report.json).

전체 10개 시나리오 × 10개 경로 중 **당시 검증기 판정은 83개 통과·17개 실패**였다. 혼합 경로의 통과는 부족한 표본으로 계산한 역사적 판정이며 승인된 성능 완료로 승격하지 않는다. 모든 비교의 `successful` 및 로그 모집단 검사는 참이고 상세·정합성 비교 조건도 유지됐지만, 이것은 기준/후보 전체 응답 hash가 모두 같다는 뜻은 아니다. 다음 표는 해당 실행의 원 판정이며 괄호는 후보 p95(ms)다. 기준 p95·비교 판정·쿼리/읽은 행/응답 bytes는 [원본 비교표](../../../_attic/runtime/closure/performance/final-packing-full-matrix/comparisons.json), cold와 개별 표본은 같은 디렉터리의 worker JSON에 보존한다.

| 실행 범위 | 경로별 표본 / 버전 | 당시 통과 / 비교 수 | 절대 상한 FAIL | 상대 회귀 FAIL |
| --- | ---: | ---: | --- | --- |
| 실복제·합성 1,000/5,000/20,000의 단독 1사용자 | 90 | 40 / 40 | 없음 | 없음 |
| 실복제·합성 20,000의 혼합 1사용자 | 9 (부족) | 20 / 20 | 없음 | 없음 |
| 실복제 혼합 10사용자 | 9 (부족) | 6 / 10 | 작업 그룹 (9,639.6) | 검색 (1,165.1), 집중 품목 (737.2), 재고 (423.7) |
| 실복제 혼합 30사용자 | 9 (부족) | 6 / 10 | 작업 그룹 (8,759.3) | 집중 품목 (1,436.2), 일반 품목 (619.2), 작업 상세 (630.2) |
| 합성 20,000 혼합 10사용자 | 9 (부족) | 5 / 10 | 목록 (2,226.1), 검색 (2,778.6), 집중 품목 (2,083.4), 일보 (2,519.9) | 일반 품목 (1,369.4) |
| 합성 20,000 혼합 30사용자 | 9 (부족) | 6 / 10 | 검색 (2,770.6), 일보 (3,633.7) | 일반 품목 (855.8), 재고 (798.4) |

실복제 혼합의 작업 그룹은 기준 main도 각각 약 9.44초·9.32초였으므로 당시 표본에서 새 변경의 상대 회귀로 판정된 것은 아니지만, 2초 절대 상한 초과는 관측됐다. 최신 main `2d79cd28` 기준의 실행 순서는 당시 [성능 실행 준비](../../../_attic/runtime/closure/performance/final-execution-plan.md)를 따랐으며 그 문서의 혼합 전체 30회 해석도 현재 사용자 계약으로 재사용하지 않는다. 앞선 실패 자료와 이번 실행 원본을 보존하고 승인 기준을 낮추거나 부족한 표본으로 성공 처리하지 않는다.

후속 구간 진단의 실복제 혼합 10사용자에서는 연결 메타데이터 6,093행 fetch가 3.51~3.86초, 배치 라인 5,433행 fetch가 1.36~1.81초였다. 이 비용을 확인한 뒤 전체 연결 메타데이터와 그룹 규칙을 유지하면서 IoBundle/IoLine 상세만 페이지 선택 뒤 선택 배치 전체에 조회하도록 바꿨다. 신규 검색 없음·일치·불일치 3개 RED 후 관련 4파일 78개가 SKIP 없이 통과했다. 독립 정적 검토에서 StockRequest의 NULL 우선순위, 취소 메타데이터, 비일치 형제 행, 같은 배치의 포함·제외 전체 라인 및 기존 호출자의 기본 상세 조회를 보존함을 확인했고 추가 차단 결함은 발견하지 못했다. [회귀 검사](../../../_attic/runtime/closure/performance/batch-page-detail-green.xml), [수정 전 구간 자료](../../../_attic/runtime/closure/performance/profile-real-mixed-phases-001/mixed-u10/phases.json).

수정 전후 실복제 진단은 1/10/30사용자 각각 70개, 총 210개 전체 응답 hash가 같고 각 실행의 DB·소스 hash도 불변이다. 배치 라인 조회는 5,433→245행, 요청 전체는 15,887→10,699행으로 감소했다. 후속 작업 그룹은 1사용자 0.55~0.61초, 10사용자 6.35~6.84초, 30사용자 6.95~7.08초로 동시 사용자 조건에서 여전히 2초 상한을 넘는다. 같은 후속 10사용자 진단의 연결 메타데이터 fetch는 3.52~3.85초로 남아 있으며 GIL·OS·SQLite 원인은 분리하지 못했다. 이 단독 구간 진단을 정온 전체 matrix의 통과로 확대하지 않는다. 품목 공통 suffix 경계는 아직 읽기 검토 후보이며 제품에 반영하지 않았다. [응답 동등성 요약](../../../_attic/runtime/closure/performance/page-detail-response-equivalence.json), [후속 진단 요약](../../../_attic/runtime/closure/performance/profile-real-page-detail-001/summary.json), [후속 구간 자료](../../../_attic/runtime/closure/performance/profile-real-page-detail-001/mixed-u10/phases.json).

그룹 상세의 Item 조회도 실제 소비하는 이름·코드·공정·단위와 ORM 식별용 PK만 읽도록 제한했다. 일보와 같은 `load_only(..., raiseload=True)`를 해당 상세 JOIN에만 적용했으며 거래 전체 열·기존 JOIN·필터는 유지한다. 과거 snapshot/현재 fallback × 활성/소프트 삭제 품목의 신규 4개 RED 후 관련 4파일 82개가 SKIP 없이 통과했다. 과거 PF·현재 TR의 공정 값 직접 단언을 보강한 뒤 같은 4조합도 다시 통과했으며 앞선 82개와 중복 합산하지 않는다. 독립 소비자 검토에서 추가 차단 결함은 발견하지 못했다. 이 읽기 폭 변경만의 성능 효과는 분리해 측정하지 않았다. [RED](../../../_attic/runtime/closure/performance/group-detail-width-red.xml), [82개 GREEN](../../../_attic/runtime/closure/performance/group-detail-width-green.xml), [필드 단언 후 4개 GREEN](../../../_attic/runtime/closure/performance/group-detail-width-fields-green.xml).

메타데이터 packing과 19필드 그룹 투영·선택 후 map 조회는 ignored 사본 실험이며 제품에 반영하지 않았다. 전자는 실제 6,093행을 96개 transport로 운반하고 210개 전체 응답 동등성을 확인했지만 30사용자 작업 그룹은 5.00~5.09초였다. 후자의 packing 병행 후보도 30사용자 3.58~3.60초로 2초 기준을 넘었으며 일반 자료의 동등성을 UUID·저한도·오류 경계 전체의 검증으로 확대하지 않는다. [packing 실험](../../../_attic/runtime/closure/performance/group-metadata-packing-prototype/README.md), [19필드 실험](../../../_attic/runtime/closure/performance/group-projection-prototype/README.md). 추가 scalar 반복 평가를 `MATERIALIZED`로 줄일 수 있다는 가설은 130행의 실제 connected/solo UNION 형태에서 Core/B/MATERIALIZED 모두 130회로 같아 채택 근거를 얻지 못했다. 직접 투영·상관 scalar 두 메모리 검사 모두 값이 같았으며 이 결과를 실자료 성능 측정으로 취급하지 않는다. [직접 투영 counter](../../../_attic/runtime/closure/performance/group-projection-prototype/evaluation-counter-result.json), [상관 scalar counter](../../../_attic/runtime/closure/performance/group-projection-prototype/evaluation-correlated-counter-result.json).

후속 제출 묶음 최적화는 검색 없는 정상 제출의 완결된 묶음을 `limit+1`개 확보하고, lifecycle·독립 행·비정규 식별자·지원하지 않는 DB의 기존 경로를 보존하도록 구현했다. 관련 3파일은 85 PASS·0 SKIP이며, 독립 리뷰에서 권고한 검색 없는 제출 내부 lifecycle의 전체 페이지 검사는 별도 실행으로 1 PASS·0 SKIP이다. 후자는 전체 경로 oracle과 페이지 본문·커서·`has_more`를 비교하고 불량 짝 양쪽 보존 및 metadata 최대 4행을 단언한다. 첫 시도의 fixture helper `TypeError`는 제품 동작에 도달하기 전 인자 오류이며 제품 RED로 계산하지 않는다. [85개 검사](../../../_attic/runtime/closure/performance/submission-envelope-tdd.xml), [후속 lifecycle 검사](../../../_attic/runtime/closure/performance/submission-lifecycle-boundary-verified.xml), [보존한 fixture 실패](../../../_attic/runtime/closure/performance/submission-lifecycle-boundary-green.xml).

`submission-http-oracle-002`에서는 실복제 20개·합성 20,000 자료 20개, 총 40개 요청의 전체 응답 hash가 같았다. 실복제 작업 그룹의 metadata는 6,093→1,306행, 전체 조회는 10,699→3,158행으로 줄었으며 쿼리 16개와 응답 548,975 bytes는 같았다. 검사 중 소스 185파일 및 각 DB hash는 불변이고 `performance_acceptance=false`다. 이는 해당 요청 범위의 응답 동등성과 조회량 감소 근거이며 최종 성능 판정은 아니다. [40개 HTTP 응답 비교 영수증](../../../_attic/runtime/closure/performance/submission-http-oracle-002/receipt.json).

**전체 페이지 검증 `submission-all-pages-oracle-001`은 INVALID/INCOMPLETE이며 제품 FAIL 근거가 아니다.** 실복제 수집 결과는 양쪽 33페이지·1,627그룹·6,095로그와 페이지 본문 hash가 같았다. 합성 20,000 자료는 기준 254페이지·12,700그룹, 현재 233페이지·11,650그룹까지만 수집했고 공통 앞 233페이지 본문은 같다. 후속 조사에서 전체 순회가 worker의 단일 요청용 바깥 120초 제한에 취소됐는데도 oracle이 cold status 0·bytes 0과 순회 완료 여부를 검사하지 않고 부분 파일을 기록한 원인을 확인했다. 경계 index 232·233을 각 버전에서 별도 조회하자 모두 50그룹·metadata 52행·`has_more=true`였고 다음 커서와 전체 본문도 기준 hash와 같았다. [기준 경계 재현](../../../_attic/runtime/closure/performance/submission-boundary-repro-previous-001/receipt.json), [현재 경계 재현](../../../_attic/runtime/closure/performance/submission-boundary-repro-current-001/receipt.json). 각 페이지의 120초를 유지하고 ignored oracle 전체 순회 바깥 제한만 분리·완료 단언을 추가했다. canonical 성능 timeout 기준은 바꾸지 않았다. 이 무효 실행은 후속 성공과 별도로 원본 보존한다. [001 실복제 기준](../../../_attic/runtime/closure/performance/submission-all-pages-oracle-001/real-previous.json), [001 실복제 현재](../../../_attic/runtime/closure/performance/submission-all-pages-oracle-001/real-current.json), [001 합성 기준](../../../_attic/runtime/closure/performance/submission-all-pages-oracle-001/synthetic_20000-previous.json), [001 합성 현재](../../../_attic/runtime/closure/performance/submission-all-pages-oracle-001/synthetic_20000-current.json).

보정한 `submission-all-pages-oracle-002`에서는 실복제 33페이지·1,627그룹·6,095로그와 합성 자료 400페이지·20,000그룹·20,000로그의 전체 순회가 양쪽 모두 `complete=true`다. 추가 cold 응답을 포함한 실복제 34개·합성 401개, 총 435개 전체 응답 본문이 같고 입력 앱 소스 185파일 및 각 DB hash도 불변이다. 435개를 페이지 수로 해석하지 않는다. [002 완료 영수증](../../../_attic/runtime/closure/performance/submission-all-pages-oracle-002/receipt.json)의 `diagnostic_only=true`, `performance_acceptance=false`처럼 이 근거는 고정 자료의 전체 페이지 응답 동등성에 한정한다. 정식 성능 표본·최종 검증 완료·원장 승격을 대신하지 않으며 전체 IN_PROGRESS·성능 FAIL·원장 NOT_RUN은 유지한다.

후속 `submission-diagnostic-001`은 실복제·합성 20,000 자료의 혼합 1/10/30사용자를 **endpoint마다 3회·1묶음**만 측정한 짧은 진단이다. 원본은 `source_unchanged=true`, `complete_protocol=false`, `complete_matrix=false`, `pass=false`다. 실복제 작업 그룹의 표본 p95는 1사용자 725.1→407.3ms, 10사용자 8,466.0→3,259.0ms, 30사용자 8,520.6→3,531.2ms로 감소했지만 동시 조건의 2초 상한은 넘는다. 세 표본의 nearest-rank p95는 최댓값이므로 정식 30회×3묶음 판정을 대신하지 않는다. 아래에는 이 진단에서 기준 미달로 관측된 경로를 전부 기록하며 숫자는 후보 ms다. [짧은 진단 원본](../../../_attic/runtime/closure/performance/submission-diagnostic-001/report.json).

| 짧은 진단 범위 | 절대 상한 초과 | 상대 회귀 조건에 해당 |
| --- | --- | --- |
| 실복제 혼합 10사용자 | 작업 그룹 3,259.0 | 검색 952.9, 집중 품목 608.5, 재고 350.8 |
| 실복제 혼합 30사용자 | 작업 그룹 3,531.2 | 일반 품목 465.4, 재고 1,049.6, 작업 상세 525.4 |
| 합성 20,000 혼합 10사용자 | 검색 2,360.9, 일보 3,049.3 | 일반 품목 729.2, 재고 702.3 |
| 합성 20,000 혼합 30사용자 | 일보 3,925.2 | 일반 품목 807.6, 재고 699.9 |

이 결과는 후속 구간 분석에 사용할 진단이며 정식 성능 통과 또는 전체 완료 근거가 아니다. 충분한 표본의 최종 측정과 남은 통합 검증을 계속 요구한다.

후속 ignored `submission-metadata-pack-001`은 현재 bounded submission 조회의 원래 16필드만 transport packing한 후보이며 **NO ADOPTION**이다. 1/10/30사용자의 70개씩 총 210개 정규화 전체 응답이 이전 고정 참조와 같고 소스·DB도 불변이었다. metadata의 논리 1,306행을 물리 21행으로 운반했지만, 30사용자의 HTTP wall은 3.29~3.31초로 2초 상한을 넘었다. 같은 조건의 고정 참조는 3.37~3.41초이며 교대 측정이 아니므로 차이를 확정 개선으로 취급하지 않는다. endpoint당 3회·1묶음 진단으로 `formal_acceptance_evidence=false`이고 제품 미반영 상태를 유지한다. [후보 비교 요약](../../../_attic/runtime/closure/performance/submission-metadata-pack-001/comparison-summary.json), [실험 범위](../../../_attic/runtime/closure/performance/submission-metadata-pack-001/README.md).

별도 `submission-warm-cprofile-001`은 1사용자에서 cold 1회와 준비 1회를 제외하고 세 번째 요청 1회에만 profiler를 적용했다. 준비 요청의 HTTP wall은 약 667.7ms·483.7ms이며, profiled warm 요청은 HTTP 572.6ms·endpoint 554.6ms·endpoint thread CPU 546.9ms다. cProfile의 endpoint 누적 약 551ms 중 SQL execute 약 220ms·그룹 계산 약 118ms를 관측했으나 profiler 비용을 포함한 단일 warm 호출이므로 cold 지연이나 30동시 병목의 정량 근거로 합치지 않는다. 중첩된 Query/서비스/endpoint 시간을 더하지 않고 endpoint 밖의 응답 직렬화 등 CPU도 포함했다고 주장하지 않는다. [warm 구간 원문](../../../_attic/runtime/closure/performance/submission-warm-cprofile-001/phases.json), [cProfile](../../../_attic/runtime/closure/performance/submission-warm-cprofile-001/history-groups-cprofile.txt). 이 두 진단 뒤에도 성능 acceptance FAIL과 최종 backend·canonical full 9그룹·복구·커밋·push·CI 미완료를 유지한다.

후속 SQLite 역거래 존재 검사 보정은 **제품에 반영했다**. `request_order_stock.py`는 실제 저장형이 TEXT인 PK만 문자열 CAST로 비교해 역참조 인덱스를 사용하고, INTEGER·REAL·BLOB·NULL은 원래 EXISTS 식을 유지한다. 두 분기 모두 같은 품목 조건을 보존하며 PostgreSQL은 기존 식을 사용한다. 독립 읽기 검토에서 현재 스키마와 기존 저장값 범위의 추가 차단 결함은 발견하지 못했다. 실제 NUMERIC DDL의 `123/00123`, `125/1.25e2`, 역거래 없는 `127`에서 기존 취소 집계 동등성과 인덱스 SEARCH를 검사한 최종 [reversal-affinity-contract-green.xml](../../../_attic/runtime/closure/performance/reversal-affinity-contract-green.xml)은 **73 PASS·0 SKIP·native exit 0**이다. 최초 [reversal-affinity-red.xml](../../../_attic/runtime/closure/performance/reversal-affinity-red.xml)은 잘못된 fixture 인자의 오류이며 제품 RED가 아니다. 실제 인덱스 사용 단언의 [contract RED](../../../_attic/runtime/closure/performance/reversal-affinity-contract-red.xml)와 실패 1건이 남은 [reversal-affinity-green.xml](../../../_attic/runtime/closure/performance/reversal-affinity-green.xml)도 원문 그대로 보존하며 최종 성공 파일과 구분한다.

[reversal-affinity-http-001](../../../_attic/runtime/closure/performance/reversal-affinity-http-001/receipt.json)은 native exit 0으로 실복제 20개·합성 자료 20개, 총 40개 전체 HTTP 본문 동등성과 앱 소스 185파일·각 DB hash 불변을 확인했다. `diagnostic_only=true`, `performance_acceptance=false`인 조회 응답 보존 근거이며 앞선 다른 실행의 개수와 합산하지 않는다. PostgreSQL 실제 실행은 이번 근거에 포함되지 않는다.

[sql-execution-probe-003](../../../_attic/runtime/closure/performance/sql-execution-probe-003/queries.json)은 읽기 전용 연결에서 기존 식과 인덱스 사용 식의 전체 16행이 같음을 단언했다. 세 번 포착한 SQL 쌍마다 각 5회 실행했고, 쌍별 중앙값 범위는 기존 65.3~75.0ms에서 보정 3.9~5.6ms로 감소했다. 모든 개별 표본의 최솟값·최댓값이나 HTTP p95라는 뜻은 아니다. [진단 영수증](../../../_attic/runtime/closure/performance/sql-execution-probe-003/receipt.json)은 DB hash 불변을 기록한다. 새 변경을 적용한 mixed 성능은 아직 측정하지 않았으며, 기존 동시 조건의 2초 상한 미충족과 전체 성능 acceptance FAIL·IN_PROGRESS를 유지한다.

불량 연결의 60초 초과 후보 탐색 중단도 **제품에 반영했다**. 안정된 시간순 정렬에서 남은 후보가 모두 60초를 넘으면 원 matcher도 일치시킬 수 없으므로 중단한다. 사용된 원건 제외·탐욕 방식의 최초 일치 선택·정확히 60초 포함을 유지하고 `datetime.max`에서도 시간 덧셈 없이 판정한다. [contract RED](../../../_attic/runtime/closure/performance/defect-window-contract-red.xml)는 matcher 호출 45,449회가 허용한 906회를 넘는 실제 실패이며, 최종 관련 4파일 [defect-window-contract-green.xml](../../../_attic/runtime/closure/performance/defect-window-contract-green.xml)은 **124 PASS·0 SKIP·native exit 0**이다. 독립 읽기 검토에서 정상 nullable 문자열과 날짜 입력의 그룹 결과에 추가 차단 결함은 발견하지 못했다. 주석·타입 보완 뒤 [같은 경계 2개 재검사](../../../_attic/runtime/closure/performance/defect-window-annotations-green.xml)는 기존 124개와 합산하지 않는다. 별도 서비스인 역거래 보정의 기존 73개 근거는 유지하며 [같은 역거래 경계 1개 재검사](../../../_attic/runtime/closure/performance/reversal-affinity-annotations-green.xml)를 더해 74개 전체 실행으로 표시하지 않는다.

복구 담당이 ignored 경로에 보존한 [defect-window-probe-002 영수증](../../../_attic/runtime/closure/recovery/defect-window-probe-002/receipt.json)과 [native exit 0](../../../_attic/runtime/closure/recovery/defect-window-job-002/exit.json)은 복구 실행 결과가 아닌 그룹 함수 진단이다. 합성 500자료와 이름 붙인 15경계의 4가지 그룹 옵션, 총 **2,060회 전체 그룹 비교**가 같았다. 이는 그룹 개수나 pytest 통과 수가 아니다. 실제 조회에서 포착한 cold 6,093행·warm 1,306행 두 호출의 그룹 구조·키·원래 레코드 순서/동일성도 세 호출 모두 같았다. 당시 소스와 복제 DB hash 불변을 확인했으며 새 제품 버전의 전체 HTTP 성능 검증으로 확대하지 않는다.

같은 실제 warm 1,306행으로 준비 호출 후 ABBA를 5묶음 수행한 함수 단독 중앙값은 41.665→4.835ms이고, 별도로 센 matcher 호출은 113,343→1,832회다. suffix 목록 슬라이스와 60초 안에 몰린 후보 탐색은 남으므로 전체 실행시간이 O(N)이 됐다고 주장하지 않는다. 정상 `Optional[str]` 도메인을 벗어난 정수 actor가 60초 밖에 있을 때 이전의 `AttributeError`가 새 경로에서는 생략되는 예외 차이도 진단에 기록했다. 정상 문자열/NULL 입력의 업무 판정 보존과 이 비정상 입력의 오류 시점은 구분한다. 이 진단 시점에는 30동시 재측정과 metadata helper 보완이 남아 있었다. 후속 소스 고정·검증 범위는 아래 별도 근거를 따르며, 충분한 표본의 성능 재검증 전까지 acceptance FAIL·전체 IN_PROGRESS·원장 NOT_RUN을 유지한다.

후속 `_bounded_submission_metadata`는 MATERIALIZED source를 재사용하고, canonical 날짜 26+26자와 UUID 32자의 전체 연결값을 GROUP MAX anchor로 선택하도록 보완했다. 비정규 자료의 전체 반환, NULL envelope와 lifecycle 전체 보존, 검색 우회, 낮은 SQLite 제한과 TOOBIG 원문 fallback, 단일 UNION snapshot을 유지한다. 공개 소비자의 외부 3키 ORDER BY가 실제 그룹 입력 순서를 결정하며, 동률 lifecycle·UUID 별도 표기의 값/타입/순서를 직접 비교한 회귀도 포함했다. 독립 읽기 검토에서 이 범위의 추가 차단 결함은 발견하지 못했다. 최종 관련 [final-related.xml](../../../_attic/runtime/closure/performance/submission-groupmax-tdd/final-related.xml)은 **95 PASS·0 SKIP·native exit 0**이며 [completion.json](../../../_attic/runtime/closure/performance/submission-groupmax-tdd/completion.json)에 helper만 변경한 AST 범위, Ruff·diff 검사 exit 0과 소스 SHA `f1493c52…` 동결을 기록했다. 잘못 추정한 테스트 파일명의 수집 명령 실패는 제품 RED가 아니며 해당 로그를 보존했다. PostgreSQL 경로의 원문 fallback·컴파일 검사는 실제 PostgreSQL 실행 통과를 뜻하지 않는다. 기존 124개·73개 및 좁은 재검사 수와 합산하지 않는다.

세 제품 변경인 역거래 affinity·불량 60초 탐색·GROUP MAX를 함께 비교한 [final-read-http-001](../../../_attic/runtime/closure/performance/final-read-http-001/receipt.json)은 native exit 0으로 실복제 20개·합성 자료 20개, **총 40개 전체 HTTP 본문 동등성**을 확인했다. 세 이전 입력 snapshot hash와 앱 185소스·각 읽기 전용 복제 DB hash 불변을 기록했으며 `diagnostic_only=true`, `performance_acceptance=false`다. 이는 이전 `reversal-affinity-http-001`과 다른 통합 입력의 비교이며 개수를 합산하지 않는다. 이후 고정 입력의 전체 순회와 실복제 동시 구간 진단은 아래 별도 근거로 구분한다.

[final-read-all-pages-http-001](../../../_attic/runtime/closure/performance/final-read-all-pages-http-001/receipt.json)은 native exit 0으로 실복제 33페이지·1,627그룹·6,095로그와 합성 400페이지·20,000그룹·20,000로그의 양쪽 전체 순회 `complete=true`를 확인했다. 추가 cold 응답을 포함한 실복제 34개·합성 401개, **총 435개 전체 HTTP 응답 본문이 정확히 같고** 앱 185소스·각 DB hash도 불변이다. 435개는 페이지 수가 아니며 앞선 40개나 이전 소스의 전체 순회 결과와 합산하지 않는다. `diagnostic_only=true`, `performance_acceptance=false`처럼 전체 결과 보존의 근거이며 성능 통과를 뜻하지 않는다.

[final-read-real-phases-001 요약](../../../_attic/runtime/closure/performance/final-read-real-phases-001/summary.json)은 실복제 1/10/30사용자에서 각각 timed GET 30회, 총 **90회 모두 HTTP 200**과 DB·소스 불변을 기록했다. 각 동시도의 10조회에 세 표본씩인 구간 진단으로 `formal_acceptance_evidence=false`이며 조회별 30회×3묶음과 양 버전의 비교를 대신하지 않는다. [30사용자 원본](../../../_attic/runtime/closure/performance/final-read-real-phases-001/mixed-u30/worker-result.json)의 작업 그룹은 3,636.4·3,626.8·3,544.3ms로 모두 2초 상한을 넘는다. 세 표본의 p95가 최댓값이라는 한계도 유지하며 **2초 기준 FAIL·정식 성능 protocol 미완료**로 기록한다. 별도 standalone cProfile 1회는 이 90회에 포함하지 않는다.

후속 [current-metadata-pack-paired-001](../../../_attic/runtime/closure/performance/current-metadata-pack-paired-001/paired-001/receipt.json)은 현재 소스 기준 AB/BA 두 비교 각각 전체 응답 70개 동등, 모든 native exit 0, 앱 185소스·DB hash 불변을 기록했다. 작은 입력과 실제 metadata의 16개 값·타입·순서 비교도 통과했다. 30사용자 작업 그룹은 원문 3.22~3.37초 대비 후보 2.88~3.13초였지만 후보 역시 2초 상한을 넘었으므로 **NO ADOPTION**으로 결정했다. 각 조회 세 표본의 진단이며 `formal_acceptance_evidence=false`, `acceptance_or_adoption_not_established=true`인 영수증을 성능 PASS로 바꾸지 않는다. 제품에는 반영하지 않는다.

당시 정합성 cold 599-query 관측만으로 개선 완료를 주장하지 않았으며, 후속으로 PK 일괄조회와 snapshot 필요 열 읽기를 제품에 반영했다. PK 관련 [green.xml](../../../_attic/runtime/closure/recovery/integrity-pk-bulk-001/green.xml)은 **123 PASS·0 SKIP**, [검증 요약](../../../_attic/runtime/closure/recovery/integrity-pk-bulk-001/verification-summary.json)은 native exit 0을 기록했다. 이후 읽기 폭 관련 [related.xml](../../../_attic/runtime/closure/performance/integrity-snapshot-width-tdd-001/related.xml)은 **144 PASS·0 SKIP·native exit 0**이며 [completion.json](../../../_attic/runtime/closure/performance/integrity-snapshot-width-tdd-001/completion.json)의 최종 `inventory_integrity.py` SHA는 `a3fa75e3…`다. 두 실행은 관련 범위가 겹치므로 합산하지 않는다.

유효한 [integrity-bulk-width-http-002](../../../_attic/runtime/closure/performance/integrity-bulk-width-http-002/receipt.json)는 실복제·합성 각 20개, **총 40개 전체 HTTP 본문 동등**과 앱 185소스·각 DB hash 불변을 확인했다. 정합성 cold 쿼리는 실복제 599→226, 반환 행은 양쪽 18,153행이며 합성은 쿼리 29→29·20,203행으로 같다. 이 실행의 [native exit 0](../../../_attic/runtime/closure/performance/integrity-bulk-width-http-002/native-observation.json)은 직접 도구 종료 관찰의 사본이다. 앞선 [-001의 native exit 1](../../../_attic/runtime/closure/performance/integrity-bulk-width-http-001/native-observation.json)은 마지막 영수증 생성 중 상대경로 기록 오류이며 완료 영수증이 없는 미통과 이력으로 보존한다. 두 관찰 사본은 detached 실행 영수증이 아니며 -002의 실제 40본문 비교 영수증이 응답 보존 근거다. `performance_acceptance=false`를 유지한다.

[후속 구간 진단](../../../_attic/runtime/closure/performance/integrity-bulk-width-real-phases-001/summary.json)은 1/10/30사용자 timed GET 총 90회가 모두 200이고 DB·소스 불변임을 기록했다. [30사용자 원본](../../../_attic/runtime/closure/performance/integrity-bulk-width-real-phases-001/mixed-u30/worker-result.json)의 조회별 세 표본에서 작업 그룹은 3.87~4.16초, 정합성은 5.95~6.93초다. 그룹은 2초를 초과하는 진단 신호이고 정합성은 별도 10초 상한 안이지만, 추가 phase 계측과 unpaired 실행이므로 정식 p95·상대회귀 판정을 대신하거나 이번 변경이 느려짐의 원인이라고 단정하지 않는다. `formal_acceptance_evidence=false`이며 AB/BA 비교 준비와 원래 canonical benchmark의 최종 재판정은 대기 중이다. 새 화면 검사·최종 backend 전체·canonical full 9그룹·실제 세 복구·커밋·push·최종 HEAD CI도 미완료이며 전체 IN_PROGRESS·성능 기준 미충족 상태·원장 NOT_RUN을 유지한다.

후속 [integrity-paired-current-001 AB/BA 요약](../../../_attic/runtime/closure/performance/integrity-paired-current-001/paired-001/comparison-summary.json)은 **전체 140본문 동등**, driver와 네 child의 native exit 0, 소스·DB 불변을 확인했다. 동일한 18,153행을 반환하며 정합성 쿼리는 599→226, endpoint thread CPU 중앙값은 1,687.50→1,390.62ms, HTTP wall 중앙값은 5,671.50→5,032.58ms다. 앞선 unpaired 실행과 구분되는 국소 개선 진단이며 `formal_acceptance_evidence=false`다. 전체 성능 통과나 앞선 40본문 검사와의 합산 근거로 쓰지 않는다.

[integrity-width-canonical-diagnostic-001](../../../_attic/runtime/closure/performance/integrity-width-canonical-diagnostic-001/report.json)은 원래 canonical benchmark로 main과 현재 입력을 비교했으며 [종료 기록](../../../_attic/runtime/closure/performance/integrity-width-canonical-diagnostic-001-exit.json)의 native exit는 0이다. 하지만 조회별 **3회×1묶음**이므로 `complete_protocol=false`, `complete_matrix=false`, `accepted=false`다. 앱 185소스 중 정합성 `a3fa75e3…`를 포함한 입력은 불변이고, 양 버전의 12개 worker 모두 DB 불변이다. HTTP 성공·요청 표본 수·적용 대상 조회 모집단/상세/정합성 동등성 조건의 실패는 없다. 이 조건과 앞선 정확한 whole-body 비교를 정식 성능 완료로 확대하지 않는다.

[comparisons.json](../../../_attic/runtime/closure/performance/integrity-width-canonical-diagnostic-001/comparisons.json)의 측정 60조건 중 **12개가 진단 기준 미달**이다. 절대상한 4개와 상대회귀 조건 8개는 서로 겹치지 않는다.

| 자료·동시도 | 절대상한 초과 | 상대회귀 조건 해당 |
| --- | --- | --- |
| 실복제 1사용자 | 없음 | daily |
| 실복제 10사용자 | history_groups | history_search, hot_item |
| 실복제 30사용자 | history_groups | history_search, general_item, operation_detail |
| 합성 20,000·10사용자 | daily | 없음 |
| 합성 20,000·30사용자 | daily | general_item, inventory |

실복제 30사용자 그룹은 main 9,015.5→현재 **2,933.7ms**, 합성 20,000·30사용자 일보는 30,566.0→**3,717.5ms**로 개선 관측에도 2초 상한을 넘는다. 실복제 30사용자 정합성은 11,169.7→**4,915.0ms**로 10초 상한 안이다. 보고서의 p95 필드는 이 실행에서 각 세 표본의 최댓값이며, 정식 30회×3묶음 p95 판정이 아니다. 기준 미충족 상태와 최종 성능 검증 미완료를 유지하고, 원장 NOT_RUN·TODO 2완료/7미완료를 변경하지 않는다.

## 코드·DB·프론트·Node 공동복구

독립 [0038→0044 DB 보존 영수증](../../../_attic/runtime/closure/recovery/db-preservation-0044-001/receipt.json)은 `REAL_0038_TO_0044_DB_PRESERVATION_ONLY` 범위의 PASS이며 [실제 종료 native exit 0](../../../_attic/runtime/closure/recovery/db-preservation-0044-001/exit.json)을 확인했다. 테이블 면제 없이 기존 모든 행·컬럼 값은 승인된 `employees.level` 제거만 제외하고 동일하다. 0040의 submission·reason backfill은 [기존 main revision과 줄바꿈 정규화 후 동일](../../../_attic/runtime/closure/recovery/db-preservation-0044-001/0040-main-equivalence.json)한 동작이다. 이를 새 nullable 컬럼의 신규 백필로 설명하지 않는다. 0041~0043 추가 nullable 값은 NULL이며 main의 suppliers.scope 추가는 warehouse로 구분한다. 각 단계 FK·integrity 검사와 원본/baseline DB 바이트·migration/model 소스 불변도 확인했다. `paired_artifact_restore_executed=false`이므로 아래 실제 코드·프론트·Node 공동복구의 PENDING을 해제하지 않는다.

| 검증 | 현재 확보한 실제 근거 | 적용 범위와 남은 확인 |
| --- | --- | --- |
| 이전 0042 공동복구 진단 | 이전 DB 설치 직후 별도 프로세스 강제 종료, receipt SHA를 지정한 명시 재개, 경쟁 쓰기 차단, 이전 DB 전 테이블·코드·프론트·Node 정확 복원. [진단 결과](../../../_attic/runtime/closure/recovery/0038-0042-0038-real-build-resume-diagnostic.json). | 당시 캡처한 실제 빌드 쌍의 진단이다. 서비스 stop/ownership은 대체 함수였으며 현재 0044 설치·실제 기동 리허설 결과로 사용하지 않는다. |
| 실제 격리 프로세스 | 포트 점유 거부·소유 프로세스 종료/해제의 실제 격리 검사. UTF-8 모드의 한국어 Windows 출력 실패를 재현하고 native bytes로 수정한 관련 47개 통과. [결과](../../../_attic/runtime/closure/recovery/owner-native-bytes-summary.json). | 운영 서비스·예약 작업을 조작한 검증이 아니다. 소유권 불명과 명령 실패의 차단을 유지한다. |
| source capture 경계 | E2E가 생성하는 정확한 임시 경로만 source capture에서 제외하고 산출물 byte 보존과 일반 소스 pinning을 유지한 48개 통과. [결과](../../../_attic/runtime/closure/recovery/source-runtime-summary.json). | 앞선 47개와 겹치므로 합산하지 않는다. 최종 공동복구 완료와 구분한다. |
| crash 증거·재개 harness | raw 증거 보존·덮어쓰기 거부·자식 식별/종료 경계의 신규 9개 RED 뒤 관련 19 PASS·0 SKIP. [요약](../../../_attic/runtime/closure/recovery/crash-audit-summary.json), [XML](../../../_attic/runtime/closure/recovery/crash-audit-green.xml). | `actual_recovery_executed=false`, `c5_assembled=false`다. harness 회귀를 실제 0044 공동복구로 계산하지 않는다. |
| 최종 wrapper 입력 연결 | 실행 전 manifest SHA, 자식 실행 전/성공 직전 재확인, 원래 이전 코드·프론트·Node·설정과 정확한 복구 영수증 연결의 9개 회귀가 통과했다. [요약](../../../_attic/runtime/closure/recovery/wrapper-binding-summary.json), [XML](../../../_attic/runtime/closure/recovery/wrapper-binding-green.xml). | ignored wrapper의 국소 검사다. 앞선 crash 19개와 합산하지 않는다. `actual_wrapper_executed=false`이며 실제 `failure-resume`·`hard-exit`·`normal` 세 시나리오는 모두 **NOT_RUN**이다. |
| 현재 production 빌드·번들 | 초기 +639 bytes, c2 +68 bytes 실패를 보존했다. 동일 badge class/style 공유 후 해당 출하 180개가 통과했고, **c3 production 빌드 및 번들 3,145,670 / 3,145,728 bytes가 통과했다**. [표시 검증](../../../_attic/runtime/closure/final-shipping-badge.log), [c3 준비 로그](../../../_attic/runtime/closure/recovery/final-preparation-c3.log), [bundle 원결과](../../../_attic/runtime/closure/recovery/c3/prepared/255bdbc4ab8ed2938f2807844aa6f8ee0fc3289cdf8f8b89eff2e907d54056d5/bundle.log). | 승인 한도는 변경하지 않았다. 이 빌드 통과를 최종 성능·복구·원장 완료로 확대하지 않는다. |
| QA 빌드 쌍 | qa1/qa0 산출물은 준비됐고 각각 `QA_ONLY` 영수증을 보존했다. [qa1](../../../_attic/runtime/closure/recovery/qa1/qa-receipt.json), [qa0](../../../_attic/runtime/closure/recovery/qa0/qa-receipt.json). | QA 준비와 실제 설치·기동·공동복구 완료를 구분한다. 후속 backend 성능 보정 이후 최종 source와의 연결을 다시 확인한다. |
| 당시 0044 공동복구 준비 | 첫 c4 실행은 14:41:55 KST에 시작했지만 15:37 이전 종료됐고 완료 결과가 없다. [c4 시작 로그](../../../_attic/runtime/closure/recovery/c4/failure-resume.log). 후속 확인은 41,509파일 초기 복제본의 hash 일치를 기록했으며 `installation_or_recovery_started=false`다. [초기 복제본 확인](../../../_attic/runtime/closure/recovery/run-6e4c17d0/initial-fixture-verified.json). 첫 wrapper의 `exitCode=null`과 별도로 v2 검증은 15:58:26 KST exit 0이며 초기 복제 재사용 안전 검사 9개도 통과했다. [재사용 준비 요약](../../../_attic/runtime/closure/recovery/initial-fixture-reuse-summary.json). | 초기 복제본 검증과 실제 복구 완료를 구분한다. 그 시점에는 c5 실제 리허설을 시작하지 않았다. 후속 C14 실패 이력도 전체 성공으로 승격하지 않으며, 설치→강제 종료→명시 재개→정확 복원·실제 HTTP 기동/종료·포트 해제·거부 경계의 완료 결과는 **PENDING**이다. |
| PostgreSQL 보존·잠금·조회 snapshot·복구 | [CI workflow](../../../.github/workflows/ci.yml)는 PG16 도구·격리 DB head/대상 테이블 준비와 필수 JUnit의 native 종료 코드·클래스별 수집 수·SKIP 거부를 검사한다. Windows 격리 PG16 최종 실행 `portable-pg16-20261008T172921Z-34da8601`은 필수 첫 24개·둘째 60개가 **84 PASS·0 FAIL/ERROR/SKIP·native 0**이다. 부모도 실제 XML을 독립 대조했다. 선행 스키마 13개와 실제 dump/restore 집중 2개도 통과했으며 필수 분모와 중복 합산하지 않는다. 입력 해시 일치·소유 cluster 종료·전용 포트 반환을 확인했다. 앞선 RED·48 PASS/23 FAIL·집중 검사 실패는 당시 이력으로 보존한다. [최종 영수증](../../../_attic/runtime/closure/pgqa/portable-pg16-20261008T172921Z-34da8601/receipt.json). | 로컬 Windows PG16 성공은 Linux CI job과 Windows 코드·Node·프론트·DB 공동복구 완료를 대체하지 않는다. 이 두 종료 기준은 **PENDING**이다. PostgreSQL 기본값/CHECK의 일부 진단 문자열은 기존 표시 정규화로 대소문자 차이가 같아 보일 수 있으나, 실제 판정은 원문·타입·토큰을 사용한다. |

보존 판단에서는 승인된 `employees.level` 삭제와 main의 `suppliers.scope` 기본값 추가를 각각 명시하고, 그 외 기존 값·연결·PIN과 신규 nullable 필드의 무단 backfill 여부를 비교한다. 실제 직원 예약 작업이나 배포 후 업무 재개를 수행한 결과로 보고하지 않는다.

두 후속 제품 변경 때문에 c4 실제 복구 재시작은 보류하고, 같은 프론트·Node·QA 준비물을 재사용하되 최신 backend 코드로 c5를 재조립할 예정이다. c5의 소스 연결·실제 설치/복원 완료 근거는 아직 없다.

## 원장·증거·개인정보

2026-10-08 확정한 후속 조회 두 건은 국소 회귀 근거만 추가한다. 일보의 기존 `include_line_details=False` optout은 미소비 IoBundle/IoLine SQL 1회→0회만 바꾸고 실제 전체 HTTP 본문 2건·요청자/승인자/시각/history_batch/수량을 유지했다. RED 2개→GREEN 2개·관련 20 PASS·0 SKIP, Ruff/diff/native exit 0이며 일보 SHA는 `ce35c3c4…`다. [일보 영수증](../../../_attic/runtime/closure/performance/daily-line-detail-tdd-001/completion.json).

envelope kind OR를 COALESCE로 바꾼 한 조건도 기존 guard·CTE·cursor·limit·fallback을 유지한다. 전체 typed 1,306행의 16개 값·타입·순서와 중복 평가 감소 계약 RED→GREEN 1개, 관련 95 PASS·0 SKIP 및 Ruff/diff/native exit 0을 확인했다. `transactions.py`는 이전 `f1493c52…`에서 `8d08fe43…`로 바뀌었으며 [TDD 영수증](../../../_attic/runtime/closure/performance/envelope-kind-coalesce-tdd-001/green-receipt.json)과 [실복제 2SELECT 동등·앱185/DB 불변](../../../_attic/runtime/closure/performance/envelope-kind-coalesce-tdd-001/actual-typed-receipt.json)을 보존했다. 앞선 교대 SQL 중앙값 92.99→86.88ms는 [국소 진단](../../../_attic/runtime/closure/performance/envelope-kind-coalesce-001/receipt.json)이며 HTTP 2초 상한 충족이나 정식 성능 PASS를 뜻하지 않는다.

UUID 공유 객체 캐시는 반환 객체별 독립성 변경으로, 정수 캐시 후 UUID 새 생성은 실제 입력 순서 replay 전부의 지연 증가로 각각 NO-GO·제품 미채택이다. [공유 객체 영수증](../../../_attic/runtime/closure/performance/uuid-cache-prototype/replay-receipt.json), [정수 캐시 영수증](../../../_attic/runtime/closure/performance/uuid-cache-prototype/int-cache-replay-receipt.json), [native 종료 0](../../../_attic/runtime/closure/performance/uuid-cache-prototype/native-observation.json). 효과 이력 nested JSON도 NUL 접미 원문에서 기존 JSONDecodeError를 숨기는 SQLite 반례 때문에 NO-GO·미채택, native exit 0이다. 실DB/HTTP/20k 측정을 더 실행하지 않고 원래 raw processor·오류를 유지했다. [반례 결과](../../../_attic/runtime/closure/performance/nested-json-nogo-001/result.json), [종료](../../../_attic/runtime/closure/performance/nested-json-nogo-001/exit.json).

당시 제품 SHA는 transactions `8d08fe43…`, daily `ce35c3c4…`, integrity `a3fa75e3…`, effect history `c5f02fbf…`, UUID base `d6981f3e…`다. [고정 입력](../../../_attic/runtime/closure/performance/final-coalesce-formal-001/source-hashes.json)의 정식 30회×3묶음 검증은 2026-10-09 00:37:01 KST에 종료했다. 조회·버전·동시도별 90개 표본을 실제 확인했으며 `complete_protocol=true`, `complete_matrix=true`, `source_unchanged=true`다. [전체 비교](../../../_attic/runtime/closure/performance/final-coalesce-formal-001/comparisons.json)는 **100개 중 80 PASS·20 FAIL**이고 `accepted=false`다. 도구 native exit 0은 측정 완료이며 성능 통과가 아니다. 그 시점에는 전체검사·실제 공동복구·커밋·CI가 미완료이고 원장 NOT_RUN, 체크리스트 2완료·7미완료였다. 후속 C13 기능 strict는 완료됐지만 이 성능 실패 이력을 현재 native003의 최종 판정으로 사용하지 않는다. 기능 커밋의 개수는 확정하지 않으며 최종 HEAD CI 성공 뒤 활성 TODO 변경을 위한 문서 커밋이 추가로 필요할 수 있다.

초안 직전 정규화와 `--tier full --plan`은 통과했다. 당시 원본 351개 중 eligible 345개·보류 6개, eligible 조건 1,058개는 연결되어 있었고 실행 완료는 0개였다. 연결률과 실제 실행 완료율을 합치지 않는다. [소스/binding 대조](../../../_attic/runtime/closure/shipping-final-refresh-review.json).

단일 UNION snapshot 후 당시 정규화 `--check`와 full plan은 exit 0이며 모든 조건은 `NOT_RUN`이었다. 새 성능·PostgreSQL 회귀 파일은 당시 소스 목록과 G7 분할에 포함됐지만, 이 준비 확인을 실제 원장 실행 또는 PostgreSQL 통과로 계산하지 않는다. [당시 소스·준비 대조](../../../_attic/runtime/closure/solo-snapshot-preparation-review.json).

두 후속 변경 전 Core 소스의 준비 snapshot은 [Core 준비 대조](../../../_attic/runtime/closure/scalar-core-preparation-review.json)에 보존했다. 후속 제품 변경 뒤에는 해당 snapshot을 최신 소스의 준비 완료로 재사용하지 않는다. 결과 문서와 정제 요약은 canonical의 제품·테스트 snapshot 범위 밖이며, 이들의 서술만 바꾸면 테스트를 다시 실행할 필요가 없다. 다만 원장 조건·binding·결정 계약 변경, 추적 제품/테스트/설정의 추가·삭제·수정, 실행 증거 원본 변경은 별도 검증 경계다. 파일별 범위와 필요한 재검사는 [snapshot 범위 검토](../../../_attic/runtime/closure/canonical-snapshot-scope-review.md)를 따른다.

packing·일보 보정 후 `--check`, `--tier full --plan`과 준비 대조는 exit 0이었다. [새 준비 대조](../../../_attic/runtime/closure/final-packing-preparation-review.json)는 해당 실행 시점의 계획 345 case·9그룹, 조건 1,058개, 소스 2,183파일과 신규 일보 성능 테스트의 포함을 기록한다. 이전 단일 조회 snapshot 대비 조건 fingerprint 변경은 0이며 `testsExecuted=false`, 모든 실행 상태 `NOT_RUN`, `globalPass=false`다. 이는 소스·계획 준비 결과이며 canonical 실행·증거 승격·strict 완료 근거가 아니다.

엄격 판정은 실제 selector와 assertion의 소스 hash, 수집한 전체 매개변수 인스턴스, 실행 완료 receipt와 run ID, 현재 제품·테스트·설정 및 파일 목록, 조건 fingerprint, 실제 PNG와 DB revision·fixture/논리 snapshot·boot identity를 연결한다. 누락·FAIL·SKIP·retry·일부 조건만 통과한 상태를 전체 case PASS로 올리지 않는다. API 호출 성공만으로 브라우저 조건을 충족했다고 처리하지 않는다. [검증 안내](2026-10-07-mes-expectation-verification-guide.md).

현재 보존한 실패 실행의 JSON 23개와 XML 5개 구조 검토에서는 민감 필드·credential 형식을 발견하지 않았다. QA DB는 운영 DB 원문 복사가 아니라 저장소 정적 seed에서 만들지만, 직원 이름 seed를 사용하므로 화면을 익명 자료로 설명하지 않는다. [개인정보 검토](../../../_attic/runtime/closure/evidence-privacy-review.md). 2026-10-09 실제 PNG 열람에서도 해당 이름을 확인했으며, 합성 QA DB의 이름만 익명화한 새 브라우저 증거를 준비한다. 과거 PNG와 실패 근거는 로컬에 보존한다.

승격 복사 범위는 receipt·원래 execution·raw·collection·환경·필수 PNG다. 진단 ZIP·DB·seed 원문·영상·CSV/XLSX 원본 파일은 이 목록에 넣지 않는다. raw 안의 inline 첨부는 원본 byte로 보존한다. 새 성공 실행의 실제 자료는 별도로 재검토한다. 이 문서에는 개인자료 값·비밀번호·원문 DB 자료를 인용하지 않았다.

| 최종 원장 근거 | 상태 / 채울 항목 |
| --- | --- |
| 새 실행 종료 | `final-c13-verified-20261009`는 19:26:12 KST에 9그룹·345대상 PASS로 종료했다. 보류 6개는 별도 유지한다. [실행 원문](../../../_attic/runtime/mes-expectations/final-c13-verified-20261009/run.json). |
| 증거 승격 | C13 원문 321파일 승격과 입력 대조를 완료했다. promote native exit 0이며 최종 HEAD의 새 증거는 별도 확인한다. [부모 완료 대조](../../../_attic/runtime/closure/final-c13-promotion-001-parent-completion.json). |
| strict 완료 | C13 normalize·strict native exit가 모두 0이고 eligible 345개·고유 조건 1,058개 완료, 보류 6개를 유지했다. 성능·복구·최종 HEAD CI의 완료를 뜻하지 않는다. [부모 완료 대조](../../../_attic/runtime/closure/final-c13-promotion-001-parent-completion.json). |
| 성공 자료 개인정보 재검토 | C13은 합성 QA DB의 직원명 익명화·실행 텍스트와 표본 PNG를 검토했다. PNG 전체 픽셀의 전수 보증은 없으며 최종 HEAD의 새 증거가 생기면 별도 재검토한다. [승격 전 검토 범위](../../../_attic/runtime/closure/c13-promotion-readonly-001/review.md). |

C13 기능 strict는 완료됐고 최종 성능·공동복구·CI 근거가 확정되면 이 문서의 표와 함께 작은 정제 요약을 `docs/superpowers/specs/2026-10-08-mes-safe-closure-results.json`에 보존할 예정이다. 지금은 이 파일이나 새 전체 PASS 결과를 생성하지 않는다. 요약에는 기준/최종 HEAD, 입력 manifest hash, run ID, 측정 방법·구간·표본 수, 지연/오류/응답 동등성 집계, 번들 한도/실측값, 복구 단계별 판정과 hash, strict 분모·판정·exit, 최종 HEAD에 대응하는 CI URL을 담는다. 미완료 값은 `PENDING` 또는 `null`, 실패한 과거 실행은 해당 상태로 유지한다.

이 요약은 원본 실행 증거를 대신하지 않는다. 복제 DB, 실제 직원 원문, 절대 개인 경로, 전체 raw/환경 값, 스크린샷 본문, 대용량 진단 ZIP은 넣지 않는다. 검토할 수 있는 집계와 저장소 상대 artifact 이름·hash만 남기고, 성공 원본의 승격은 기존 무변조 검증 계약으로 별도 수행한다.

## 기능별 커밋·작업 브랜치·CI

초안 시점 브랜치 HEAD는 통합한 main `2d79cd2848900fb66f99443af411fcec347877cd`이고 기능 변경은 작업본에 있다. 중간 커밋의 import·타입·hook·OpenAPI 의존성을 별도 사본으로 검토했으며 결과와 한계는 [커밋 분할 최종 검토](../../../_attic/runtime/closure/commit-partition-final-review.md)에 보존했다. 이후 변경은 같은 기능 경계로 반영했다. 단일 UNION snapshot 보정과 새 PostgreSQL 회귀의 CI selector는 G7에서 도입하며, G1에서 미래 파일을 먼저 요구하지 않도록 CI의 G1/G4/G7/G9 내용을 분리한다. 현재 준비 자료는 후속 성능 결과를 기다리는 중간본이며 최종 소스 고정과 새 성공 증거 승격 후 manifest·공유 blob을 다시 갱신한다.

최신 분할 대조는 [shipping/MSW 갱신 영수증](../../../_attic/runtime/closure/partition-refresh-shipping-msw-002/receipt.json)에 기록했다. 이 시점 변경 409경로는 whole 395개·공유 14개로 배정했으며 미배정·중복은 없다. 출하 URL guard는 G6 및 누적 G7에 보존하고, 다른 공유 13파일의 30단계 blob·patch는 이전 준비와 바이트 단위로 같다. 최종 공유 내용은 현재 소스와 일치하며 실제 Git index는 비어 있다. 이는 분할 준비이며 커밋·push·최종 HEAD CI 완료가 아니다. G9 원장 승격과 문서 최종 내용의 SHA는 실제 검증 뒤 갱신한다.

| 순서 | 기능 경계 | 최종 commit SHA |
| --- | --- | --- |
| 1 | 스키마·보존 | PENDING |
| 2 | 직원·부서 | PENDING |
| 3 | 품목·BOM | PENDING |
| 4 | 입출고·불량 | PENDING |
| 5 | 내역·일보 | PENDING |
| 6 | 출하·주간 및 복귀 후 생산·출하 연속 검증 | PENDING |
| 7 | 성능 | PENDING |
| 8 | 복구 | PENDING |
| 9 | 기대값·스킬·문서·최종 증거 | PENDING |

| 최종 통합 항목 | 현재 상태 / 추후 근거 |
| --- | --- |
| 작업 브랜치 push | PENDING — 원격 최종 HEAD·push 결과 |
| 전체 CI | PENDING — 최종 HEAD에 대응하는 run URL·결론 |
| 필수 job | PENDING — backend/PostgreSQL·frontend/coverage/build/bundle·Windows·general/ASR 브라우저 결과 |
| 최종 독립 검토 | 효과 packing/일보 읽기 폭의 후속 검토에서 길이 제한 P2를 발견하고 수정 재현을 확인했으며 추가 차단 결함은 발견하지 못함. 최종 실행·복구·증거·통합 결과의 근거 연결은 PENDING. 국소 검토를 최신 소스 전부의 승인으로 확대하지 않음 |
| 전용 환경 정리 | 집중 브라우저 실행의 보호 DB 불변·teardown 확인. 부모는 중단한 `final-frozen-20261008`의 보호 DB 불변과 8021/3100 포트 해제를 확인했다. 최종 실행 및 리허설 종료 뒤 정리 결과 추가 |
| main 반영·직원 적용 | 이번 작업 범위 밖. 작업 브랜치 완료와 구분 |

최종 보고 시에는 위 대기 항목을 실제 근거로 교체하고, 남은 실패·SKIP·보류를 명시한다. 필요한 판정이 남아 있는 동안 문서 상태는 `IN_PROGRESS`로 유지한다.

## 2026-10-09 13:45 KST 검증 환경 보강

공용 Vitest의 미등록 요청 통과 설정에서 감사 POST가 실제 `http://localhost:3000/api/client-events` 주소로 빠질 수 있음을 가짜 native fetch와 실제 TCP 차단을 함께 사용해 재현했다. 실제 RED는 5 FAIL·1 PASS·native 1이며, 운영 요청을 보내는 재현은 하지 않았다. `frontend/vitest.setup.ts`는 미등록 요청을 오류로 차단하고, 공용 MSW 서버는 감사 요청을 204 모의 응답으로 처리한다. 신규 안전성 검사는 감사·미등록 상대 주소·보호 포트·외부 주소·기존 업무 fixture를 확인한다. [안전성 영수증](../../../_attic/runtime/closure/vitest-network-safety-001/completion.json)의 일반 설정 46개와 기대값 설정 74개는 각각 PASS·0 SKIP·native 0이며 서로 합산하지 않는다. 실제 TCP 시도는 0이고 세 파일의 실행 전후·현재 SHA가 같다. 전체 프론트 검사와 canonical 기대값 재실행은 아직 필요하다.

원본 직원 DB를 파일로만 복제해 비교한 [읽기 전용 진단](../../../_attic/runtime/closure/employee-drift-readonly-002/receipt.json)에서는 이전 사본 대비 `activity_audit_logs` 80행 추가만 확인했다. 기존 행·다른 테이블·스키마는 동일하다. 추가 시각은 KST 05:05~05:45이며 테스트 실행과 겹치지만 각 행의 원인을 개별 확정하지 않았다. 이 후속 변화는 앞서 별도 증명한 예약 동기화와 구분한다. 원본 DB 불변이라고 보고하지 않으며 원본 연결·정리·삭제·복구 또는 기존 서비스 조작은 수행하지 않았다. 원문 DB 사본과 상세 감사 자료는 ignored 경로에 보존하고 커밋하지 않는다.

p7은 실제 production 빌드와 승인 번들 검사를 통과했지만 마지막 원본 직원 DB 보호 해시 비교가 실패하여 전체 native 1이다. QA 빌드·공동복구 성공으로 승격하지 않는다. 안전성 세 파일을 포함한 p8의 새 운영용 production 빌드는 3,145,688 / 3,145,728 bytes로 통과했다. **13:54:23 KST에 p8/q8 전체 실제 빌드·산출물 검증·실행 전후 보호 비교가 native 0으로 종료**했고 소유 프로세스도 끝났다. [현재 빌드 영수증](../../../_attic/runtime/closure/recovery/c10-preparation/build-validation.json)은 운영/QA 주소·Node 선택·source/artifact SHA를 연결한다. manifest SHA는 `ac783ab7e0f82d93dfc480e51d5c6ec5e2cebf9fe3987ee9149d85959cf29558`이다. 이 구간의 보호 불변과 이전 감사 추가는 별개다. 이후 backend 수정은 새 코드·DB·manifest 연결 검증이 필요하며, 최종 공동복구 세 시나리오·전체 기대값 strict·정식 성능·커밋·푸시·해당 HEAD CI는 미완료다.

출하 BOM 재검증 브라우저 실패는 URL에 아직 반영되지 않은 내부 이동을 native 뒤로 가기로 실행한 조건에서 재현했다. 실제 이전 URL과 목적 URL이 일치할 때만 native 이동하도록 수정했고 관련 29개와 원래 브라우저 시나리오 1개가 각각 통과했다. [브라우저 근거](../../../_attic/runtime/closure/shipping-rematch-browser-001/completion.json)는 원래 제한·도우미를 유지한 retry 0·native 0 실행이며 전용 포트 해제를 확인했다. canonical 전체 성공으로 확대하지 않는다. 기대값 Vitest의 중복 인스턴스 이름은 검증 몸체 변경 없이 구별되게 수정하고 선언 근거만 갱신했다. 원장은 NOT_RUN을 유지한다.

`final-frontend-native-003`의 실제 lint·type·coverage 자식 명령은 모두 native 0이며 JUnit은 341파일·3,798 PASS·0 FAIL/ERROR/SKIP이다. 그러나 마지막 도우미 영수증 구성에서 Windows 상대 경로와 POSIX 키 불일치 `KeyError`가 발생해 supervisor 전체 native 1이다. 이를 전체 검증 PASS로 승격하지 않는다. 원문 로그·XML·자식 종료·outer 실패를 보존하고, ignored 004 도우미에서 키 정규화와 실행 전 입력 즉시 저장을 보완했다. 키 조회·직렬화의 직접 검사를 통과한 뒤 14:06:30 KST에 새 실행을 시작했다. 제품·테스트·빌드 입력을 수정한 것이 아니며 재실행의 최종 결과는 미확정이다. TCP 차단은 실제 요청을 운반하는 npm/Vitest 체인에 적용한다. 명시적으로 환경을 덮는 빈 `-e` employee 자식은 현재 probe의 즉시 반환·network 경로 부재를 별도로 읽고 세 소스 SHA와 한계를 영수증에 묶는다. 모든 미래 Node 자식의 차단을 보장한다고 주장하지 않는다.

### 2026-10-09 14:24 KST 후속 확인

`final-frontend-native-004`는 14:06:30~14:14:16 KST에 lint·type·coverage와 supervisor가 모두 native 0으로 종료했다. 실제 JUnit은 341파일·3,798 PASS·0 FAIL/ERROR/SKIP이다. [영수증](../../../_attic/runtime/closure/final-frontend-native-004/receipt.json)은 실행 입력·작업본 DB·network guard의 전후 동일성, guard 활성화 366개와 차단 socket 시도 0개를 기록한다. 앞서 기록한 빈 employee 자식의 제한된 예외도 세 소스 SHA와 함께 유지한다. 실패한 003을 성공으로 바꾸지 않는다. production 빌드는 별도 p8/q8의 실제 검증 근거를 사용한다.

내역 metadata의 오래된 독립 행을 생략하는 후보는 관련 네 파일 135 PASS·0 FAIL/ERROR/SKIP·native 0이다. 독립 리뷰에서 발견한 재고 요청 조회별 필드 손실과 UUID NUL 뒤 손상 바이트 누락은 각각 실제 RED 후 수정했다. 최종 소스 router `9b87ccd7…`와 전용 테스트 `1dc596cc…`를 읽은 좁은 재리뷰에는 중요 결함이 남지 않았다. [최종 고정 근거](../../../_attic/runtime/closure/performance/tcp-groups-profile-preparation-001/legacy-floor-source-freeze-003.json)는 변경 함수와 오류 보존 계약을 기록한다. 이 메모리 회귀 검증과 소스 리뷰는 실제 자료 응답 동일성·속도 개선 또는 정식 성능 통과를 뜻하지 않는다. 실제 비교와 새 코드 묶음 공동복구는 후속 실행한다.

### 2026-10-09 14:33 KST metadata floor 후보 미채택

동일 app에서 router 하나만 원형/후보로 바꾼 두 실제 TCP 진단은 각각 100 GET 전체 본문이 같았고 HTTP 200·native 0·소유 포트 해제를 확인했다. 첫 실행은 부모의 사전 계획 읽기와 겹쳐 속도 선택 근거에서 제외했다. 두 번째 독점 진단은 metadata 1,306→359행·그룹 쿼리 17→17개였지만 SQL 실행 CPU가 약 344→844ms로 늘었다. 동시 구간의 client 중앙값은 내역 묶음 3,407→3,611ms, 일반 조회 816→1,016ms, 검색 1,813→2,151ms로 악화했다. 각 구간 표본 3개인 진단이며 정식 측정 또는 전체 메인과의 비교가 아니다.

행수 감소에 비해 계산 비용과 복잡도가 늘어 **후보를 채택하지 않았다**. 두 후보 파일과 135개 통과·RED·리뷰·실제 측정은 [미채택 보존 경로](../../../_attic/runtime/closure/performance/tcp-floor-comparison-001/rejected-candidate-source)에 남겼다. 제품 router는 검증된 이전 `de0f3ef2…`로 정확히 복원하고 후보만을 위한 미추적 테스트는 제품 경로에서 제거했다. 다른 기능 변경·DB·성능 기준은 바꾸지 않았다. 앞선 최종 후보 고정은 미채택 연구 근거이며 현재 제품 소스의 통과 증거로 사용하지 않는다. 원래 정식 성능 미충족과 최종 코드 공동복구·원장 strict·커밋/푸시/CI는 계속 미완료다.

### 2026-10-09 14:39 KST 최종 묶음 동결·전체 백엔드 시작

`c11-freeze-job`는 실제 프론트/Node/QA artifact 재검증과 현재 보호 비교를 수행하고 native 0으로 종료했다. freeze 원문 SHA는 `9b2083c69d8b3d79cb833f4f0ebaa9b22b5cd8d264d36fae62261269de4ae147`이며 코드 `b221dd1b…`와 프론트 `889cff3c…`는 후보 제외 후 p8의 입력과 다시 같다. 같은 값이어도 과거 보호 관찰을 현재 불변으로 대신하지 않는다. `c11-assembly-job`는 새 코드·DB 보존 입력 연결을 조립 중이며 실제 복구 세 모드는 아직 시작하지 않았다.

`final-backend-20261009-004` 전체 pytest는 14:36:08 KST에 4 worker로 시작했다. 메모리 fixture와 기존 검증 도우미를 사용하며 로그/JUnit은 ignored 경로에 쓴다. 실행 전후 전체 대상 입력·보호 작업 DB를 대조하여 소스가 바뀌면 성공 승격을 거부한다. 최종 결과는 미확정이다. 별도 `compileall -q backend`는 14:39:07 KST native 0이다.

브라우저 실행 전 Next 생성 참조는 원래 HEAD의 dev 형태로 복원했다. [입력 적용성 대조](../../../_attic/runtime/closure/frontend004-generated-applicability-001.json)는 004의 수집 입력 전체가 현재와 동일함을 확인했다. `next-env.d.ts`는 004 입력 맵 및 실제 배포 source 계약에서 제외하는 생성 파일이다. production 타입 검사는 004 근거를 사용하고, dev 생성 타입의 직접 `tsc --noEmit --incremental false`도 native 0이다. 제품·테스트 소스 변경이나 프론트 전체 검사의 재실행으로 기록하지 않는다. canonical 첫 기동 중 생성 참조 변화로 검증 입력이 흔들리지 않게 준비한 것이며 원장 실행 PASS는 여전히 미승격이다.

### 2026-10-09 15:04 KST 전체 백엔드 종료·실제 복구 선행 실패

`final-backend-20261009-004`는 14:36:08~15:01:10 KST에 native 0으로 종료했다. 실제 JUnit 3,898개 중 **3,815 PASS·83 SKIP·0 FAIL/ERROR**이며 소스·보호 작업 DB 전후 불변이다. [원문 대조](../../../_attic/runtime/closure/backend004-reconciliation-001.json)는 XML과 영수증 SHA 및 skip 목록을 확인한다. 이전 전체 003 대비 추가 SKIP 4개는 신규 PostgreSQL UUID 회귀 네 변형이다. SKIP을 PASS로 올리지 않으며 실제 PostgreSQL 근거와 최종 CI의 필수 실행을 별도로 확인한다.

`c11-assembly-job`는 14:38:40~14:52:34 KST 실제 조립·구묶음/QA 대조·보호 비교를 완료했고 native 0이다. manifest SHA는 `cae0cf3db28820ed73fab0c9c21eeebce7772031023e9841e4df2a9268c9d16e`다. DB003의 현재 84입력과 코드 사본의 83입력(나머지 하나는 ignored 검증 어댑터)도 일치해 기존 실제 보존 근거를 연결했다. 새 DB 검사를 실행한 것으로 세지 않는다.

첫 `c11-failure-resume` 실제 시도는 **15:01:08 KST native 1**이다. continuation 도우미가 실제 `_previous_node`의 `{path, files}`에 없는 `version`을 읽어 `KeyError`로 중단됐다. 기존 순수 fixture가 존재하지 않는 키를 넣어 이 계약 차이를 놓쳤다. 설치·마이그레이션·복구·서버 기동 전 실패였으며 보호 파일·C8 journal·fixture DB가 같고 전용 프로세스 종료와 8042/3042 해제를 확인했다. 성공 후 포트 검사 미실행을 뜻하는 실패 영수증의 `portsFree=false`와 실제 listener 존재를 구분한다. 원문을 보존하고 별도 최소 helper 수정의 실패 재현을 진행하며 다음 모드는 실행하지 않는다.

새 전체 기대값 실행 `final-c11-verified-20261009`는 15:03:17 KST 시작했다. 합성 QA의 8021/3100과 현재 검증 입력을 사용한다. 기존 실패나 연결 상태를 성공으로 올리지 않고 새 9그룹의 종료·개별 조건·브라우저 근거를 확인한 뒤 엄격 완료 여부를 판단한다. 정식 성능·공동복구·커밋/푸시/최종 HEAD CI는 계속 미완료다.

### 2026-10-09 15:12 KST 복구 도우미 계약 수정 — 실제 재시도 대기

원형 c11 파일·freeze·manifest·실패 owner는 변경하지 않았다. 별도 v2 helper는 실제 Node 반환의 `{path, files}` 구조를 유지하고 선택된 경로의 버전을 `release.node_version`으로 확인한다. 실제 `_previous_node`를 사용하는 동일 합성 fixture에서 RED 14 FAIL·5 PASS → GREEN 19 PASS·0 SKIP·native 0을 확인했다. 버전 조회만 모의했으며 SQLite/socket/subprocess 호출은 모두 0이고 구문·Ruff도 통과했다. [국소 검증](../../../_attic/runtime/closure/recovery/c11-node-contract-fix-001/ready.json)은 바이트·설정·DB binding 및 버전 불일치 거부를 포함한다. 기존 fixture가 없는 version 키를 추가해 오류를 숨긴 점도 기록했다.

별도 attempt-002 manifest/job은 원래 manifest의 전체 내용과 첫 실패를 추가 admission으로 연결하도록 준비한다. 새 실행기의 원문 해시와 순수 검사까지 확인한 뒤 격리 복구를 재시도한다. 이 단계에서 실제 Node 조회·설치·DB 변경·서버 기동은 수행하지 않았으며 세 공동복구 모드는 미완료다.

### 2026-10-09 15:21 KST 독립 읽기 리뷰·복구 재시도 시작

[독립 정책 리뷰](../../../_attic/runtime/closure/final-policy-read-review-001.md)는 주간 집계·PF/동반 예약·직원 메뉴 기본값과 관련 회귀 단언, 복구 소유권/재개 가드를 실제 코드 줄과 연결했다. 검토 범위에서 새 Critical/Important를 발견하지 않았으나 테스트·현재 canonical 실행을 독립 재현한 결과는 아니다. 알려진 성능 실패·원본 감사 추가·c11 선행 실패는 별도로 유지한다.

별도 attempt002 연결의 순수 최종 검사 36 PASS·native 0과 구문/Ruff/PowerShell parse를 확인했다. 원형 동결과 역사 입력은 불변이며 새 manifest SHA `51d093bd2fa0900e73fae6c01f0cb959d0f5ace153cf36d4c8b8fc1e0316b8be`를 사용한다. 부모는 실제 8042/3042 해제와 manifest/supervisor 해시를 확인하고 **15:19:48 KST failure-resume만 시작**했다. [시작 기록](../../../_attic/runtime/closure/recovery/c11-attempt002-parent-launch.json)은 소유 PID·birth·정확 인자·보호 작업 DB를 기록한다. 변경 DB는 private 복구 fixture이며 원본 환경은 제외한다. 실제 결과는 아직 진행 중이고 hard-exit/normal은 미실행이다.

[성능 추가 읽기 리뷰](../../../_attic/runtime/closure/performance/final-performance-read-review-001.md)는 기존 미채택 후보를 다시 적용하지 않고, 현재 취소별 반복 조회의 비용과 ORM/UUID/오류/순서 보존 위험을 분리했다. 전체 기준을 충족하는 안전한 최소 수정은 입증되지 않았다. 제한적 배치는 미검증 가능성으로만 남기며, 과거 정식 FAIL·현재 소스 정식 NOT_RUN·고정 baseline의 성공요건과 작업본 절대상한 미충족은 서로 다른 문제다. 기준·제품·DB·벤치를 변경하지 않았다.

### 2026-10-09 15:30 KST attempt002 실패와 구버전 준비 조회 진단

attempt002는 **15:24:45 KST native 1**로 끝났다. 실제 Node 버전 및 구묶음 admission을 통과하고 구버전 백엔드 기동·live 조회까지 수행했으나 준비 응답을 클라이언트의 요청별 2초 안에 받지 못했다. 실제 서버 로그의 준비 요청 15개는 모두 HTTP 200이며 3.102~55.122초가 기록됐다. 본문은 수집되지 않았고 503은 로그에서 관찰되지 않았다. 짧은 요청 제한 후 0.25초 재시도가 비싼 조회를 겹치게 한 원인이므로 서버 미준비/503 또는 설치 실패로 단정하지 않는다. 원래 전체 90초 제한은 변경하지 않았다.

[별도 읽기 진단](../../../_attic/runtime/closure/recovery/c11-attempt002-readonly-diagnostic/result.json)은 native 0이고 구 코드·프론트·Node·설정/C8 journal 전체, private DB·backup·baseline `d7cd2ff8…` 및 실행 전후 보호 8파일+외부 6근거가 같았다. 실제 worker·supervisor·백엔드 종료, 전용 포트 해제와 lock 해제, 기존 admission 보존 및 result 부재를 확인했다. 백엔드 OS birth는 이전 원문에 없으므로 앱 시각으로 추정하지 않았다. 파일 해시 진단의 SQLite/socket/subprocess 연결은 모두 0이다.

실제 프론트 기동·설치·마이그레이션·복구에 아직 진입하지 않았다. 별도 테스트용 readiness 어댑터는 요청 제한을 `min(10초, 남은 시간)`으로 두고 sleep과 응답 뒤 판정도 전체 90초 deadline 안으로 묶는 국소 검증을 진행한다. 원형 harness·제품·업무 성능 상한·실패 원문은 보존하며 새로운 attempt의 연결 확인 전 재시도하지 않는다. 이 진단 성공을 공동복구 성공으로 세지 않는다.

### 2026-10-09 15:57 KST 첫 브라우저 묶음·복구 attempt003 진행

새 canonical의 첫 Playwright 원문은 실제 **259 PASS·0 SKIP/FAIL/flaky·native 0**이다. execution 영수증은 583개 조건의 fingerprint·대상 테스트와 282개 스크린샷을 연결한다. 첫 묶음 결과이며 전체 9그룹, 원장 승격 및 strict 완료와 구분한다. 현재 백엔드 기대값 묶음을 실행 중이다.

격리 복구의 요청별 대기 보강은 제품 harness를 바꾸지 않는 `bounded_readiness()` 어댑터다. 전체 90초와 종료/소유권 검사를 유지하고 요청·sleep을 남은 시간 안으로 제한하며 deadline 뒤 받은 200은 거부한다. 원형 RED 후 별도 어댑터 11 PASS, 공유 스킬 경로의 실제 11 PASS, CI와 같은 backend 작업 경로의 실제 11 PASS를 각각 확인했다. 서로 다른 실행이며 한 분모에 합산하지 않는다. 공유 스킬에 재현 명령을 기록하고 기존 CI 백엔드 job에 해당 순수 검사를 추가했다. 업무 API·DB·성능 상한은 변경하지 않았다.

attempt003은 새 manifest/admission으로 **15:46:13 KST** 시작했다. 구버전 0038의 실제 백엔드·QA production 프론트 기동, 조회와 종료를 **15:48:48 KST** 완료했고 새 프론트 설치는 **15:56:13 KST** 종료했다. 실제 긴 경로 복사를 통과하고 코드 설치로 진입한 중간 결과다. 이전 두 실패와 admission은 보존한다. 마이그레이션·복구와 최종 result는 아직 미완료이며 성능·전체 strict·커밋/푸시/최종 HEAD CI도 계속 미완료다.

### 2026-10-09 16:03 KST 기대값 백엔드 통과·복구 실제 경로 실패

canonical의 백엔드 첫 묶음 JUnit은 실제 **1,496 PASS·0 FAIL/ERROR/SKIP**이고 execution 영수증 생성 후 Vitest 묶음으로 진행했다. 전체 실행의 최종 판정과 별도로 기록한다.

attempt003은 **15:58:54 KST native 1**이다. 실제 프론트 설치와 구버전 준비 조회는 통과했지만 `install_code`의 기존 파일을 `superseded-code`로 옮기는 `old.rename(quarantine)`에서 Windows 긴 경로 오류가 발생했다. 계획한 실패 주입 전의 실제 설치 오류이며 최종 result는 없다. 원문과 journal은 보존하고 정확한 복원·보호 비교를 진행한다. 다음 모드와 재시도는 실행하지 않는다. 캐시 파일을 제외해 우회하지 않고 동일 실제 경로 계약의 최소 수정과 실패 재현을 준비한다.

공유 스킬 어댑터의 Windows CRLF 원문 해시는 Linux Git 체크아웃의 LF를 거부했다. 동일 파일 내용의 LF 검사에서 실제 RED 1 FAIL·13 PASS를 확인하고 **CRLF→LF만** 정규화하는 해시 계약으로 보강했다. 실제 내용 변경 거부와 LF/CRLF를 포함한 GREEN 14 PASS·native 0이며, [순수 재실행](../../../_attic/runtime/closure/recovery/readiness-skill-portable-001/receipt.json)도 14 PASS·입력 불변·DB/socket/subprocess 시도 0이다. 현재 공유 모듈 SHA `1178cf66…`, 테스트 `9e79a53a…`다. 최초 byte-exact/11개 결과는 역사 근거로 보존하며, 실행한 attempt003의 동결 ignored 어댑터·manifest·executor는 변경하지 않았다.

### 2026-10-09 16:18 KST c11 실행 종료·국소 수정 후 c12 시작

`final-c11-verified-20261009`는 **15:03:18~16:08:11 KST native 0**으로 종료했다. 원장 기준 실행 대상 345개(기본 270·추가 75, 보류 6개)의 9그룹이 모두 PASS·failures 0이다. run 원문 SHA는 `dd4c1a48e321ba20bcf67deb49bf5eab63f4b2aab520e194f7270d2ff305ffc7`이다. 전체 현재 완료와 승격은 별도다. 다음 국소 제품 수정으로 이 실행의 소스 적용성이 바뀌었으므로 수정 전 결과로 보존하고 최종 strict 근거로 승격하지 않았다. 원래 작업 DB `08fd9b80…` 불변과 전용 8021/3100 해제를 부모가 확인했다.

실제 Windows 긴 코드 격리 경로는 2 RED→2 GREEN 뒤 최소 두 줄만 수정했다. `_inside` 검증 후 기존 `_copy_io_path`를 대상 부모 생성과 rename 양단에 적용하며 캐시 포함·manifest·rollback 정책은 유지한다. [관련 검증](../../../_attic/runtime/closure/recovery/code-quarantine-long-path-001/receipt.json)은 7파일 **130 PASS·0 SKIP·native 0**, compile/Ruff/diffcheck 0, 다른 함수/클래스 48개 AST 동일 및 보호 8파일+외부 6근거 불변이다. release 소스는 `c2d0e774…`, 새 테스트는 `62d447ab…`다. [독립 읽기 리뷰](../../../_attic/runtime/closure/final-quarantine-readiness-review-001.md)는 Critical/Important를 찾지 않았다. readiness의 urllib 제한은 개별 소켓 동작이고 본문 수신 뒤 deadline을 판정한다는 조건부 한계를 별도로 기록했다.

기존 Windows CI job에 프론트·코드의 실제 긴 경로 검사 두 파일을 추가했다. 새 전체 기대값 실행 **`final-c12-verified-20261009`는 16:17:43 KST 시작**했다. 현재 제품 입력을 다시 검사하며 이전 PASS를 새 코드로 재라벨링하지 않는다. c12 동결·조립은 동일 프론트/Node/산출물을 실제 대조해 재사용하고 새 코드를 바인딩하도록 준비 중이다. 실제 공동복구 재시도는 아직 미실행이다. 정식 성능·최종 strict·커밋/푸시·해당 HEAD CI는 여전히 미완료다.

### 2026-10-09 17:49 KST c12 이전 묶음 복원 종료

읽기 진단 002는 실제 native 0이며 설치된 프론트가 새 산출물에 원래 설정 1개·로그 23개를 보존한 journal과 정확히 같음을 확인했다. 진단 001의 비교 실패는 이 보존 파일을 예상 목록에서 빠뜨린 것이고, 최초 실패 원문은 유지한다. 진단 성공을 설치·마이그레이션·공동복구 성공으로 세지 않는다.

실제 원형 rollback CLI는 한 번 실행해 native 0, journal `ROLLED_BACK`으로 종료했다. 코드·프론트·Node·설정의 구 묶음 전수 일치, private DB 불변, 새 실패 프론트와 기존 journal·validator·백업 보존을 확인했다. 소유 supervisor·worker·CLI와 전용 8042/3042는 모두 종료·해제됐다. 소스 동결 검사 창도 종료했다.

다만 이번 실행 단위의 보호 감시는 **native 1/FAIL**이다. `C:/ERP/backend/mes.db-wal`와 `C:/ERP-dev/backend/mes.db-wal`의 실행 전 0바이트 파일이 실행 후 없었고, 나머지 보호 6개·외부 6근거는 같았다. 원인 귀속은 미확정이며 원본 파일 재생성·삭제·DB 복원·서비스 조작으로 판정을 바꾸지 않았다. [마감 원문](../../../_attic/runtime/closure/recovery/c12-pre-migration-rollback-001/completion.json)의 SHA는 `0295a518dd214124069cdadc190baef1ca66697299020617c243d22c218baa2f`다. 구 묶음 복원 성공과 전체 보호 실패를 분리하며, 0044 공동복구 PASS로 합산하지 않는다.

확인한 cutover validator의 실제 긴 경로 읽기 오류와 주간보고 브라우저 테스트의 문서 전환 후 응답 본문 읽기 오류를 국소 수정한다. 기존 native 실패와 독립 진단은 보존하며 수정 후 실제 검증 전에는 완료로 기록하지 않는다. 성능 상한·엄격 원장·브랜치 푸시·해당 HEAD CI는 여전히 미완료다.

### 2026-10-09 18:00 KST 주간 화면 실제 반복 확인

주간보고 실제 서버 응답은 화면 요청을 `route.fetch`로 읽은 뒤 동일 응답을 화면에 전달하도록 보관했다. 첫 실제 반복은 CDP 본문 수명 오류 대신 진행 중 handler 정리 경합을 잡아 **1 PASS·2 FAIL/native 1**이었다. 설치된 Playwright의 `unroute`가 handler 종료를 기다리지 않음을 확인하고, 이 테스트에서 유일하게 등록한 handler를 `unrouteAll({behavior: "wait"})`로 마감하도록 한 줄 수정했다. 오류 무시·재시도·기존 화면 단언 삭제는 하지 않았다.

수정 후 별도 합성 DB의 실제 브라우저 **3회 모두 PASS/native 0**(17:59:37~18:00:24 KST), 파일 SHA `8f721f5e…` 전후 동일, 작업본 DB `08fd9b80…` 불변·8021/3100 해제를 확인했다. [원문](../../../_attic/runtime/closure/weekly-response-focused-002/raw.json)의 SHA는 `ba321cb31e2890328e2e01779d184383230483fe59be6c65148a4ae9ff77d02e`다. 첫 반복의 실패 원문과 첨부를 별도 보존했다. 이는 해당 실제 UI 조건의 반복 통과이며 전체 기대값 실행·승격·strict 완료를 대신하지 않는다. 테스트 선언의 이동한 줄 번호와 소스 해시만 연결 정보에 갱신했고 실행 상태는 승격하지 않았다.

### 2026-10-09 18:15 KST cutover 긴 경로와 별칭 검증

cutover의 파일 읽기는 확장 Windows I/O 경로를 사용하되 논리 경로 반환·anchor·모집단·정렬·전문 해시를 보존하도록 수정했다. 독립 읽기 리뷰가 지적한 `..` 앞 접합점 우회는 [실제 RED](../../../_attic/runtime/closure/cutover-dotdot-001/receipt.json)의 **1 FAIL·1 PASS/native 1**로 확인했다. `_io_path`의 한 줄만 `os.path.abspath(path)`로 바꿔 I/O 표기를 어휘 정규화하며, 기존 논리 부모 순회와 마지막 반환은 유지했다. 정상 상대 경로 허용과 raw/prefixed 접합점 거부, 긴 루트의 해시 동일성·변조·누락 검사를 추가했다.

최종 관련 세 파일 전체 [검사](../../../_attic/runtime/closure/cutover-long-path-007/receipt.json)는 실제 **98 PASS·1 SKIP·0 FAIL/ERROR/native 0**이다. SKIP은 Windows 심볼릭 링크 생성 권한 1314이며 실제 접합점 검사는 PASS다. Linux의 실제 심볼릭 링크 검사는 현재 HEAD CI에서 실행하기 전이고 통과로 기록하지 않는다. 제품 SHA `bded52bf…`, 테스트 `0026b2c1…` 전후 불변, 임시 합성 DB 외 연결 차단·금지 시도 0을 확인했다. 같은 소스의 Ruff 0·구문 compile 2개 성공과 비대상 함수/상수 AST 동일성을 재사용한다. 앞선 감시 도우미의 argv 처리·수집 오류 실행은 원문 그대로 보존하며 최종 성공으로 다시 표시하지 않았다.

Windows ops CI만 실제 사용한 Python 3.12와 맞추고 새 native 긴 경로 검사 파일을 추가했다. Linux backend와 다른 기존 Python 3.11 job은 유지한다. 기존 DB 보존 실행의 스키마·어댑터 입력 84개도 현재 SHA와 불일치 0임을 별도 읽기로 확인했다. 이 입력 대조는 새로운 마이그레이션 실행이 아니다. 전체 기대값·새 산출물의 공동복구·정식 성능·브랜치 푸시·HEAD CI는 미완료다.

## 2026-10-09 19:38 KST — 현재 코드 기대값 종료와 새 빌드

20:01 추가 조사: 기준 서버가 종료된 뒤 첫 native 실행의 private QA2만 immutable 읽기로 확인했다. DB revision은 main2d79 head `20261008_0041`과 같지만 내부 checkpoint는 `20261007_0040`으로 남아 있고, 실제 `bootstrap/schema.py`의 불일치 거부 조건과 맞는다. 지원 파일 누락은 아니며 기준 Git 지원 텍스트는 일치한다. 기존 준비가 Alembic upgrade만 실행한 경로와 합성 자료의 수동 revision 생성 경로를 확인했다. 원문과 기존 8개 입력은 바꾸지 않는다. 새 측정 복제본의 공식 스키마 준비와 variant별 revision/checkpoint 검증, 전체 업무행 동등성을 분리하는 최소안을 검토한다. 원형 준비 조회·표본·성능 기준은 우회하지 않는다.

과거 9단계 import/OpenAPI 실제 영수증의 마지막 G9 입력과 현재를 직접 대조하니 7개 source SHA가 달랐다. 그 과거 native 0은 보존하지만 현재 누적 커밋의 동일 입력 증거로 재사용하지 않는다. 최종 스테이징 전 현재 9단계 source-only import 검증을 새로 수행한다. 더 오래된 typecheck snapshot의 차이와 이 실제 영수증의 차이를 합산하지 않는다.

19:55 범위 판단: 앞선 PIN 검토의 “모든 QA 숫자 원문도 금지”는 계획의 실제 자격 증명 제외를 넓게 해석한 것이다. 확인된 PNG는 서버가 비밀 PIN/hash를 반환한 것이 아니라 `pin_is_default`에 따른 소스의 고정 도움말이며, pytest 숫자는 합성 테스트 입력이다. 실제 비밀 PIN/hash·인증 토큰·연락처는 제외하고 공개 QA 도움말·테스트 값만 유지한다. 선택적 QA 숫자 제외 질문의 무응답을 사용자 승인으로 기록하지 않는다. 원문·SHA를 수정하거나 다른 화면으로 대체하지 않고, 현재 복구 실행 뒤 원래 자체 검증 승격 절차를 수행한다. 성능 기준/기준판 오류 면제에 대한 승인으로 확장하지 않는다.

19:52 후속: C14 조립은 실제 native/outer 0, manifest `34c5efa6…`, 보호 비교 5회 차이 0·모든 원문 입력 SHA 동일이다. native TCP 첫 실행 `native-7b549a8fbc8a494b96296ff799db93da`는 19:48:40~19:49:54 native 1이다. 첫 기준 서버의 준비 조회가 `RevisionStateError`/503으로 끝나 시간 표본을 하나도 수집하지 못했다. 이는 p95 판정 실패가 아니라 미완료 실행이며 원래 formal FAIL을 바꾸지 않는다. 소스·도우미·prepared main/WAL/SHM·QA 업무행·main bytes는 동일하고 실제 child native 0·59100 포트 해제를 확인했다. 오류 원문을 보존하고 기준 서버의 실제 migration 지원 파일/DB revision 구성을 읽기 조사한다. readiness 우회·기준/timeout 완화는 하지 않는다. C14 실제 failure-resume은 19:51:31 시작했으며 전체 복구 성공은 아직 판정하지 않았다.

19:46 후속: 독립 읽기 대조에서 execution/artifact 참조 318개의 SHA 및 현재 고유 입력 2,199개의 정규화 SHA가 일치했다. QA 포트·E2E DB 가족은 해제됐고 보호 작업 DB는 동일하다. 저장된 텍스트에서 실직원 이름·연락처·인증 토큰은 발견하지 못했지만 QA 기본 PIN의 고정 도움말 PNG와 pytest 파라미터 숫자는 남는다. 원문은 ignored 보존하며 승격을 실행하지 않았다. 사용자에게 실제 자격 증명만 제외할지 QA 숫자까지 제외할지 물었으며 회신 대기다. 다른 안전한 PNG 하나로 원래 두 바인딩의 정확한 화면 근거를 대체하지 않는다. 이미지 전수 시각 개인정보 검사 완료를 주장하지 않는다.

C14 source freeze는 19:40:33~19:41:29 실제 native/outer 0, SHA `cb449728…`이며 p10 코드·프론트 맵 동일·실행기 전수 핀 불일치 0·중간 보호 비교 2회 차이 0이다. 산출물 조립을 19:42:14 시작했으나 실제 복구 모드는 아직 실행하지 않았다. 스킬의 긴 경로 목록에 cutover·접합점·권한 SKIP 구분을 보완하고, 보조 인계의 정책 완료/역사 기록 구분을 독립 읽기로 확인했다.

`final-c13-verified-20261009/run.json`은 실제 19:26:12 종료, `status=PASS`, 실패 없음이며 supervisor native exit 0이다. `globalPass=false`와 원장의 미승격 상태는 독립 입력·원문·보호·개인정보 대조가 끝날 때까지 유지한다. 첫 Playwright 그룹의 실제 259 PASS·0 SKIP/FAIL/flaky 및 583개 검증 조건·282개 화면 근거는 전체 성능·복구 성공을 뜻하지 않는다. 화면에서 주입한 레거시/검산 안내 예시 수량도 실제 업무 발생량으로 보고하지 않는다.

p10/q10 새 실제 production 빌드는 18:56:02~19:18:25에 native/outer 0으로 끝났다. 운영용 번들 3,145,688 bytes는 승인된 3,145,728 bytes 상한 안이며, QA production은 8042 주소의 별도 환경이다. `p10/artifacts.json` SHA `0223e910…`, 완료 영수증 `p10-build-completion-001/receipt.json` SHA `b6dd8313…`를 보존한다. 실제 보호 비교 5회 차이 0, 계측 입력·실행기 10개 불변, 소유 프로세스와 8042/3042 해제를 확인했다. 빌드 성공을 새 코드·DB 설치/복구 성공으로 바꾸지 않는다.

C14 소비자는 순수 준비 49 PASS·구문/Ruff 성공이며 아직 동결·조립·복구 미실행이다. native TCP 준비 `binding-003.json` SHA `987f5010…`는 8개 prepared DB의 main/WAL/SHM 상태를 사전에 핀하도록 보완했고 독립 리뷰 `READONLY-REVIEW-003.md`에서 누락을 닫았다. 실제 서버 측정은 미실행이며 과거 formal FAIL과 미응답 정책 질문을 승인으로 바꾸지 않는다. 기준 완화·원본 변경·커밋·푸시·main/직원 적용은 하지 않았다.

## 2026-10-08 후속 측정과 검증 누락 보강

2026-10-09 20:38 KST 후속: 사전 마이그레이션 원형 rollback은 20:36:05 native/outer 0, 구 묶음 exact·private DB 불변·보호 8파일/외부 6개 동일·원문 및 실패한 설치 프론트 보존으로 끝났다(`c14-pre-migration-rollback-001/result.json`, SHA `85c1373b…`). 부모 종료 관찰은 소유 PID 3개와 8042/3042 부재 및 private DB `d7cd2ff8…`를 재확인했다(`parent-completion.json`, SHA `da096505…`). 실제 0044 이동을 하지 않은 C14 full FAIL은 유지한다. 별도 새 QA venv의 생성·`-I -B` Pydantic/FastAPI 검사는 각각 native 0이며 module/metadata 및 Core binary 핀이 일치한다(`validator-venv-002-parent-execution-001/receipt.json`, SHA `81cbabbd…`). 전역 설치·기존 venv·DB를 변경하지 않았다. c13 실제 승격→정규화→strict는 20:37:36 시작했고 결과를 기다린다. 시작 후 영수증 생성의 boolean 구문 오류는 같은 실제 프로세스의 소유권을 재확인해 기록만 보완했으며 두 번째 실행을 하지 않았다. 원문을 대체하거나 이 실행 중 성능 표본을 채취하지 않는다.

2026-10-09 20:23 KST 후속: C14 failure-resume는 admission에서 격리 Python 의존성 불일치로 native/outer 1로 끝났다. Pydantic 2.7.1이 요구하는 Core 2.18.2와 실제 system Core 2.46.4가 다르며, 일반 Python은 user-site Pydantic 2.13.4를 사용한다. 0044 실제 이동은 하지 않았고 두 번째 journal은 INSTALLED다. 원형 rollback을 준비하며 새 소유 PID·QA 포트 부재, private DB 및 작업 DB 동일을 읽기 확인했다. 보호 자료와 계측 입력은 동일하다. 기존 validator-venv의 실제 `-I` BaseModel 검사는 native 0이지만 copied module 2.13.4와 system metadata 2.7.1이 달라 새 환경 근거 없이 전체 복구 성공으로 기록하지 않는다. 실제 실패와 부모 읽기 근거는 `_attic/runtime/closure/recovery/c14-failure-resume-review-001/receipt.json` 및 `c14-pre-rollback-parent-observation-001.json`에 보존한다.

현재 커밋 분할의 누적 backend/app source-only import/OpenAPI 검사는 `staged-import-prepared-c13-001/actual-20261009-002/receipt.json`에서 9단계 native 0·DB/네트워크/추가 child 시도 0·index와 현재 app 불변으로 끝났다. 앞선 강제 PYTHONNOUSERSITE의 G1 import 실패 원문은 보존하며 정상 canonical package 경로로 수행한 새 실행과 구분한다. 이는 각 중간 커밋의 업무·DB·서버 검증이나 최종 CI 성공이 아니다.

`final-coalesce-formal-001`은 2026-10-08 22:00:49~2026-10-09 00:37:01 KST에 모든 측정을 완료했으며 성능 판정은 **FAIL**이다. 아래 실자료 mixed 10명·30명 대표 결과는 조회별 30회씩 3묶음이다. 단독 조회와 mixed 1명은 모두 기준 안이지만 동시 10명·30명에서 총 20개 조건을 충족하지 못했다. 작업본은 최대 합성 자료의 정합성 90회도 모두 HTTP 200이며, baseline은 87회 timeout·3회 HTTP 200이다. 2026-10-09에 원시 세 묶음을 다시 집계하여 이전의 뒤집힌 타임아웃 수를 바로잡았다. 양쪽 응답 성공을 요구하는 현 검사 계약상 baseline의 실패도 완료를 막으며, 작업본 수정만으로 baseline 성공을 보장할 수 없다. 이를 작업본의 성능 통과나 단독 조회의 회귀로 바꾸어 기록하지 않는다.

| 실자료 구간 | 기존 메인 p95(ms) | 작업본 p95(ms) | 미충족 기준 |
| --- | ---: | ---: | --- |
| 10명 내역 묶음 | 15002.74 | 4125.98 | 절대 상한 |
| 10명 일반 품목 내역 | 149.03 | 301.14 | 상대 회귀 |
| 10명 정합성 | 33896.11 | 15426.80 | 절대 상한 |
| 30명 내역 묶음 | 44619.72 | 12882.26 | 절대 상한 |
| 30명 검색 | 2866.46 | 3693.15 | 절대 상한·상대 회귀 |
| 30명 정합성 | 101811.75 | 45265.38 | 절대 상한 |

표는 대표 초과 항목이며 전체 20개 초과 목록과 완료한 최대 합성 자료 결과는 [전체 원본](../../../_attic/runtime/closure/performance/final-coalesce-formal-001/report.json)에 보존한다. [종료 영수증](../../../_attic/runtime/closure/performance/final-coalesce-formal-001-exit.json)의 native exit 0과 `all_measured_checks_pass=false`를 함께 확인한다. 이후 백엔드 소스 변경이 있으면 이 실행을 새 소스의 성능 완료로 사용하지 않는다.

모바일 일괄 복귀의 성공 완료 검증이 빠진 점을 [위치·후속 작업 검토](../../../_attic/runtime/closure/location-final-read-review.md)에서 확인했다. `defect-bulk-boundaries.spec.ts`의 새 사례는 [targeted-006](../../../_attic/runtime/closure/mobile-bulk-targeted-20261009-006/result.json)에서 실제 타입 검사 native 0과 Playwright **1 PASS·retry 0**을 확인했다. 원건 ID별 2개·3개 제출, 완료 응답 2건·5개, 원건이 제거된 목록 재조회, 창고 0→5, 다른 부서·품목·예약 불변, 한 작업의 두 거래·위치별 효과와 복귀한 창고 5개만 API로 후속 사용해 0이 되는 것을 단언했다. PNG를 열어 갱신된 모바일 격리 목록도 확인했다. 보호 작업 DB와 실행 입력 hash는 같으며 전용 서버 종료 후 8021/3100 listener가 없었다. 앞선 테스트의 잘못된 화면 기대·존재하지 않는 거래 API 필드·Decimal 문자열 기대 실패는 원문을 보존했다. DB에 저장된 원건 연결은 별도 `test_defect_restore_location_contract.py`가 검사하며 이 브라우저 API가 그 필드를 반환한다고 주장하지 않는다.

기존 `8.18-03 / bulk-compatible-full-remainder-only`의 binding과 생성 원장은 최종 assertion에 맞춰 갱신하되 기존 ID·조건 분모·`NOT_RUN`을 유지한다. 위 단일 테스트 성공을 canonical 실행·원장 strict 완료로 올리지 않는다. 모바일 UI 후속 소비나 UI 전체 교차행렬을 검증했다고 보고하지 않는다.

이 E2E 파일 변경은 현재 성능 측정의 백엔드 입력을 변경하지 않는다. 그러나 release 검증에는 전체 프론트 소스가 포함되므로 기존 c3 및 new-QA 빌드의 source receipt와 불일치한다. 최종 소스 고정 후 운영용 production 및 new-QA production 빌드를 새로 준비해야 한다. [빌드 재사용 경계](../../../_attic/runtime/closure/recovery/frontend-test-drift-readonly-note.md). 구버전 묶음과 기존 성공 영수증은 수정하지 않는다.

거래10컬럼의 추가 raw 운반 후보는 미채택이다. 최초에는 원 SELECT의 scan 순서 보장 문제로 중단했다([당시 근거](../../../_attic/runtime/closure/performance/raw-core-transport-design-001/design.md)). 이후 실제 소비자가 정렬된 최종 응답을 만드는 점을 읽고, 정상 자료의 typed multiset과 손상 자료의 원래 오류 응답을 보존하는 ignored 초안을 준비했다. 그러나 helper와 오류 복원 wrapper의 복잡도에 비해 충분한 개선 효과가 입증되지 않아 채택하지 않았다([후속 복잡도 검토](../../../_attic/runtime/closure/performance/integrity-core10-transport-prototype-001/complexity-review.md)). 초안의 컴파일·테스트·DB·SQL·측정·주입은 모두 미실행이며 제품 코드·DB·성능 기준은 변경하지 않았다.

기능별 커밋의 누적 backend/app 소스를 별도 source-only snapshot에서 실제 import했다. 각 단계 새 Python 프로세스에서 SQLAlchemy mapper·전체 FastAPI OpenAPI 생성을 수행하고 app 모듈이 해당 snapshot에서 왔는지 확인했다. DB 연결은 guard로 금지하고 서버 lifespan·HTTP·마이그레이션은 실행하지 않았다. [실행 영수증](../../../_attic/runtime/closure/staged-import-executed-20261009-001/receipt.json)은 9단계 native exit 0과 index 불변을 기록한다. 이는 중간 import 의존성 검증이며 각 중간 커밋의 전체 업무 테스트·DB 동작 통과를 뜻하지 않는다.
