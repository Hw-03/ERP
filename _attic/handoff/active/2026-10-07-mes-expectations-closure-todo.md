# DEXCOWIN MES 기대값 최종 마무리 TODO

- 최신 실제 복구(2026-10-10 04:55 KST): C17 첫 설치 실패·구 묶음 복원 단언을 통과했고 두 번째 설치의 admission 및 0038→0044 마이그레이션 로그를 확인했다. 이후 새 서버는 live 200·ready 503(`RevisionStateError`)으로 native/outer 1 종료해 전체 FAIL이다. 복구 재개 호출 전 실패했으며 강제 종료·정상 모드는 NOT_RUN이다. 저장된 보호 8+6·계측 입력 95개·runtime 불변, 소유 프로세스 종료와 8042/3042 해제를 확인했다. 원본 DB·서비스는 제외하며 격리 사본의 실제 공동복원과 readiness 오류의 국소 원인 확인만 진행한다. 소스 수정 전 실패한 0044 사본과 코드·원문을 보존한다.

- 최신 보호 검사(2026-10-10 03:58 KST): C16 동결은 native/outer 0이었지만 조립은 복사 시작 전 보호 비교에서 native/outer 1로 중단됐다. 동결 이후 `C:\ERP\backend\mes.db`의 크기·SHA·mtime과 WAL 존재 상태가 변했으며 변경 원인은 미확정이다. 이번 실행은 원본 SQLite 연결·쓰기·서비스/예약 작업 조작을 수행하지 않았다. 계측 입력 73개와 외부 근거 6개는 동일하며 소유 프로세스는 종료됐다. C16 조립·실제 복구는 PASS로 집계하지 않는다. 실패 원문을 보존하고 원형 보호 비교를 유지하는 별도 C17 관찰·격리 실행을 준비한다. 성능 추가 탐색과 전체 로컬 검사 반복은 하지 않는다.

- 최신 복원 확인(2026-10-10 03:30 KST): C15 사전 마이그레이션 rollback의 CLI/native/outer 0·구 묶음 exact·DB/보호 8+6 불변·원문/백업 보존·소유 종료/포트 해제를 부모가 대조했다(result `1310973e…`, exit `83d5e45c…`). 첫 실제 공동복구 FAIL과 미실행 후속 모드는 그대로다. 공개 검증기의 두 줄 prefix 후보는 실제 2 FAIL 후 원복했고, 제품 로더 대신 테스트 사본의 경로만 짧게 분리하는 C16을 준비한다. 첫 CI는 일반 E2E 12 FAIL/278 PASS까지 확인해 전체 FAIL이다. 최소 테스트 보정과 실패 사례의 국소 검사 후 최종 HEAD CI를 별도로 완료하며 성능 탐색·전체 로컬 반복은 하지 않는다.

- 최신 실제 실패(2026-10-10 03:17 KST): C15 첫 실제 모드는 구 DB 공개 검증의 262자 Alembic 경로 ImportError로 native/outer 1 종료했다. 첫 설치 실패 rollback은 지났으나 두 번째 설치 뒤 admission·0044 이동·복구 재개를 실행하지 못했으므로 FAIL 유지, 강제 종료/정상 모드는 NOT_RUN이다. 종료 후 소유 프로세스 부재·8042/3042 해제·보호 8+6/계측 47입력/runtime 불변·private DB와 old backup 동일을 읽기로 확인했다. 실패 원문을 보존하며 원형 사전 마이그레이션 rollback과 해당 경로 최소 수정만 진행한다. CI backend 최소 패치는 Windows 국소 3 PASS 후 원형 rollback 소스 바인딩을 위해 원문 복원·패치 보존했다. 전체 검사나 성능 탐색은 재개하지 않는다.

- 최신 확인(2026-10-10 03:04 KST): 작업 브랜치 HEAD `963666f4` CI의 프론트 날짜 테스트 2개와 백엔드 테스트 2개는 FAIL이다. KST 주말 날짜 고정·CI Python 3.12 단언 정정·불필요한 HTTP 연결 없이 실제 리스너 소유권/종료/strict bind를 유지하는 테스트 전용 패치를 준비했고, C15 복구 세 모드의 소스 동결 종료 후에만 적용한다. 첫 실제 복구는 구 서버 기동·조회·종료 및 설치 백업 이후 진행 중이며 나머지 두 모드는 NOT_RUN이다. 성능 추가 탐색·전체 로컬 검사는 중단하고 기존 FAIL/NOT_RUN을 보존한다. 완료 집계는 늘리지 않는다.

기준 계획: [안전성 최종 마무리](../../../docs/superpowers/plans/2026-10-08-mes-safe-closure.md). 이전 [최종 마무리](../../../docs/superpowers/plans/2026-10-07-mes-expectations-closure.md)의 작업을 이어간다.

## 현재 상태

- 2026-10-10 02:30 KST: 기능별 9개 커밋의 HEAD `963666f4`를 `origin/codex/mes-expectation-closure`에 푸시했다. 해당 HEAD [CI](https://github.com/Hw-03/ERP/actions/runs/37966648850)는 진행 중이며 아직 성공 판정이 아니다. main은 `2d79cd28` 그대로다. C15 실제 코드 동결은 native/outer 0, freeze `8da7b984…`·실행기 46개 및 보호 8+6 불변을 부모가 대조했다. 기존 운영/QA 프론트 산출물을 재사용하는 새 코드 묶음 조립이 진행 중이며 최종 실제 복구 세 모드는 아직 NOT_RUN이다. 현재 소스 원장 전체 NOT_RUN과 무거운 성능 상한 FAIL·후속 과제 상태를 유지한다.

- 최신 사용자 지시 반영(2026-10-10): 성능 범위를 일반 품목·상세의 이번 변경 회귀 확인으로 축소한다. 무거운 조회의 모든 부하 2초/10초 달성은 후속 과제이며 기존 FAIL·u30 NOT_RUN은 보존한다. 채택하지 않은 limiter·인증 세션 실험은 원문 백업 후 제거했고 앱 186개가 n5 검증 소스와 바이트 일치한다. 일반 품목 p95 247.933→313.909ms, 상세 323.577→268.164ms로 기존 상대 회귀 기준을 충족한다(일반 품목 증가 65.976ms). 각 판 내부 응답 안정성과 모집단 일치를 확인했으며 메인/작업판 전체 응답이 동일하다고 주장하지 않는다. 복원 후 직접 관련 pytest 33개·Ruff·diff 검사를 통과했다. 추가 최적화·전체 검사 반복은 중단하고 유효한 과거 근거를 해당 범위에만 재사용한다. 최종 복구→잔여 기능별 커밋→작업 브랜치 push→해당 HEAD CI가 남는다. 최신 소스 원장 strict 완료는 재실행하지 않으며 오래된 증거를 현재 PASS로 승격하지 않는다. 아래 기록은 당시 상태다.

- 최신 실제 결과(2026-10-10 01:49 KST): n7 정합성 전용 제한 후보는 native 1·실자료 u10 6 PASS/4 FAIL이다. 묶음 3,349.076ms·정합성 12,196.321ms 절대 상한과 일반 품목/상세 상대 회귀가 남는다. report `5e969e22…`, HTTP/응답/모집단/소스/보호 동일·소유 PID 6개 부재/포트 해제를 대조했고 u30은 NOT_RUN으로 보존한다. 실제 PIN 연결 보유 RED 후 라우트 전용 인증 세션 종료와 limiter 뒤 새 handler 세션을 구현해 관련 120개·Ruff 통과, 관리자 모듈 fixture 타입 힌트 후 해당 6개를 다시 통과했다. 기존 PIN·actor·오류 응답·대기 요청 취소/반환은 유지하며 성능 통과로 확대하지 않는다. 복구 연결 준비의 순수 24개와 구문/원형 본체 AST·해시 보존도 통과했지만 실제 최종 공동복구는 NOT_RUN이다. 최종 동시 조회 비용 진단을 이어간다. 원격 main은 `2d79cd28…` 그대로이며 feature 6개 로컬 커밋 이후 push/HEAD CI는 미완료다.

- 최신 상태(2026-10-10 01:27 KST): 스키마→직원·부서→품목·BOM→입출고·불량→내역·일보→출하·주간 6개 로컬 커밋을 완료했고 HEAD는 `41f5172f`다. 각 staged 차이·공백 검사·실제 날짜·제목을 확인했다. smart preview는 의도된 부분 스테이징의 작업본 차이로 거부되어 실제 게이트를 실행하지 않았고, 기존 검증과 누적 staged import 근거를 해당 범위만 재사용했다. n6 공유 제한 후보는 실자료 u10 8 PASS/2 FAIL(묶음 절대 상한, 작업 상세 상대 회귀)로 최종 채택하지 않았다. 현재 정합성 전용 제한 후보는 관련 81개·Ruff 통과 후 n7 실제 비교 중이다. 실제 PIN 인증 후 대기 중인 DB 연결 보유를 독립 리뷰에서 발견해 별도 수정·회귀 검증 대상으로 기록한다. 성능 기준은 유지한다. 최종 성능·공동복구·최종 코드 검증·원격 push/HEAD CI는 미완료이며 main·직원 환경은 미적용이다. 아래 시각별 기록은 당시 상태로 보존한다.

- 최신 실제 결과(2026-10-10 00:51 KST): snapshot의 기존 8개 좁은 ORM 조회만 scalar로 바꾸고, 기존 세션 상태·정규화 PK 중복 제거·전체 타입 처리를 보존했다. 관련 129개와 Ruff가 통과했고 실자료/합성 2만 nd2 진단은 native 0·전체 정합성 응답 SHA 동일이다. 최종 소스 `0ed60ab3…`의 n5 원형 HTTP u10 비교는 6세션·판별 90표본·전부 HTTP 200·8 PASS/2 FAIL이다. 내역 묶음 p95 15,249.238→4,116.804ms, 정합성 34,285.347→14,938.241ms로 개선됐지만 2초/10초 상한을 초과한다. 상대 회귀는 없으며 보고서 `c60e4462…`·보호 8+6/소스/준비 입력 동일·소유 PID 6개 부재/포트 해제를 대조했다. 남은 u30은 NOT_RUN이며 전체 성능 성공으로 표시하지 않는다. 동기 라우트와 응답 검증을 유지하는 두 무거운 GET의 공유 입장 제한 후보를테스트하고 실제 대기 포함 시간으로 판단한다. 스키마부터 출하·주간까지의 독립 검증된 단계는 로컬 커밋으로 보존하고, 관련 성능 실패 해결 전 원격 push는 하지 않는다. 최종 공동복구·전체 최종 소스 검증·push/HEAD CI는 미완료다.

- 후속 실제 비용 진단(2026-10-10): nd1 실자료 진단은 native 0이며 정상 호출 546.686ms 중 snapshot 312.293ms, 225 SELECT를 확인했다. cProfile은 ORM 인스턴스 생성·UUID 타입 처리 비용을 보여 주며 HTTP 성능 통과 증거로 사용하지 않는다. 합성 2만 진단은 복제본 main 해시 검사 실패로 미완료이고 원본·소스·보호 8+6은 동일하다. 바이트 대조 결과 새 복제본의 SQLite 헤더 18/19번 저널 모드와 27/95번 카운터만 바뀌었으며 기존 canonical engine의 WAL 설정과 연결된다. 새 nd2는 복제본에만 WAL 준비 후 전체 논리 자료 동일성을 비교하고 조회 기준 해시를 별도로 고정한다. nd1 실패 원문은 보존한다. operation/effect scalar 조회의 새 테스트는 1 FAIL/1 PASS, 기존 identity·손상 타입 계약 5 PASS로 RED를 확보했고 국소 구현 중이다. 실제 성능 기준·재고 계산·보호 범위는 변경하지 않는다. 성능·최종 공동복구·커밋/push/HEAD CI는 미완료다.

- 최신 실제 종료·runtime 검증(2026-10-09 23:42 KST): 완료된 실자료 u10/u30의 성능 실패가 확정되어 부모는 session-043의 PID·출생·image·nonce·listener를 대조한 뒤 원형 stop.request watcher로 정상 종료를 요청했다. 해당 합성 구간은 성능 근거에서 제외한다. native003은 23:40:03 native/outer 1·44세션·전체 미완료로 종료했으며 서버 native 0·강제 종료 없음·소유 PID 부재/34145 해제·보호 8+6/실행기 핀/준비 입력 동일을 부모가 대조했다. 원문 report `8aa889bb…`, 중단 의도 `35020f25…`, 부모 완료 `parent-native003-completion-001.json`을 보존한다. 제품 소스 변경 전 실제 비용 진단으로 넘어간다. 서버 종료 후 중단 클라이언트의 정리와 독립적으로 새 QA runtime003 입력 수집·생성·probe를 단계별 실행했고 모두 native 0이다. source pin `df712cd4…`, prepared `7b468c6c…`, probe `a96c00a8…`이며 직접 PID 18948·출생/image/prefix·-I/-B·Pydantic/module metadata 2.13.4·Core 2.46.4 일치, 기존 입력/새 target 불변·소유 종료를 확인했다. 전역 Python·DB·서버 변경은 없다. 이는 runtime 단독 검증이며 최종 코드의 전체 공동복구 성공으로 확대하지 않는다. 완료 7/미완료 2·main/직원 환경 미적용·커밋/push/CI 미완료를 유지한다.
- 최신 실제 성능 문제(2026-10-09 23:28 KST): native003 실자료 mixed/u30 완료 원문은 3 PASS/7 FAIL이다. 작업판 p95(ms)의 절대 상한 위반은 목록 2,111.121·묶음 13,680.857·검색 3,579.903·집중 품목 2,352.514·일보 3,070.084·정합성 47,140.468이다. 검색(+38.06%/+986.967ms, 절대 실패와 중복)과 일반 품목(+22.91%/+162.228ms)은 상대 회귀도 확인했다. 모든 판·항목 90 timed·6세션 native 0/HTTP 200·요청/본문·입력 보존·정리는 충족했다. 원문 JSON `36de9f41…`·부분 보고서 `5d2d919a…`를 보존한다. 현재 합성 2만 mixed/u1 수집 중이며 전체 행렬·성능 완료로 승격하지 않는다. 기준을 유지하고 종료 후 실제 병목 진단·국소 수정·재검증을 수행한다. 기능 strict 완료와 성능·공동복구·커밋/push/CI 미완료를 구분한다.

- 최신 실제 성능 문제(2026-10-09 23:14 KST): native003 실자료 mixed/u10 완료 원문은 7 PASS/3 FAIL이다. 내역 묶음 p95 15,166.181→4,427.227ms는 개선됐지만 2초 상한, 정합성 34,158.267→16,128.997ms는 10초 상한을 초과했다. 상세 245.522→359.615ms는 +46.47%/+114.093ms로 상대 회귀 기준을 위반했다. 각 판·항목 90 timed, 6세션 native 0·HTTP 200·요청/본문 및 입력 보존·정리 계약은 충족하여 전송 실패와 구분한다. 부분 JSON SHA `26307cbb…`·보고서 `8394a3cf…`와 이전 결과를 보존한다. 기준을 올리지 않으며 전체 측정 종료 후 실제 쿼리·행·계산 비용을 좁혀 수정할 예정이다. 지금은 실자료 u30 수집 중이고 제품 코드 변경·무거운 진단을 겹치지 않는다. 기능 strict 완료와 전체 성능·복구·push/HEAD CI 미완료를 유지한다.

- 최신 실제 부분 결과(2026-10-09 23:01 KST): native003의 실자료 및 합성 1천·5천·2만 단일 사용자 검사는 완료 원문 기준 각각 10/10, 합계 40/40 기준 충족이다. 각 판·조회 30회×3묶음, 모든 HTTP 200·native 0·요청 완전성·소스/helper/준비 DB·QA 업무행/bytes 불변 및 세션 포트 해제를 확인했다. 실자료 정합성 p95는 기준 1,380.218→작업 828.206ms, 합성 2만은 2,391.359→694.616ms다. 검색 등 일부 증가도 부분 보고서에 보존하며 기준을 완화하지 않았다. 단일 사용자 혼합 수집을 지나 session-030부터 동시 사용자 측정 중이다. 전체 행렬·외부 보호의 최종 판정은 대기이며 단일 사용자 결과를 전체 PASS로 확대하지 않는다. runtime002 exact PID 실패와 구 성능 실패 원문은 유지하고 새 runtime003은 아직 순수 준비만 완료다. 체크리스트 완료 7/미완료 2·main/직원 환경 미적용·커밋/push/HEAD CI 미완료를 유지한다.

- 최신 실제 실행(2026-10-09 22:21 KST): C14 runtime002는 구버전 서버의 ready·조회 응답 이후 exact PID 소유권 검사에서 22:09:30 native/outer 1로 종료했다. Windows venv launcher와 실제 Python child의 PID가 분리되는 구현·소유 트리를 확인했고 검사나 원형 lifecycle을 완화하지 않는다. 설치·0044 이동 전 실패이며 result/journal은 없다. 저장된 보호 8+6·runtime·executor 전후 동일, 부모의 소유 PID 부재·8042/3042 해제를 별도로 확인했다. 종료 SHA `d523bf5c…`, 읽기 진단 `144ed276…`이며 private 묶음 전수 재해시는 아직 미실행이다. 직접 실행 image를 사용하는 새 QA runtime003은 순수 준비만 진행한다. native003 성능은 22:12:21 supervisor 37948/child 47264로 한 번 시작했고 `native-c902c5303de64697a8fe3e9e1763b9e4`에서 이전 긴 경로 지점을 통과했다. 실자료 단일 사용자 6세션을 수집한 뒤 session-006 합성 자료 측정 중이다. 전체 성능 판정은 대기이며 다른 서버·runtime 실제 생성·무거운 검사를 겹치지 않는다. c13·보류·체크리스트 7/2 상태와 main/직원 환경 미적용을 유지한다.

- 최신 실제 준비(2026-10-09 22:02 KST): 짧은 `performance/n3`에서 admission은 22:00:16~22:00:47 native 0이다. 원형 dispatcher·proof pin 바이트와 9개 측정 함수는 그대로이고 계획된 최장 경로는 임시 접미사 포함 247자다. 새 8개 입력의 raw/family SHA·typed 전수 비교·4개 업무 비교·보호 8+6 전후 동일·소유 child 부재를 부모가 대조했다. binding `e808b45a…`, admission report `e6344c54…`, 부모 완료 `800a3a9a…`이며 HTTP/시간 측정은 미실행이다. C14 runtime002는 새 `run-cf6dcbce` fixture에 기존 프론트 묶음 복사 중으로 아직 설치·마이그레이션·복구 완료 근거가 없다. c13 실행 대상 345개·조건 1,058개와 strict 완료, 보류 6개, 체크리스트 완료 7/미완료 2를 유지한다. 정식 성능·전체 공동복구·기능별 커밋/push·HEAD CI는 미완료이며 main/직원 환경은 미적용이다.

- 최신 실제 진단(2026-10-09 21:52 KST): native002는 21:40:08 native 1로 입력 복사 중 종료했고 서버 기동·응답 시간 표본은 0이다. 복사된 앞선 자료의 업무값 비교와 보호 전후 값은 동일하며, 실패한 synth20000의 첫 current prepared JSON은 임시 경로가 260자였다. 원형 atomic writer를 별도 일반 텍스트에서 실행해 259자 PASS·260자 일반 경로 FileNotFoundError·260자 extended 경로 PASS를 재현했다. SQLite·socket·child 감사 시도는 모두 0이며, 기존 실패 보고서에는 traceback이 없어 원 실행의 정확한 예외 프레임은 확정하지 않는다. 원형 측정 함수·기준·보호는 유지하고 새 짧은 private 경로를 준비한다. c13 기능 실행과 strict 완료는 유지한다. 21:52:23부터 부모는 별도 새 QA fixture의 C14 runtime002 failure-resume만 supervisor 56488로 시작했고 결과는 대기 중이다. 성능 timed 실행과 복구 서버 기동은 겹치지 않는다. main/직원 환경 미적용·커밋/push/HEAD CI 미완료다.

- 최신 실제 완료(2026-10-09 21:40 KST): c13 등록→normalize→엄격 완료 검사는 21:35:15 native 0으로 모두 종료했다. 기본 계약 270개·추가 실행 대상 75개·실행 조건 1,058개 완료이며 보류 6개는 별도로 유지한다. 부모는 실행기 소유 PID 부재·등록 파일 321개·각 종료 원문의 SHA를 대조했다. 부모 완료 `final-c13-promotion-001-parent-completion.json`, pipeline exit `4abfad6d…`다. 성능 입력 admission도 8개 raw/typed 복사·공식 metadata·양쪽 업무 전수 비교·보호 8+6 동일·native 0을 통과했고 binding `45966d90…`로 고정했다. actual full native 성능 측정은 21:39:54 supervisor 53208에서 한 번 시작했다. 다른 무거운 검사·복구 기동을 겹치지 않으며 성능 결과는 대기 중이다. 현재 기능 실행/strict 완료를 성능·전체 공동복구·브랜치 push·HEAD CI 완료로 합산하지 않는다. main/직원 환경은 미적용이다.

- 최신 실제 준비(2026-10-09 21:09 KST): c13 승격은 native 0으로 1,058조건의 원문을 등록했고 normalize→strict는 계속 실행 중이다. 전체 엄격 완료나 전역 PASS로 승격하지 않는다. 성능용 새 private fixture 8개는 21:06:29~21:08:12 helper/wrapper/supervisor native 0이며 공식 schema 준비, 기존 업무값 전수 일치, FK 위반 0, 보호 8파일·외부 6개 동일을 확인했다. 실자료는 원래 0040 입력→clone→각 head와 기존 prepared→최종을 함께 비교하고, 합성 자료는 기존 UUID·시각·수량을 보존했다. 부모의 최종 8 DB SHA·업무값 대조와 소유 PID 부재 확인도 완료했다. report `a4b95141…`, parent completion `parent-execute-completion-001.json`이다. HTTP readiness·응답 시간·동시 부하·새 공동복구 서버 기동은 미실행이며, 기존 성능 FAIL과 C14 공동복구 FAIL은 보존한다. 현재 완료 4·미완료 5와 main/직원 환경 미적용 상태를 유지한다.

- 최신 실제 복원(2026-10-09 20:38 KST): C14 사전 마이그레이션 원형 rollback은 20:36:05 native/outer 0이며 구 코드·프론트·Node·설정 exact, private DB 불변, 보호 8파일·외부 6개 동일·실행 원문 보존을 확인했다. 부모는 소유 PID 3개와 QA 포트 부재를 다시 확인했다. 결과 `85c1373b…`, 부모 종료 관찰 `da096505…`, journal ROLLED_BACK `f6bd44a4…`다. 이는 실패한 C14 전체 공동복구를 PASS로 바꾸는 근거가 아니다. 새 QA 전용 validator-venv-002는 20:30:11~14 생성·격리 import 각각 native 0이며 Pydantic module/metadata 2.13.4·Core 2.46.4/실제 binary SHA 일치다. 전역·기존 venv는 수정하지 않았다. c13 근거 승격→normalize→strict는 20:37:36 supervisor 55520으로 실제 시작했고 결과는 대기 중이다. 시작 영수증 작성의 PowerShell boolean 오류는 해당 프로세스 소유권을 읽어 기록만 복구했으며 재실행하지 않았다. 성능 측정과 새 공동복구 기동은 이 CPU 작업 종료 후 수행한다.

- 최신 실제 종료(2026-10-09 20:23 KST): C14 failure-resume는 20:13:20 native/outer 1로 중단됐다. 두 번째 코드·프론트 설치 뒤 admission의 `-I` Python이 system Pydantic 2.7.1 / Core 2.46.4를 조합해 import 실패했다. 0044 이동·복구 재개·다른 모드는 미실행이다. 보호 8파일·외부 6개·계측 23개는 동일하며 부모의 새 읽기에서 private DB `d7cd2ff8…`와 작업 DB `08fd9b80…` 동일, 소유 PID·8042/3042 listener 0을 확인했다. 두 번째 journal은 아직 INSTALLED로 원형 사전 마이그레이션 rollback을 준비한다. 기존 실패 원문은 보존한다. 커밋 분할의 현재 누적 소스 import/OpenAPI 검사만 정상 사용자 패키지 경로로 새로 실행하여 9단계 native 0·금지된 DB/네트워크/child 시도 0·index/현재 app 불변을 확인했다. 잘못 강제한 PYTHONNOUSERSITE의 앞선 G1 실패도 보존하며 업무 테스트 실패와 구분한다. strict·정식 성능·전체 공동복구·커밋/push/HEAD CI는 여전히 미완료다.

- 후속 범위 판단(2026-10-09 19:55 KST): c13 PNG 숫자는 실제 직원 DB의 비밀 PIN 조회 결과가 아니라 `pin_is_default` 불리언에 따른 공개 고정 QA 도움말이고, pytest 숫자는 기존 소스의 합성 테스트 값임을 확인했다. 실제 PIN/hash·인증 토큰·실직원 연락처의 원문은 제외한다. 추가 QA 숫자 제외 질문에는 아직 회신이 없으며, 선택적 범위 확인을 승인으로 기록하지 않고 위 실제 자격 증명 제외 기준으로 진행한다. 이미지 전수 시각 개인정보 보증은 하지 않는다. 원문·SHA는 바꾸지 않고 현재 복구 실행이 끝난 뒤 자체 전체 근거 검증을 수행하는 승격 절차를 실행한다. 성능의 기준 완화/기준 서버 오류 면제 질문은 이 판단과 무관하며 계속 미승인이다.

- 최신 실제 검증(2026-10-09 19:52 KST): C14 산출물 조립은 19:46:36 native/outer 0·보호 비교 5회 차이 0, manifest `34c5efa6…`이며 원문 입력 핀을 부모가 재대조했다. native TCP 첫 실행은 19:48:40~19:49:54 native 1로 종료했다. 첫 baseline 서버의 `/health/ready`가 RevisionStateError/503으로 준비되지 않아 시간 표본 0·나머지 matrix 미실행이다. source/helper/복제 입력·QA 업무행·main bytes 불변, 실제 child native 0·포트 해제를 확인했으며 성능 수치 실패와 구분해 실행 환경을 조사한다. 기준 메인 건강 검사를 우회하거나 timeout을 늘리지 않는다. 19:51:31부터 C14 실제 failure-resume만 시작했고 다음 모드는 미실행이다. 전용 private DB만 새 스키마 이동·복구 대상으로 사용하며 원본 서비스를 조작하지 않는다. c13 QA 숫자의 커밋 범위 질문과 승격은 회신 대기, strict·성능 완료·전체 복구·커밋/push/HEAD CI는 여전히 미완료다.

- 최신 독립 대조(2026-10-09 19:46 KST): c13 원문·실행 참조 318개 SHA와 현재 고유 입력 2,199개가 모두 일치하고 실행 오류 0·보호 작업 DB 동일·E2E DB 가족 부재·8021/3100 listener 0을 확인했다. 텍스트의 실직원 이름·연락처·인증 토큰 노출은 발견하지 못했지만, 직원관리 PNG의 고정 QA 기본 PIN 도움말과 pytest 테스트 이름의 QA 숫자가 남는다. 사용자에게 계획의 자격 증명 제외 범위를 질문했고 원장 승격은 회신 대기다. 원문은 ignored에 보존하며 다른 이미지로 근거를 대체하지 않는다. C14 실제 source freeze는 native/outer 0·중간 보호 비교 2회 차이 0·실행기 핀 불일치 0(`cb449728…`), 산출물 조립만 진행 중이며 복구 모드는 아직 미실행이다. 스킬의 cutover 재검증 목록 누락과 보조 인계의 과거 대기 문장은 수정 후 독립 읽기 GREEN을 확인했다. 성능 측정·strict·커밋·push·HEAD CI는 미완료다.

- 최신 실제 종료(2026-10-09 19:38 KST): `final-c13-verified-20261009`은 19:26:12에 실행기 native 0/PASS·실패 목록 없음으로 끝났다. 현재 입력·원문·보호 자료의 독립 대조 및 원장 승격은 아직 대기 중이며 `globalPass=false`를 유지한다. p10/q10 실제 production 빌드는 19:18:25 native/outer 0, 번들 3,145,688 / 3,145,728 bytes로 통과했다. p10 보호 비교 5회 차이 0·입력 불변 및 소유 프로세스/8042·3042 해제를 확인했다. 빌드 완료 영수증은 `b6dd8313…`다. 새 C14 소비자 순수 준비 49 PASS는 실제 공동복구가 아니며, native TCP 성능의 사전 prepared DB 핀 보완은 독립 리뷰에서 닫혔지만 실제 측정은 미실행이다. 성능 기준·과거 실패 원문은 보존한다. 커밋·브랜치 push·HEAD CI 및 main/직원 환경 적용은 하지 않았다.

- 최신 준비 실행(2026-10-09 18:59 KST): 중간 비교를 기록하는 p10 동결은 native/outer 0이며 p9와 코드·프론트 맵 동일, 실행기 10개 불일치 0·중간 비교 2개 차이 0·보호/외부/계측 입력 동일이다. 원문 동결 SHA `57a0cfe3…`, 완료 영수증 `0209ba90…`를 보존했다. 새 실제 빌드는 18:56:02 hidden supervisor 21620으로 시작해 운영용 install/build 단계까지 진행했고 결과는 대기 중이다. 기대값 c13도 진행 중이며 제품 소스를 고정한다. 성능 TCP 준비의 독립 리뷰는 복제 DB 내용을 사전에 핀하지 않는 검증 누락을 찾아 실제 측정 전 보완 중이다. 이는 실제 자료 변경 관찰이나 성능 PASS가 아니다. 완료 4·미완료 5 및 최종 push/HEAD CI 미완료를 유지한다.

- 최신 읽기 진단(2026-10-09 18:41 KST): 별도 비교 도우미의 순수 검사 23 PASS/native 0 뒤, p9 동결 보호값과 실제 파일 관찰을 5회 대조해 모두 같았다. 비교 직전 양쪽 입력을 각각 보존했고 입력 SHA 불변·DB/네트워크/child 연결 0이다. 빌드·복구 재시도나 과거 실패 재현은 아니며 p9의 중간 불일치 원인은 여전히 미확정이다. 기존 p9 부분 출력과 실패 원문을 보존하고 새 세대의 중간 비교 기록을 준비한다. 원문: `_attic/runtime/closure/recovery/p9-guard-readonly-observation-001.json`.

- 최신 실행 상태(2026-10-09 18:34 KST): 현재 소스의 `final-c13-verified-20261009` 전체 기대값 실행을 18:20:58에 시작했고 아직 진행 중이다. p9 동결은 native 0이지만 빌드 준비는 소스 복사 후 보호 비교에서 native 1로 중단돼 실제 Next/npm 빌드가 시작되지 않았다. 동결·저장된 전후 보호 값은 같고 실패 순간 중간 관찰값은 저장되지 않아 변경 항목과 원인 미확정이다. 기존 자료와 실패 원문은 보존하며 비교 정책을 완화하거나 재시도하지 않았다. 소유 프로세스 종료·8042/3042 해제를 확인했다. 완료 4·미완료 5, 정식 성능·공동복구·strict·커밋/push/HEAD CI 미완료를 유지한다. 원문: `_attic/runtime/closure/recovery/p9-build-failure-001/receipt.json` (`68023930…`).

- 최신 경로 검증(2026-10-09 18:15 KST): cutover의 긴 경로 읽기와 실제 재현한 `..` 접합점 우회를 최소 수정했다. 최종 관련 세 파일 98 PASS/1 Windows 권한 SKIP·0 FAIL/ERROR/native 0, source `bded52bf…`/test `0026b2c1…` 불변·금지 시도 0이다. 실패 원문과 초기 감시 도우미 오류는 보존했다. 스키마/어댑터 기존 입력 84개도 현재 SHA 불일치 0이며 새 DB 실행은 아니다. 독립 재리뷰와 새 frontend 산출물 준비를 거쳐 전체 기대값·공동복구를 검증한다. 완료 4·미완료 5와 성능/strict/브랜치 push/HEAD CI 미완료를 유지한다.

- 최신 국소 확인(2026-10-09 18:00 KST): 주간 화면 테스트는 응답 보관 뒤 진행 중 handler 정리 경합까지 재현·수정했고 실제 합성 MES UI 3회 모두 PASS/native 0, source `8f721f5e…`·작업 DB 불변·QA 포트 해제를 확인했다. 원문·실패 첨부는 보존하고 전체 원장 PASS로 승격하지 않았다. cutover의 긴 경로 검사는 18 PASS/1 권한 SKIP이나, 독립 읽기 리뷰에서 `..` 경로의 별칭 검사를 추가 확인할 필요가 있어 현재 전체 관련 검사 후 실제 재현할 예정이다. 완료 4·미완료 5, 성능/공동복구/전체 strict/브랜치 push/HEAD CI 미완료다.

- 최신 복원 종료(2026-10-09 17:49 KST): 원형 rollback CLI native 0으로 private 구 코드·프론트·Node·설정 전수 복원과 DB 불변, journal ROLLED_BACK·실패 자료 보존·소유 프로세스/8042/3042 종료를 확인했다. 전체 실행 단위는 원본 두 곳의 빈 WAL 소멸을 감지해 native 1/보호 FAIL이며 원인 미확정이다. 원본 조작이나 재시도는 하지 않았다. 읽기 진단 002의 native 0과 실제 복원·전체 보호 판정을 구분한다. 소스 동결 창 종료 후 cutover 긴 경로·주간 브라우저 응답 읽기 국소 수정을 시작한다. 완료 4·미완료 5와 성능/strict/브랜치 push/HEAD CI 미완료를 유지한다. 원문: `_attic/runtime/closure/recovery/c12-pre-migration-rollback-001/completion.json` (`0295a518…`).

- 최신 복구 중단(2026-10-09 17:32 KST): c12 failure-resume은 17:24:28 native 1이다. 첫 설치 실패 주입·구묶음 복원과 두 번째 코드 설치는 지났지만, 복구 준비의 validator가 존재하는 262자 보존 파일을 일반 Windows 경로에서 누락으로 판정했다. extended 경로의 실제 SHA는 journal과 일치한다. 두 번째 journal은 INSTALLED, 0044 실제 이동·복구 재개·다른 두 모드는 성공 미확인이다. private DB와 보존 자료를 읽기 대조하고 사전 마이그레이션 rollback을 준비한다. 보호 비교에서도 원본 0바이트 WAL의 소멸 차이를 감지했으며 원인 미확정·원본 조작 없이 보존한다. 다른 보호 7개·외부 6개는 동일이다. 완료 4·미완료 5 및 strict/성능/커밋/push/CI 미완료를 유지한다.

- 최신 종료(2026-10-09 17:18 KST): c12 전체 기대값은 17:15:56에 native 1/FAIL로 끝났다. 주간보고 응답 수명 오류 1개 외 8그룹은 통과했고, 현재 소스 입력 2,198개·원문 SHA의 충돌/변경/불일치 0을 부모가 확인했다. QA 8021/3100 해제 및 보호 복제 DB `08fd9b80…` 동일이다. 독립 loopback에서 동일 CDP 오류 5/5와 응답 보관 대안의 본문 일치 5/5를 재현했으나 실제 MES PASS로 합산하지 않는다. 실패 실행·원문을 보존하고 최소 테스트 패치는 복구의 현재 실행 종료 후 적용한다. 공동복구 첫 전방 설치 실패 주입·구묶음 정확 복원은 지나갔지만 두 번째 설치·0044·복구 실패/재개 및 모드 종료는 대기 중이다. 현재 완료 4·미완료 5다.

- 최신 후속(2026-10-09 17:04 KST): c12 복구 동결·조립은 실제 native 0/PASS이며 최종 manifest `9790d71b…`·실행기 19개·보호 복제 DB와 private 구 DB·8042/3042 해제를 부모가 대조했다. 실제 설치 실패·재개만 17:00:45 시작했고 강제 종료/정상 모드는 미실행이다. c12 기대값 첫 브라우저는 258 PASS/1 FAIL이며 주간보고 응답 본문을 읽을 때 Chrome resource 수명 오류가 발생했다. 원문을 보존하고 조사하며 나머지 그룹은 계속한다. 현재 전체 PASS·strict·복구 완료로 승격하지 않는다. 체크리스트는 완료 3·미완료 6으로 유지한다.

- 최신 검증 기록(2026-10-09 16:24 KST): c11 전체 기대값은 실제 345대상·9그룹 PASS/native 0으로 종료했다. 이후 복구의 긴 파일 격리 경로 두 줄을 수정했고 관련 130 PASS·0 SKIP, 독립 리뷰 Critical/Important 없음이다. 수정 전 c11 결과는 보존하고 현재 소스의 `final-c12-verified-20261009`를 실행 중이다. backend004는 이 국소 수정 전의 3,815 PASS·83 SKIP이며 관련 130개 현재 결과와 구분한다. 프론트 소스는 같아 frontend004의 3,798 PASS 및 p8/q8 production 빌드·번들 근거를 재사용한다. 공동복구 attempt003은 native 1 뒤 구묶음 정확 복원·보호 불변을 확인했고 새 c12 동결/조립을 준비한다. 정식 성능·최종 strict·커밋/브랜치 push·HEAD CI는 미완료이며 main/직원 환경에 적용하지 않았다. 아래 시각별 기록은 당시 상태의 역사 근거다.
- 2026-10-07 사용자가 목표 실행과 별도 워크트리·DB 복제를 승인했다. 일시 정지 후 같은 날 재개했다.
- 최초 기준 HEAD: `a8eda817576123d830a730dddbeaff1d29fb31ec`. 기존 수정은 `d9c1df01`, `a8eda817`로 origin/main에 푸시했다. 이후 통합한 현재 기준은 아래 `2d79cd28` 기록을 따른다.
- 워크트리: `C:/Users/user/.codex/worktrees/mes-expectation-closure/ERP`. 최초 detached HEAD에서 2026-10-08 승인된 `codex/mes-expectation-closure` 브랜치를 생성했다. 앱 등록은 ownerless 확인 제약으로 실패했으나 이 대화의 생성 이력과 Git 기준 HEAD를 확인했다.
- 기대값 분모·상태는 원장 검사에서 동적으로 계산한다. 원본 관찰·과거 테스트를 현재 PASS로 바꾸지 않는다.
- 2026-10-08 원격 main `353ee530`을 작업 브랜치에 통합했다. 원본 C:/ERP의 main 포인터·미커밋 파일은 수정하지 않았다. 통합 직전 소스 복구 사본은 `_attic/runtime/closure/resume/20261008T095318-pre-main-integration/`, 복구 stash는 `c9ae75605f5f57106edd9595259f2d6d00c3da36`으로 보존한다. 최종 스키마는 두 migration 가지를 연결한 `20261008_0044`이다.
- 2026-10-08 11:07 KST 원격 main `2d79cd28`까지 작업 브랜치에 추가 통합했다. 배포 정지 중 감시 프로세스 재기동 차단과 기존 마이그레이션 테스트 갱신이 대상이며 제품 API·화면 변화는 없다. 겹치는 테스트 두 파일을 별도 보존한 뒤 정상 fast-forward하고 현재 작업본을 복원했다. 기존 tracked 작업 파일의 SHA가 모두 그대로임을 확인했으며 복구 자료는 `_attic/runtime/closure/resume/20261008T110701-main-2d79/`에 보존했다.

## 체크리스트

2026-10-09 05:42 KST: 원래 SHIP-REMATCH 실제 브라우저 1 PASS·재시도/FAIL/SKIP/flaky 0 및 소스/보호 DB 보존·전용 포트 해제를 확인했다. 새 TCP 진단도 네 실제 서버 native 0·202 HTTP 200·계측 전후 본문 동일·소유 종료·전후 파일 보존으로 끝났다. 세 표본 진단은 정식 p95 성공으로 승격하지 않으며 공식 20 FAIL은 유지한다. 최신 원장의 NOT_RUN 상태를 보존한 채 변경된 테스트 선언·SHA만 갱신해 normalize/check/full plan(9묶음·345대상)을 통과했다. p7/q7 새 빌드, 최신 frontend 전체 검사 및 성능 프로파일 준비를 진행한다. 전체 실행·복구·엄격 완료·커밋·푸시·CI는 계속 미완료다.

2026-10-09 05:24 KST: canonical c8은 첫 브라우저 258 PASS/1 FAIL 및 Vitest 중복 이름 근거 거부로 native 1 종료했다. 출하 단계 경계의 실제 RED 후 관련 29 PASS, 설치 긴 경로의 실제 RED 후 기존·신규 30 PASS를 확인했다. 테스트 이름 구별만 한 큐 17개와 내역·출하 대상 7개도 통과했다. 전체 기대값 재실행·strict·새 p7/q7/c9 공동복구·정식 성능 20 FAIL 해결·커밋·브랜치 push·해당 HEAD CI는 남아 있다. 첫 TCP 보완 진단은 포트 할당 중 native 1/HTTP 0으로 중단됐으며 수정한 도우미의 새 진단만 진행한다. 원장 PASS 승격과 체크리스트 완료 수는 변경하지 않는다.

- [x] 기존 변경 검토·검증·커밋·푸시: 사전검증 pytest 58, 사유 Vitest 23, 관련 ESLint와 tsc 통과.
- [x] 워크트리 DB 복제 및 독립 실행 환경: SQLite 온라인 백업과 복제본 SHA 일치, quick_check/FK 검사 및 bootstrap --check 통과(2026-10-07). Node 20과 독립 npm ci 완료. 원본 서비스·DB는 변경하지 않았다.
- [x] 전체 원자 조건 검토·지도 보류·실제 assertion 연결(2026-10-09): 원장 전체 atomicReview 완료, 실행 대상 조건의 테스트 연결 및 보류 정책을 확인했다. c11 대상 345개·9그룹 실제 PASS와 c12 시작의 현재 원장/선택자 검증으로 연결을 대조했다. 실행 승격·strict·현재 코드 전체 완료는 아래 별도 항목이다.
- [x] schema 2 실행기·엄격한 근거 검증 구현(2026-10-09): c13 등록·정규화·`--check --require-complete` 모두 native 0, 대상 345개·조건 1,058개 완료 및 원문/현재 입력 검증을 확인했다. CI 실행 계약은 구현했으며 해당 브랜치 HEAD의 실제 CI 성공은 마지막 통합 항목에서 확인한다.
- [x] 백엔드 회귀 누락 보완(2026-10-09): 위치·후속 생산/출하·실패/취소·기간·UUID/동시 조회 회귀를 추가했다. backend004의 실제 3,815 PASS·83 환경별 SKIP과 필수 PostgreSQL의 실제 별도 실행 근거를 보존한다. 이후 복구 긴 격리 경로 수정은 관련 130 PASS·0 SKIP, cutover 긴 경로 및 실제 `..` 접합점 우회 수정은 최종 관련 세 파일 98 PASS·1 Windows 권한 SKIP·native 0으로 따로 확인했다. 독립 재리뷰는 지정 경로에서 Critical/Important 0이며 SKIP을 PASS로 합산하지 않는다. 전체 HEAD CI와 현재 기대값 실행·성능·공동복구 판정은 각각 아래 미완료 항목으로 남긴다.
- [x] PC·모바일 정상 복귀 history 및 화면 회귀(2026-10-09): c13 실제 Playwright 첫 그룹 259 PASS·재시도/FAIL/SKIP/flaky 0 및 후속 AS·연구 그룹 9/1 PASS를 근거로 등록했다. 다른 실행기 근거와 함께 엄격 완료 검사를 통과했고, 합성 QA·실제 실행 소스/환경 식별값과 원문을 보존했다.
- [x] 일반 배포 공동복구·activation fence·격리 리허설(2026-10-10): C18 설치 실패·복구 실패 주입·재개는 실제 native/outer 0이며 마지막 정상 복구도 native/outer 0, resume=false다. 강제 종료 본체 native 0/PASS와 기존 수집기 FAIL125를 분리하고 null/빈 문자열 비교 오류만 바로잡은 별도 읽기 수집 근거로 재검증했다. 원 FAIL과 모든 실패 원문을 보존한다. 0038→0044→0038 실제 기동·조회·종료, 원형 SQLite snapshot digest 및 구 코드·프론트·Node 복원, 보호·소유 프로세스·포트 정리를 확인했다. 정제 근거는 `docs/superpowers/specs/2026-10-10-mes-recovery-scoped-results.json`이다. 직원 환경 배포·예약 작업과 업무 재개는 미실행이다.
- [x] 전체 기대값의 과거 실행과 브라우저 근거 보존(2026-10-09 실행·2026-10-10 범위 조정): c13의 9그룹 native 0 및 당시 엄격 완료 native 0을 이력으로 보존한다. 현재 소스와 넓은 snapshot이 달라 조건 1,058개는 historicalExecutions에 보존하고 현재 NOT_RUN이다. 현재 전체 재실행·재승격은 사용자 지시로 후속 과제이며 현재 전체 PASS로 세지 않는다. 기본 계약과 추가 기대·합의한 보류를 구분한다.
- [ ] 최종 통합·가이드·세분화 커밋·푸시·CI·READY_NOT_APPLIED

실제 직원/개발 DB·서비스·예약 작업 적용은 범위 밖이다.

현재 대시보드(2026-10-10 09:45 KST): 체크리스트 9개 중 완료 8개·미완료 1개. 공동복구는 위의 실제 실행·별도 수집 근거로 완료했으며 과거 FAIL은 보존한다. 기능별 9개 커밋은 작업 브랜치에 푸시했으나 첫 HEAD CI는 FAIL이다. 남은 테스트 수정·원장 연결·문서 커밋과 최종 HEAD CI를 진행한다. 일반 조회의 국소 회귀 검증은 통과했고 무거운 조회의 절대 상한 FAIL·u30 NOT_RUN 및 현재 기대값 전체 재실행은 후속 과제다. 추가 성능 탐색과 전체 로컬 검사 반복은 중단하며 main·직원 환경은 미반영이다.

## 확정 결정 — 2026-10-08 실행 승인

- 주간보고 동결 예외: PF 픽업만 있는 주의 표 노출, 한국 시간 주 경계, 전체 정상재고 합계 표시 및 집계·검산 범위 안내를 고칠지 결정한다. 제안은 이 범위만 수정하고 기존 재작업 입고·불량 두 열 계산은 유지하는 것이다. 승인 전 동결 파일은 수정하지 않는다.
- 출하 부족 검사: 실제 준비할 PF와 동반 출하품을 검사하는 현재 계약으로 기대값을 정렬할지, BOM 구성품 부족도 출하를 막도록 확장할지 결정한다. 실제 출하 대상을 검사하는 현재 계약 유지를 제안했다.
- 신규 직원의 관리자 메뉴: 기본 숨김 후 명시적으로 켜는 방식으로 바꿀지, 현재의 메뉴 노출·PIN 확인을 유지할지 결정한다. 기본 숨김을 제안했으며 기존 직원의 설정·독립 승인 역할은 보존한다.

위 문단은 최초 질문 내용이다. 2026-10-08 사용자가 추천 세 가지의 실행을 명시 승인했다. 주간 동결 예외는 위의 제한 범위, 출하는 PF·동반품 유지, 신규 직원은 관리자 메뉴 기본 숨김으로 확정한다. 더 이상 회신 대기로 취급하지 않는다. 최종 목적지는 codex/mes-expectation-closure 작업 브랜치 push와 CI 성공이며 main 반영·직원 배포는 제외한다. 시작 소스/복제 DB 백업은 _attic/runtime/closure/resume/latest.json으로 찾는다. 성능 비교·위치별 정합성·실제 격리 프로세스·원격 main 통합 후 0044 복구를 포함해 진행한다.

- `INTEGRATION-TUBE-SUPPLIER`: 원격 main `353ee530`의 튜브 반품 정책을 보존한다. 창고·튜브 DEFECT는 허용하고 조립 등 나머지 부서는 차단한다. 실제 튜브 TR 원건은 tube 업체, 비TR 원건과 원건 없는 레거시 등 나머지 허용 경로는 warehouse 업체를 사용한다. 이전 기대와 연결은 `mes-expectations.sources/main-integration-before.json`에 보존한다. 이는 기존 main 기능의 통합이며 새 부서 권한을 추가하지 않는다.
- 일보 취소 표시는 원작업 날짜의 기존 취소 상태를 유지하면서 실제 취소 날짜에도 역거래를 한 건으로 표시한다. 같은 날짜의 정·역 및 여러 품목은 취소 작업 ID로 중복을 제거한다. 처리내역에서 원작업과 취소를 각각 세는 G09와 일보 완료 수량 기준은 유지한다. 관련 백엔드 39개·화면 40개가 통과했고 최종 원장 연결에 반영했다.

## 최종 검증 진행 — 2026-10-08

- 프론트 전체 타입·정적 검사 통과. 최초 전체 실행의 화면 이동 검사 1건은 5초 timeout이었고 별도 실행 18개는 통과했다. 시간 제한·검증 조건을 바꾸지 않고 병렬 수를 4로 줄인 당시 전체 재실행은 340파일·3,784개 및 커버리지 기준을 통과했다(`final-frontend-coverage-limited.log`, statements/lines 95%, branches 92.61%, functions 88.94%). 후속 2026-10-08 19:00:46~19:09:38 KST의 최신 native 실행에서는 Node 20으로 lint·타입·전체 커버리지 모두 exit 0, 340파일·3,790 PASS·0 SKIP 및 같은 커버리지 비율을 확인했다. `maxWorkers=4/minWorkers=1`, 938개 입력 소스 불변이다([영수증](../../runtime/closure/final-frontend-native-001/receipt.json), [로그](../../runtime/closure/final-frontend-native-001/coverage.log)). 이전 3,784개와 합산하지 않으며 현재 프론트 소스의 부분 검증으로만 인정한다. backend·브라우저·성능·복구·최종 CI 전체 통과를 뜻하지 않고 c3 production 빌드 동일 소스 재사용은 별도 근거로 판단한다.
- 백엔드 전체 실행의 종료 결과와 후속 교정은 아래에 구분 기록했다. 기존 backfill 테스트의 최종 head 기대값 누락은 0044로 정렬했고 해당 파일 3개가 통과했다(`final-backfill-corrected.xml`). 컴파일과 OpenAPI 기준 대조도 통과했다.
- 요청순 수량 조회는 대상의 실제·요청 시각부터 필요한 이력만 읽고 전체 원장의 레거시 취소 경계를 별도로 보존한다. 관련 124개, 수정 전후 실제 HTTP 응답 20개 일치, 독립 원장 2,400개·대상 결과 7,191개 동등 검사를 통과했다. 이는 최종 성능 판정과 구분하며 정온 측정은 남아 있다.
- 기대값 도구 56개가 통과했고, 일보의 무관한 저장 성공 연결을 실제 묶음·단위·취소 경계 검사로 교체했다. CI의 일반·AS 역할 회수·AS UI 수집 합집합은 전체와 같고 교집합은 없다. 원장 실행 상태는 아직 NOT_RUN이다.
- 공동복구 준비 중 현 직원 코드와 보존 0038 코드 차이를 감지해 중단했다. 보존 DB와 일치하는 실제 이전 배포 journal의 코드·빌드·Node를 읽기 전용 대조한 뒤 복제 환경에서 사용한다. 일치하지 않는 세대의 자료를 섞지 않는다.
- 최종 백엔드 전체 실행은 3,568개 중 3,505 PASS·4 FAIL·59 환경별 SKIP으로 종료됐다(`final-backend.xml`). head 기대값은 관련 3개 재실행 통과, 로그 다중 프로세스 검사는 30초 제한을 유지한 단독 재실행에서 통과했다. 포트 검사 2건은 `PYTHONUTF8=1`과 한국어 Windows `netstat` 출력 인코딩 충돌로 재현했으며, ASCII 주소·상태·PID를 바이트로 읽는 수정 후 관련 47개가 통과했다. 전체 명령 자체를 PASS로 바꾸지 않으며 최종 HEAD CI와 필수 PostgreSQL 실제 실행은 남아 있다.
- 복귀 이후 후속 업무의 부족한 연결을 보강했다. 창고·튜브·고압 × 불량·B급·구형 × 단건 부분·단건 전량·일괄 전량의 27개 조합에서 복귀 전 생산 거부, 실제 이동·BOM 소비·PF 생산·출하 예약·픽업, 예약 복원 및 역순 취소의 전 위치 수량 일치를 확인했다(`restore-production-shipping-chain-first.log`). 기존 PC·모바일 흐름과 이 API 조합 검증의 범위는 구분한다.
- 같은 세 위치 × 세 분류의 일괄 부분 입력 거부 9조합을 별도로 보강했다. 잔량 2인 원건 둘에 전량 2+부분 1을 혼합 요청해 422·VALIDATION_ERROR·수량 변경 안내를 확인하고, Inventory/InventoryLocation 수량·예약 셀과 원건 잔량 및 세 원장 건수 불변을 재조회한다. 최종 단언 보강 후 9 PASS·0 SKIP(`bulk-partial-restore-guard-contract-green.xml`)이며 앞선 같은 9개 통과와 합산하지 않는다. 제품은 변경하지 않았고 기존 27개 함수·데코레이터는 보존 초안과 AST 동일하여 과거 통과를 재사용한다. 36개 현재 전체 실행이나 PC·모바일 전체 조합 완료로 표시하지 않는다.
- 최종 기대값 실행 `final-main2d79-20261008`에서 브라우저의 메모 선택 중복·필터 전 응답 수신·완료된 목록 표식의 분리·검색 자동 펼침과 수동 클릭 경합·상세 전후 수량 표시의 오래된 문자열 기대를 발견했다. 실패 근거는 `final-browser-diagnostics/`에 보존했고 해당 검사들을 보완했다. 이 실행은 승격하지 않으며 수정 후 새 실행으로 검증한다.
- 품목 전환 내역이 회수품을 대표로 선택하는 순서 의존을 단위 검사에서 재현했다. 전환 단계의 생산 거래를 우선 표시하는 국소 수정 후 정·역·비전환 보존을 포함한 관련 144개가 통과했다(`conversion-history-race-review.md`). 재고·원장 역할 의미는 변경하지 않았다.
- 실제 production 빌드는 통과했지만 번들이 3,146,367바이트로 승인된 3.00MiB 한도를 639바이트 초과했다. 출하 준비 상세의 동일 표시행 두 곳만 공유하는 수정 후 관련 180개·타입·정적 검사를 통과했다. 한도는 유지하며 후속 실제 빌드·번들 판정과 공동복구는 아직 실행 중이다.
- 실패한 브라우저 흐름과 연관 사례의 집중 재실행은 6 PASS, exit 0이었다(`final-browser-five-focused.log`). 메모·필터·목록·전환·일보 수량 단언을 유지했다. 보호 복제 DB SHA 불변과 QA 포트 정리를 확인했다.
- 후속 c2 production 빌드는 통과했고 번들이 3,145,796바이트로 줄었지만 한도보다 68바이트 커서 실패했다. 추가 소스 변경이 필요해 시작한 `final-frozen-20261008` 실행을 소유 프로세스 트리 확인 후 중단했다. 실패한 `final-main2d79-20261008`과 중단한 실행 모두 승격하지 않는다. 중단 이유·소유권·DB 불변 근거는 해당 실행의 `ABORTED.md`에 보존했다.
- 출하 부족 배지의 동일 클래스 두 곳과 스타일 세 곳만 상수로 공유했다. 기존 표시·수량·동결 카드 배치는 그대로이며 관련 180개·ESLint가 통과했다(`final-shipping-badge.xml`). 실제 새 빌드와 번들 판정은 대기 중이다. 전체 기대값 실행은 최종 빌드·성능 확인 뒤 새 ID로 수행한다.
- 복구 소스 고정에서 제외하는 E2E 임시 파일은 정확한 세 상대경로로 제한했다. 같은 이름의 문서·실제 TypeScript 소스·다른 임시 파일 변경은 계속 감지하고, 운영 산출물의 전체 바이트 검증도 유지한다. 이 회귀와 Windows 인코딩·프로세스 소유권·활성화 관련 48개가 통과했다. 0044 실제 공동복구 리허설의 성공 판정은 별도로 남아 있다.
- 독립 최종 검토는 위치·예약·동시 처리·조회·대표행·근거 검증의 지정 고위험 경로에서 확정된 차단 결함을 발견하지 못했다. 증빙 도구 독립 검사도 56 PASS/실패·SKIP 0이었다(`final-independent-safety-review.md`). 성능 기준·PostgreSQL·공동복구·최종 HEAD CI를 대신하는 결과는 아니다. 최종 보고서 초안은 [검증 결과](../../../docs/superpowers/specs/2026-10-08-mes-safe-closure-results.md)에 기록한다.
- c3 최종 production 준비는 READY·exit 0이다. Node 20의 npm ci/postinstall·빌드·타입 및 번들 검사 3개가 통과했고 실제 번들은 3,145,670바이트로 승인 한도 3,145,728 이내다. 소스·도구·전체 산출물 해시도 검증했다(`recovery/c3/artifacts.json`, 준비 ID `255bdbc4ab8ed2938f2807844aa6f8ee0fc3289cdf8f8b89eff2e907d54056d5`). 이 준비 통과와 이후 실제 공동복구 리허설은 별개다.
- 정온 mixed30 확정 실행은 FAIL이었다(`performance/final-main2d79-mixed30/report.json`). 2만 거래 합성 자료·30명·30회×3묶음에서 소스와 양 DB 해시 불변, HTTP 오류/timeout 0, 전체 log 모집단 동일을 확인했다. 후보 p95는 목록 877.9ms·검색 1,769.5ms·집중 품목 853.4ms·상세 562.2ms·작업 상세 588.3ms로 기준을 통과했다. 묶음 내역 12,807.2ms·일보 8,909.5ms·정합성 19,893.4ms는 절대 상한을 넘었고, 일반 품목 620.4ms·재고 634.1ms는 상대 회귀 기준에 걸렸다. 최종 전체 matrix는 실행하지 않고 보류했다. 전체 행 조회·계산·직렬화 구간을 분석하며 임계값·조회 의미는 유지한다. 이 실패를 성능 완료로 표시하지 않는다.

- 정합성의 주간 미분류 검사는 기존 완제품 분류 조건을 SQL에 동일하게 적용해 대상 밖 거래의 객체 생성을 없앴다. NULL·기타 분류·모든 완제품 분류·취소·보관·활성 경계를 포함한 관련 47개가 통과했다. 실자료와 2만 거래 합성 자료의 응답 전체 SHA가 이전과 같고 DB는 불변이었다(`performance/integrity-weekly-filter-evidence.json`, `integrity-weekly-filter-response-equivalence.json`). 전체 재고 정합성 원장 모집단은 줄이지 않았다.
- 묶음 내역은 모든 연결 키와 불량 lifecycle 양쪽 유형이 없는 독립 거래에만 검색·정규 커서를 먼저 적용하고 페이지 크기+1개를 읽는다. 연결 가능 거래는 기존 전체 그룹 규칙을 유지하며 비정규 커서는 기존 경로로 조회한다. 실제 메타데이터 과다 조회 5실패를 재현한 뒤 모든 페이지·UUID 동시각·희소 검색·비일치 형제 행 보존을 포함한 63개가 통과했다(`performance/solo-page-red.log`, `solo-page-green.log`, `solo-page-sparse-search-green.log`). 실제 HTTP 동등성과 부하 기준 통과는 후속 측정으로 별도 판정한다.
- 새 QA 주소의 실제 production 빌드 qa1 준비가 exit 0으로 완료됐다. c3와 프론트 소스·Node·설정 원문이 같고 전체 산출물 해시 검증도 통과했다(`recovery/qa1-result.json`). 이전 qa0 및 운영용 c3 영수증은 보존하며, 최종 백엔드 코드 고정 후 새 코드 스냅샷과 연결할 예정이다. 실제 공동복구는 아직 완료로 기록하지 않는다.

- 추가 독립 검토에서 묶음 내역의 두 SELECT 사이에 PostgreSQL 레거시 취소가 커밋되면 원거래가 두 집합 모두에서 빠질 수 있는 P2 회귀를 확인했다(`final-query-optimization-review.md`). 고정 자료의 HTTP 응답 30쌍 동등 검사만으로 이 경합을 검증하지 못하므로, 시작한 `final-main2d79-mixed30-v2`는 소유 프로세스만 종료하고 ABORTED로 보존했다. 완료 표본과 성능 판정은 없다. 같은 문장 스냅샷의 단일 조회 및 PostgreSQL 경합 검증을 보완한 뒤 재측정한다.

- 위 누락 가능성은 연결 거래 전체와 제한한 독립 거래를 단일 UNION ALL 조회로 읽도록 보완했다. 실제 SQL 개수 2≠1의 RED 후 기존 63개와 새 단일 문장 검사를 포함한 64개가 통과했고 PostgreSQL dialect 컴파일도 확인했다(`performance/solo-snapshot-red.log`, `solo-snapshot-green.log`). PostgreSQL 검사는 독립 READ COMMITTED 연결에서 취소 경로의 레거시 편입·연결을 커밋하고 원행 전체의 페이지 보존을 확인한다. 취소 역거래 생성 전체를 실행하는 검사는 아니며, 로컬 환경 부재로 1 SKIP이다. 해당 파일을 CI 필수 PostgreSQL 목록에 넣었으며 실제 실행 통과는 아직 대기다.

- 최종 단일 조회 구현과 최적화 전 메타데이터 조회를 같은 실자료·합성 DB에서 대조한 실제 API 응답 30쌍이 모두 일치했다. 검색·페이지 크기 1·서버가 반환한 세 종류의 다음 커서를 포함한다(`performance/single-snapshot-http-equivalence/comparisons.json`). 비교 코드 사본의 차이가 transactions.py 한 파일뿐이며, 실행 전후 제품 소스 해시도 유지됨을 확인했다. 이 동등성 결과를 부하 성능 통과와 구분하고 `final-main2d79-mixed30-v3`로 다시 측정한다.

- v3 동시 측정은 3묶음을 완료했으나 전체 기준에는 미달했다(`performance/final-main2d79-mixed30-v3/report.json`). 소스 불변·HTTP 오류 없음·전 endpoint의 log 모집단 일치를 확인했다. 후보 p95는 묶음 내역 1,046.5ms와 정합성 7,792.2ms를 포함한 8개 조회에서 기준을 통과했지만, 검색 2,033.2ms와 일보 8,388.1ms가 2초 상한을 넘었다. 상대 회귀는 없었으며 전체 matrix는 아직 미실행이다. 기존 profile에서 확인한 scalar 행의 중복 ORM 처리 비용을 최소 변경으로 제거할 수 있는지 후속 검증한다.

- 거래 효과의 4컬럼 조회와 정합성 원장의 10컬럼 조회를 동일 타입·필터의 Core 조회로 바꿔 중복 ORM 행 포장만 제거했다. 기존 전체 행·역산·손상·주간 규칙 관련 94개 검사가 통과했고, 실자료·합성 자료의 응답 30쌍과 DB 해시가 이전과 같았다(`performance/scalar-read-core/checks.json`, `scalar-core-http-equivalence/receipt.json`). 한 묶음의 후보 전용 진단에서는 일보가 최대 약 6.85초로 여전히 상한을 넘었으므로 성능 완료로 표시하지 않는다. 추가 후보는 제품과 분리한 실험 사본에서 먼저 확인한다.

- JSON 반복 해석을 줄이는 별도 실험은 원본 응답·DB 불변 및 손상 값 처리를 확인했지만 요청 전체의 속도 개선을 입증하지 못해 제품에 반영하지 않았다(`performance/scalar-read-core/json-prototype/result.json`, `phase-result.json`). 미래 거래를 단순 합산하면 중간 음수·불완전 원장 장벽을 잃으므로 채택하지 않는다. 현재 Core 조회까지 제품 코드를 고정하고 최종 공동복구·원장 실행을 준비한다. 성능의 일보 상한 미달과 전체 matrix 미실행은 완료를 막는 별도 잔여 항목이다.

- 비대상 미래 거래의 객체·UUID 처리를 줄이는 두 번째 실험도 제품에 반영하지 않았다. 원래 역산과 임의 자료 160개·전체 일보 응답은 같고 단일 요청 CPU는 줄었지만, 한 묶음의 동시 조회 진단은 약 3.98~7.30초로 개선을 입증하지 못했다(`performance/future-suffix-prototype/result.json`, `performance/future-suffix-prototype/mixed30/receipt.json`). 복구 I/O와 병행한 진단이므로 정식 성능 결과로 승격하지 않는다. 2026-10-08 14:32 KST에 제품 고정본으로 `final-core-frozen-20261008`을 시작했으나 아래 종료 확인 기록처럼 완료 근거 없이 중단됐다.

- 14:48:22~14:49:10 KST 구간 진단의 일보 큰 fetch는 wall 3.77~6.24초에 비해 thread CPU 0.59~0.66초였다(`performance/scalar-read-core/mixed-phase-result.json`). fetch 경계의 비실행 대기가 주요 지연이지만 GIL/OS/SQLite 세부 원인은 미확정이다. 중첩 시간을 합산하거나 JSON memo/future suffix를 개선 완료로 취급하지 않는다.

- 첫 bounded 후보는 hot item 16,000행의 값만 대조했고 전송도 16,000행·최대 chunk 1행이었다. SQL GROUP BY 키의 괄호 누락을 이후 재현했으므로 “실자료 효과가 유일해서 줄일 수 없음”은 확정 근거가 아니다. 부모가 `self_group()`으로 고친 별도 raw-chunk 사본은 20,000행 전체 typed 값·전 대상 재고 역산이 같고 전송 313행·최대 chunk 64행이며 DB/제품 소스는 불변이다(`performance/raw-chunk-prototype/parent-fixed-oracle-result.json`). 15개 경계 결과는 `parent-small-result.json`에 분리 보존한다. 이 전체 범위를 첫 16,000행 검사에 소급하지 않는다.

- raw-chunk의 후보 전용 1묶음은 10개 전체 응답이 같지만 일보 최대 10.61→5.24초로 여전히 미달이다(`performance/raw-chunk-prototype/parent-mixed30/receipt.json`). 미사용 Item/IoBatch 컬럼 축소 사본의 일보 최대는 4.54초, 정합성에도 packing을 넣은 사본은 일보 5.55초·검색 4.31초였다(`parent-slim-mixed30/receipt.json`, `parent-both-mixed30/receipt.json`, 같은 raw-chunk 디렉터리). 전부 ignored 진단이며 제품·원장 binding/PASS에 편입하지 않았다. 정온 3묶음·전체 matrix와 성능 통과는 계속 미완료다.

- `final-core-frozen-20261008`은 15:19 KST OS 조회에서 실행기·부모 종료를 확인했고 `run.json`이 없다. 마지막 일반 브라우저 진행은 203/258, 15:16:25이며 종료 원인은 미확정이다. `_attic/runtime/mes-expectations/final-core-frozen-20261008/ABORTED.md`와 `final-core-aborted-owned-processes.json`을 보존했고 소유 백엔드 두 프로세스만 정리했다. 보호 DB hash는 같다. 부분 진행을 PASS 또는 제품 결함으로 단정하지 않으며 새 완료 receipt·승격·strict가 필요하다.

- 첫 c4 복구는 14:41:55 KST 시작 후 15:37 이전 종료됐고 실제 복구 완료 결과가 없다(`recovery/c4/failure-resume.log`). 후속 초기 복제본 확인은 41,509파일의 정확한 hash 일치와 설치/복구 미시작을 기록했다(`recovery/run-6e4c17d0/initial-fixture-verified.json`). 첫 wrapper의 `exitCode=null`은 역사 기록으로 보존하며 v2 검증은 15:58:26 KST exit 0, 초기 복제 재사용 안전 검사는 9 PASS다(`recovery/initial-fixture-reuse-summary.json`). 초기 복제본 검증을 실제 0044 공동복구 성공으로 바꾸지 않는다.

- 승인된 종료 조건에서 아직 필요한 것은 성능 기준 충족(기존 matrix 프로세스는 종료·FAIL이지만 혼합 표본이 조회별 9개로 사용자 요구 90개에 미달), 실제 PostgreSQL 실행, 최신 소스의 공동복구·DB 보존, 새 canonical 완료·증거 승격·strict·privacy, 최신 Core/변경 oracle의 독립 사양·품질 근거 연결, 최종 HEAD의 전체 CI와 기능별 커밋/push·전용 환경 정리다. 결과 문서와 정제된 작은 증거 요약도 최종 실제 근거로 채워야 한다. 전체 상태와 체크리스트는 미완료로 유지한다.

- 후속 부모 결정으로 정합성까지 확대한 generic packing은 채택하지 않고 효과 이력 4컬럼 fixed64 raw TEXT packing과 일보 Item/IoBatch 미사용 컬럼의 `load_only` 제외만 TDD로 제품에 반영했다. 임계값·응답·정합성 기준은 낮추지 않는다. c4 실제 복구 재시작은 보류했고 같은 frontend/Node/QA 산출물을 재사용하여 최신 코드의 c5를 재조립할 예정이다. c5 실제 복구 완료로 표시하지 않는다.

- 효과 이력의 독립 리뷰에서 기존 Core는 읽지만 CTE 부가 열 때문에 SQLite 길이 제한을 넘는 P2를 재현했다. `SQLITE_TOOBIG` exact code에만 원 Core fallback을 적용하고 다른 오류·기존 Core도 크기 초과인 오류는 전파하도록 보정했다. 실제 loader 경계 RED→GREEN 및 관련 25 PASS, 독립 메모리 재현의 동일 결과를 확인했다(`performance/effect-length-boundary-evidence/README.md`). 일보는 Item 4필드·IoBatch 4필드와 `raiseload=True`만 사용하며 신규 4개와 기존 39개, 총 43 PASS다(`performance/daily-slim-green.xml`). 후속 읽기 리뷰의 추가 blocker는 없다. packing은 transport chunk만 제한하고 전체 `fetched/raw_rows/restored` 메모리는 O(N)이다.

- `final-packing-diagnostic`은 길이 경계 수정 전 effect 소스의 30동시·30호출·1묶음이다. 10개 endpoint의 cold 전체 응답 hash와 DB hash가 같고 후속 호출의 성공 상태를 확인했지만 일보 2.43~3.37초로 여전히 상한 미달이다(`performance/final-packing-diagnostic/receipt.json`). 별도 ignored 일보 Core JOIN 후보는 cold 응답이 같아도 일보 3.71~6.12초로 이익을 입증하지 못해 미채택했다(`performance/daily-core.stdout.log`). 호스트 변동이 있는 단독 진단으로 회귀 인과를 단정하지 않는다.

- `final-packing-full-matrix`는 16:23:26~17:24:48 KST 당시 runner의 모든 시나리오를 수행하고 종료했다(`performance/final-packing-full-matrix-exit.json`). 시작 snapshot의 effect `c5f02fbf…`와 daily `5f31694e…`는 보정 후 작업본과 일치하며 결과의 source 불변도 확인했다. 원본 프로세스 exit 0·complete_protocol/complete_matrix true·accepted/pass false는 보존한다. 그러나 complete_protocol은 CLI 인자만 검사한 당시 검증기 판정이며, 단독 4시나리오는 조회별 90개지만 혼합 6시나리오는 조회별 9개뿐이므로 사용자 표본 계약을 충족하지 못했다. 혼합도 각 조회·각 버전·각 동시도에서 준비 호출 후 30회씩 3묶음이 필요하다. 원장 NOT_RUN·전체 IN_PROGRESS를 유지하고 실행 종료를 충분한 표본 확보나 성능 통과로 바꾸지 않는다.

- 최신 준비 검사 `--check`·full plan·소스 대조는 exit 0이다(`final-packing-preparation-review.json`). 당시 계획 345 case·9그룹·1,058조건·2,183소스를 확인했고 신규 일보 성능 테스트도 snapshot에 포함했다. 이전 단일 조회 snapshot 대비 조건 fingerprint 변경 0, 모든 NOT_RUN·`globalPass=false`·`testsExecuted=false`다. 384경로의 whole 371개·공유 13개와 중간 blob 30개를 준비했으며 미배정·whole 중복·실제 index 변경은 없다. 실행·승격·strict 완료로 계산하지 않는다.

- 기존 matrix의 역사적 검증기 판정은 100개 중 83 PASS·17 FAIL이다(`performance/final-packing-full-matrix/report.json`, `comparisons.json`). HTTP successful·로그 모집단 검사는 참이지만 혼합의 통과는 조회별 9개 표본으로 계산됐으므로 사용자 계약에 맞는 성능 완료로 인정하지 않는다. 당시 단독 1사용자 40개와 혼합 1사용자 20개는 통과 판정이었고, 실복제 혼합 10/30의 작업 그룹 p95 9,639.6/8,759.3ms는 절대 상한을 넘으며 각각 다른 3경로는 상대 회귀였다. 합성 20k 혼합 10에서는 목록·검색·집중 품목·일보가 절대 상한, 일반 품목이 상대 회귀였고 혼합 30에서는 검색·일보가 절대 상한, 일반 품목·재고가 상대 회귀였다. 원본 숫자·FAIL을 보존하고 상세 표본 수와 한계는 결과 보고서에 명시했다. 신규 표본 계약 6조건 중 5개 실패로 배분·실제 묶음별 표본 수 검사 누락을 재현했으며(`performance/benchmark-sample-contract-red.xml`) 보정 후 충분한 표본 재수집은 대기다. c5 실제 공동복구, canonical 실행·승격·strict, 최종 HEAD CI도 계속 대기다.

- 표본 배분을 mixed에서도 각 endpoint `calls`회로 고치고 양 버전의 각 묶음 표본 수를 정확히 대조한 뒤 관련 전체 20개가 통과했다(`performance/benchmark-sample-contract-green.xml`). 후속 독립 읽기 검토에서 발견한 endpoint 빈 목록·공통 누락의 P1도 각 worker 반환 직후 요청/반환 집합 완전 일치를 검사해 `ValueError`로 차단하도록 해결했다. empty/missing/unexpected 신규 3개 RED 후 관련 전체 23 PASS·0 SKIP이다(`performance/benchmark-endpoint-set-red.xml`, `benchmark-endpoint-set-green.xml`). 앞선 20개·6개와 합산하지 않는다. 최종 읽기 검토에서 이 표본·목록 보정 범위의 추가 false PASS 차단 결함은 발견하지 못했으며 도구 국소 통과를 정식 성능 측정이나 최종 통과로 승격하지 않는다.

- 완료된 성능 실패에 대한 읽기 전용 조사에서는 전체 connected metadata의 임의 LIMIT를 변경하지 않았다. 페이지 외 batch의 IoBundle/IoLine 상세 enrichment 선조회와 여러 품목의 공통 최소 cutoff가 넓히는 요청순 12컬럼 suffix를 좁은 후속 분석 후보로 확인했다. 현재 SQL 원자료에는 구간별 시간·개별 SQL 행 수가 없어 주원인이나 개선 효과를 확정하지 않았으며, 제품·테스트·DB 변경 없이 기존 grouping·위치별 재고·legacy 취소 경계를 보존할 회귀 조건만 부모에게 전달했다.

- 후속 실제 구간 진단은 실복제 혼합 10사용자의 연결 메타데이터 6,093행 fetch 3.51~3.86초와 배치 라인 5,433행 fetch 1.36~1.81초를 확인했다(`performance/profile-real-mixed-phases-001/mixed-u10/phases.json`). 부모는 전체 연결 메타데이터를 유지하고 IoBundle/IoLine 상세만 페이지 선택 뒤 선택 배치 전체로 지연했다. 신규 3개 RED→관련 4파일 78 PASS·0 SKIP이며 독립 정적 검토에서 StockRequest NULL 우선순위·역전 메타·검색 형제·전체 배치 라인·기존 호출자의 기본값을 보존함을 확인했다(`performance/batch-page-detail-green.xml`).

- 수정 전후 1/10/30사용자 각각 70개, 총 210개 전체 응답 hash가 같고 각 실행의 DB/소스 hash도 불변이다(`performance/page-detail-response-equivalence.json`, `profile-real-page-detail-001/summary.json`). 배치 라인 5,433→245행·전체 조회 15,887→10,699행으로 감소했지만 작업 그룹은 1사용자 0.55~0.61초/10사용자 6.35~6.84초/30사용자 6.95~7.08초로 동시 조건의 2초 상한은 미충족이다. 후속 10사용자의 메타데이터 fetch도 3.52~3.85초로 남으며 GIL/OS/SQLite 원인은 미분리다. 단독 진단을 공식 전체 matrix PASS로 바꾸지 않고 요청순 suffix 후보도 아직 제품에 편입하지 않았다. 원장 NOT_RUN·전체 IN_PROGRESS와 남은 완료 조건을 유지한다.

- 그룹 상세 Item 읽기 폭을 이름·코드·공정·단위와 ORM PK로 제한했다. 동일 변환기를 쓰는 일보의 `load_only(..., raiseload=True)` 패턴이며 기존 거래 열·JOIN·필터는 유지한다. 과거/현재 표시 × 활성/소프트 삭제의 신규 4개 RED→관련 4파일 82 PASS·0 SKIP 후, 과거 PF/현재 TR 공정 값 단언을 추가한 같은 4조합도 별도로 4 PASS다(`performance/group-detail-width-red.xml`, `group-detail-width-green.xml`, `group-detail-width-fields-green.xml`). 중복 합산하지 않으며 이 변경만의 성능 효과는 분리하지 않았으므로 지연 해결로 기록하지 않는다.

- 메타데이터 packing과 19필드 투영·선택 후 map 후보는 ignored 실험으로 제품 미반영이다. 일반 자료의 전체 응답 동등성은 확인했지만 30사용자에서 각각 약 5.00~5.09초와 packing 병행 3.58~3.60초로 2초 기준을 충족하지 못했다(`performance/group-metadata-packing-prototype/README.md`, `group-projection-prototype/README.md`). `MATERIALIZED`로 scalar 반복 평가를 줄인다는 가설도 130행 실제 UNION 형태의 Core/B/MATERIALIZED counter가 모두 130회여서 채택 근거가 없다(`group-projection-prototype/evaluation-counter-result.json`, `evaluation-correlated-counter-result.json`). 메모리 counter를 실자료 성능 근거로 확대하지 않으며 전체 IN_PROGRESS·성능 FAIL과 원장 NOT_RUN을 유지한다.

- 제출 묶음 최적화의 관련 3파일은 85 PASS·0 SKIP이고, 검색 없는 제출 내부 lifecycle의 전체 페이지 oracle 비교는 별도 실행으로 1 PASS·0 SKIP이다(`performance/submission-envelope-tdd.xml`, `submission-lifecycle-boundary-verified.xml`). 후자는 불량 짝 보존·페이지/커서/has_more 동등·metadata 최대 4행을 단언한다. 앞선 `submission-lifecycle-boundary-green.xml`은 helper가 지원하지 않는 fixture 인자의 TypeError이며 제품 RED로 기록하지 않는다.

- `performance/submission-http-oracle-002/receipt.json`은 실복제 20개·합성 20,000 자료 20개, 총 40개 전체 HTTP 응답 hash 동등을 확인했다. 실복제 그룹 metadata 6,093→1,306행·전체 조회 10,699→3,158행으로 줄었고 쿼리 16개·응답 548,975 bytes는 동일하다. 소스 185파일·각 DB hash 불변이며 `performance_acceptance=false`로 성능 통과 근거는 아니다.

- **전체 페이지 oracle 001은 INVALID/INCOMPLETE이며 제품 FAIL로 판정하지 않는다.** `performance/submission-all-pages-oracle-001/`의 실복제 수집 결과는 양쪽 33페이지·1,627그룹·6,095로그와 페이지 본문이 같다. 합성은 기준 254페이지·12,700그룹, 현재 233페이지·11,650그룹에서 각각 부분 중단됐고 공통 앞 233페이지 본문은 같다. 전체 순회를 worker 바깥 120초 제한으로 감싼 데다 oracle이 cold status 0·bytes 0과 완료 여부를 검증하지 않아 부분 결과를 기록한 원인을 확인했다. 경계 index 232·233의 별도 GET은 양쪽 모두 50그룹·metadata 52행·has_more true, 다음 커서·전체 본문 동일이다(`performance/submission-boundary-repro-previous-001/receipt.json`, `submission-boundary-repro-current-001/receipt.json`). 각 페이지 120초를 유지하고 ignored oracle 전체 순회 제한만 분리·완료 단언을 추가했다. canonical 성능 timeout은 불변이며 001 무효 원본은 보존한다.

- 후속 `performance/submission-all-pages-oracle-002/receipt.json`은 실복제 33페이지·1,627그룹·6,095로그, 합성 400페이지·20,000그룹·20,000로그의 양쪽 전체 순회 `complete=true`를 기록했다. 추가 cold 응답을 포함한 실복제 34개·합성 401개, 총 435개 전체 본문이 같고 앱 소스 185파일·각 DB hash는 불변이다. 이는 435페이지라는 뜻이 아니며 `diagnostic_only=true`, `performance_acceptance=false`인 응답 동등성 근거다. 정식 성능 재측정·최종 통합 완료·원장 승격은 남아 있고 전체 IN_PROGRESS·성능 FAIL·원장 NOT_RUN을 유지한다.

- `performance/submission-diagnostic-001/report.json`은 실복제·합성 20,000 자료의 mixed 1/10/30사용자에서 각 endpoint 3회·1묶음만 수집한 진단이다. source 불변이며 complete_protocol/complete_matrix/pass는 모두 false다. 실복제 작업 그룹은 1사용자 725.1→407.3ms, 10사용자 8,466.0→3,259.0ms, 30사용자 8,520.6→3,531.2ms였고 동시 조건의 2초 상한을 넘었다. 합성 10사용자의 검색 2,360.9ms·일보 3,049.3ms와 30사용자 일보 3,925.2ms도 상한 초과다. 실복제 10의 검색/집중 품목/재고, 30의 일반 품목/재고/작업 상세와 합성 10/30의 일반 품목/재고에는 상대 회귀 조건도 관측됐다. 세 표본의 p95는 최댓값이며 정식 30×3 성능 판정을 대신하지 않는다. 전체 실패 경로는 결과 보고서에 연결했고 새 성능 PASS·전체 완료로 승격하지 않는다.

- 후속 ignored `submission-metadata-pack-001`은 **NO ADOPTION**이다. 1/10/30사용자의 총 210개 전체 응답이 이전 고정 참조와 같고 소스·DB도 불변이며 metadata 논리 1,306행을 물리 21행으로 운반했다. 그러나 30사용자 HTTP wall은 3.29~3.31초로 2초 상한 미달이고 endpoint당 3회·1묶음·고정 참조 비교라 정식 성능 근거가 아니다(`performance/submission-metadata-pack-001/comparison-summary.json`). 제품에는 반영하지 않았다.

- `performance/submission-warm-cprofile-001/`은 cold 1회·준비 1회 뒤 단독 warm 요청 1회만 profile했다. profiled 요청의 HTTP wall 572.6ms·endpoint wall 554.6ms·thread CPU 546.9ms와 SQL execute 약 220ms·그룹 계산 약 118ms는 profiler가 포함된 별도 진단이다. cold 또는 동시 요청 결과와 합산하지 않고 중첩 phase 시간을 더하지 않는다. 소스/DB 불변·formal_acceptance_evidence false를 확인했으며 성능 완료 근거로 사용하지 않는다.

- SQLite 역거래 존재 검사는 실제 TEXT PK만 CAST로 역참조 인덱스를 사용하고 숫자·REAL·BLOB·NULL은 원래 EXISTS 비교를 유지하도록 제품에 반영했다. 동일 품목 조건과 PostgreSQL 기존 경로도 보존한다. 독립 읽기 검토에서 추가 차단 결함은 발견하지 못했으며, NUMERIC PK의 숫자 별도 표기·역거래 없는 원건·기존 취소 집계 동등성 및 SEARCH 검사를 포함한 최종 `performance/reversal-affinity-contract-green.xml`은 73 PASS·0 SKIP·native exit 0이다. 최초 `reversal-affinity-red.xml`은 fixture 인자 오류이므로 제품 RED가 아니며, 실제 인덱스 단언 실패의 `reversal-affinity-contract-red.xml`과 실패 1건이 남은 `reversal-affinity-green.xml`을 모두 원문 보존한다.

- `performance/reversal-affinity-http-001/receipt.json`은 native exit 0, 실복제/합성 각 20개씩 총 40개 전체 HTTP 본문 동등·앱 185소스/각 DB hash 불변을 확인했다. `performance/sql-execution-probe-003/queries.json`의 읽기 전용 SQL 쌍은 전체 16행이 같고, 세 SQL 쌍의 각 5회 측정 중앙값이 65.3~75.0ms에서 3.9~5.6ms로 감소했다. 이는 개별 표본 전체 범위나 HTTP p95가 아니며 해당 영수증의 DB 불변도 확인했다. PostgreSQL 실제 실행과 변경 후 mixed 성능은 아직 미확인이다. 국소 응답/SQL 진단을 2초 상한 충족 또는 전체 성능 PASS로 확대하지 않고 성능 FAIL·전체 IN_PROGRESS·원장 NOT_RUN을 유지한다.

- 불량 연결의 60초 초과 탐색 중단은 안정 정렬·used 제외·최초 일치·60초 포함을 유지하도록 제품에 반영했다. `performance/defect-window-contract-red.xml`의 45,449 matcher 호출→허용 906회 단언 실패 후 관련 4파일 `defect-window-contract-green.xml` 124 PASS·0 SKIP·native exit 0이며 `datetime.max` 경계도 포함한다. 정상 nullable 문자열·날짜 입력의 독립 읽기 검토에서 추가 차단 결함은 발견하지 못했다. 주석·타입 보완 뒤 `defect-window-annotations-green.xml` 2 PASS는 같은 검사 재실행이며 124개와 합산하지 않는다. 기존 역거래 서비스 73개 근거도 재사용하며 `reversal-affinity-annotations-green.xml`의 동일 경계 1 PASS를 더해 새 74개 전체 실행으로 기록하지 않는다.

- `recovery/defect-window-probe-002/receipt.json`과 `defect-window-job-002/exit.json`은 native exit 0인 ignored 그룹 진단이다. 합성 500자료+15경계를 4가지 옵션으로 비교한 2,060회 전체 그룹 비교와 실제 cold 6,093행/warm 1,306행 두 호출의 세 그룹 결과가 같고 소스/DB hash는 불변이다. 실제 warm 1,306행 함수의 ABBA 5묶음 중앙값은 41.665→4.835ms, 별도 matcher 호출 수는 113,343→1,832회다. 2,060을 그룹 수나 pytest 수로 합산하지 않는다. suffix 슬라이스와 조밀한 시간 구간 탐색이 남아 전체 O(N)은 보장하지 않으며, 60초 밖 정수 actor의 이전 `AttributeError`가 생략되는 정상 `Optional[str]` 도메인 밖 차이를 명시한다. 복구 경로에 저장됐어도 실제 복구 근거가 아니다. 이 진단 당시 남아 있던 metadata helper 보완·소스 고정의 후속 근거는 아래에 구분하며 성능 FAIL·전체 IN_PROGRESS·원장 NOT_RUN을 유지한다.

- `_bounded_submission_metadata`의 MATERIALIZED source·GROUP MAX 84자 anchor 보완을 마치고 `transactions.py` SHA `f1493c52…`로 제품 소스를 고정했다. 기존 unsafe 전체 반환·NULL/lifecycle 보존·외부 3키 정렬·단일 UNION·SQLite 제한/TOOBIG fallback과 PG 원문 경로를 확인했으며 독립 읽기 검토에서 추가 차단 결함은 발견하지 못했다. 동률 lifecycle/UUID 별도 표기의 공개 metadata 값·타입·순서 회귀까지 포함한 `performance/submission-groupmax-tdd/final-related.xml`은 95 PASS·0 SKIP·native exit 0이다. `completion.json`의 Ruff/diff exit 0도 확인했다. 기존 124개·73개와 합산하지 않고, 잘못 추정한 파일명의 수집 실패 로그를 제품 RED로 기록하지 않는다. PG fallback/컴파일만 검사했으며 실제 PG 통과는 아니다.

- 세 변경(역거래 affinity·불량 60초 탐색·GROUP MAX)을 함께 이전 snapshot과 비교한 `performance/final-read-http-001/receipt.json`은 native exit 0, 실복제/합성 각 20개씩 총 40개 전체 HTTP 본문 동등·앱 185소스/읽기 전용 복제 DB hash 불변이다. `diagnostic_only=true`, `performance_acceptance=false`이며 앞선 40개 실행과 중복 합산하지 않는다. 후속 전체 순회·동시 구간 진단은 아래 별도 근거로 구분한다.

- `performance/final-read-all-pages-http-001/receipt.json`은 native exit 0, 실복제 33페이지·1,627그룹·6,095로그와 합성 400페이지·20,000그룹·20,000로그의 전체 순회 `complete=true`를 기록했다. 추가 cold를 포함한 실복제 34개·합성 401개, 총 435개 전체 본문이 정확히 같고 앱 185소스/각 DB hash도 불변이다. 435개를 페이지 수로 쓰거나 앞선 40개·과거 전체 순회와 합산하지 않는다. 응답 보존 진단이며 `performance_acceptance=false`다.

- `performance/final-read-real-phases-001/summary.json`의 실복제 1/10/30사용자는 각각 timed GET 30회, 총 90회가 모두 HTTP 200이고 DB/소스 불변이다. 각 조회는 세 표본뿐인 단계별 진단으로 `formal_acceptance_evidence=false`다. 30사용자 작업 그룹은 3,636.4·3,626.8·3,544.3ms로 2초 상한 FAIL이며 조회별 30회×3묶음의 정식 p95 검증을 충족하지 않는다. 별도 standalone cProfile 1회는 이 90회에 합산하지 않는다. 정합성 cold 599-query 분석은 개선 후보 검토로만 기록하며 검증 완료로 바꾸지 않는다. 새 화면 검사·최종 backend·canonical full 9그룹·실제 복구·커밋·push·최종 HEAD CI 미완료와 성능 FAIL·전체 IN_PROGRESS·원장 NOT_RUN을 유지한다.

- `performance/current-metadata-pack-paired-001/paired-001/receipt.json`의 현재 소스 기준 AB/BA 두 비교는 각각 전체 응답 70개 동등·native exit 0·앱 185소스/DB hash 불변이다. 작은 입력과 실제 metadata의 16개 값·타입·순서도 같지만 30사용자 후보 작업 그룹은 2.88~3.13초로 2초 상한을 넘었으므로 **NO ADOPTION**으로 결정했다. 원문 3.22~3.37초 대비 관측 개선은 조회별 세 표본의 진단이며 `formal_acceptance_evidence=false`다. 제품에 반영하거나 정식 성능 PASS로 승격하지 않는다.

- 후속 정합성 PK 일괄조회는 `recovery/integrity-pk-bulk-001/green.xml`과 `verification-summary.json`에서 123 PASS·0 SKIP·native exit 0이다. snapshot 필요 열 읽기의 `performance/integrity-snapshot-width-tdd-001/related.xml`과 `completion.json`은 144 PASS·0 SKIP·native exit 0이며 최종 `inventory_integrity.py` SHA는 `a3fa75e3…`다. 제품에 반영한 두 변경의 관련 검사 수를 중복 합산하지 않는다.

- `performance/integrity-bulk-width-http-002/receipt.json`은 실복제/합성 각 20개씩 총 40 whole-body 동등·앱 185소스/DB 불변이다. 정합성 cold 쿼리는 실복제 599→226/18,153행 동일, 합성 29→29/20,203행 동일이다. 같은 폴더의 `native-observation.json`은 직접 도구 종료 native exit 0의 관찰 사본이며 detached 영수증이 아니다. 앞선 `integrity-bulk-width-http-001/native-observation.json`은 마지막 상대경로 영수증 기록 오류의 native exit 1·완료 영수증 부재로 미통과 보존한다. -002만 응답 동등성의 유효 근거이며 `performance_acceptance=false`다.

- `performance/integrity-bulk-width-real-phases-001/summary.json`의 추가 phase 계측 진단은 1/10/30사용자 timed HTTP 총 90회가 모두 200이고 DB/소스 불변이다. u30의 조회별 세 표본에서 그룹 3.87~4.16초는 2초를 초과하고 정합성 5.95~6.93초는 별도 10초 상한 안이다. unpaired 실행이므로 이번 변경이 지연을 늘렸다고 단정하지 않으며 정식 p95/상대회귀 PASS·FAIL 판정을 대신하지 않는다. AB/BA 비교 준비와 원래 canonical benchmark의 최종 재판정은 대기 중이다. 현재 완료 조건 미충족과 전체 IN_PROGRESS·원장 NOT_RUN을 유지한다.

- 후속 `performance/integrity-paired-current-001/paired-001/comparison-summary.json`은 AB/BA 전체 140본문 동등·driver/네 child native exit 0·소스/DB 불변이다. 같은 18,153행을 유지하며 쿼리 599→226, endpoint thread CPU 중앙값 1,687.50→1,390.62ms와 HTTP wall 중앙값 5,671.50→5,032.58ms를 관측했다. 앞선 unpaired 실행과 구분하고 `formal_acceptance_evidence=false`인 국소 개선 진단으로만 기록한다.

- `performance/integrity-width-canonical-diagnostic-001/report.json`과 `integrity-width-canonical-diagnostic-001-exit.json`은 native exit 0이지만 조회별 3회×1묶음이라 protocol/matrix/accepted가 모두 false다. 측정 60조건 중 12개 미달(절대상한 4·상대회귀 8)이다. 절대상한은 실복제 u10/u30 groups와 합성 20,000 u10/u30 daily, 상대회귀는 실복제 u1 daily·u10 search/hot·u30 search/general/operation-detail 및 합성 u30 general/inventory다. 실복제 u30 그룹 main 9,015.5→현재 2,933.7ms와 합성 u30 일보 30,566.0→3,717.5ms는 2초 초과이며, 실복제 u30 정합성 11,169.7→4,915.0ms는 10초 안이다. 모두 세 표본의 진단값이며 정식 p95 판정이 아니다. `a3fa75e3…` 입력·앱 185소스와 12개 worker DB 불변, HTTP 성공/표본 수/적용 대상 응답·모집단 조건을 확인했지만 성능 검증은 미완료다. 원장 NOT_RUN·체크리스트 2완료/7미완료를 유지한다.

- `.github/workflows/ci.yml`에 기존 PostgreSQL 5개 이후 PG16 바이너리/비 root 검사, `DEXCOWIN_POSTGRES_TEST_ACK=ALLOW_TEST_DB_MUTATION`, 격리 DB의 명시 Alembic head와 cutover 대상 테이블 준비, 추가 PostgreSQL 계약 53개/도구 단위 7개 실행을 적용했다. 2026-10-09 실제 collect-only에서 backup manifest 파일 35개를 확인해 오래된 34개 비교값을 수정했다. 기존/추가 JUnit과 native 종료 코드·클래스별 수집 수·SKIP 거부 영수증을 보존한다. 실제 PostgreSQL CI는 미실행이고 별도 실제 Windows 공동복구·최종 HEAD CI도 미완료다.

- 복구 crash harness는 신규 9개 RED 뒤 관련 19 PASS·0 SKIP이고(`recovery/crash-audit-summary.json`), ignored wrapper 입력 연결도 별도 9 PASS다(`recovery/wrapper-binding-summary.json`). raw 증거/manifest 원문 해시·이전 복구 영수증·코드/프론트/Node/설정 연결을 검사한 국소 회귀이며 19와 9를 합산하거나 실제 복구 완료로 바꾸지 않는다. actual_recovery_executed/actual_wrapper_executed false, c5 미조립·실행 대기이고 실제 failure-resume·hard-exit·normal은 모두 NOT_RUN이다.

- 최신 프론트 340파일·3,790 PASS와 lint·타입·커버리지 native exit 0 및 입력 938소스 불변은 위 범위에서 재확인했다. 성능 acceptance는 여전히 FAIL이며 최종 backend 전체·canonical full 9그룹·실제 세 복구·기능별 커밋·push·최종 HEAD CI는 미완료다. 체크리스트 2완료·7미완료와 전체 IN_PROGRESS를 유지한다.

위 2026-10-08 최종 진행의 후속 근거:

- 일보의 `_batch_name_map(..., include_line_details=False)` 한 곳만 바꿔 미소비 IoBundle/IoLine 표시 유형 SQL 1회→0회를 확인했다. 실제 전체 본문 2건과 요청자·승인자·두 시각·history_batch·로그·수량을 유지하며 RED 2개 뒤 GREEN 2개·관련 20 PASS·0 SKIP, Ruff/diff/native exit 0이다. [영수증](../../runtime/closure/performance/daily-line-detail-tdd-001/completion.json), 소스 SHA `ce35c3c4…`. 성능 통과로 계산하지 않는다.
- envelope kind 조건 한 곳을 COALESCE로 바꿨다. 기존 guard·CTE·cursor·limit·fallback과 typed 전체 1,306행×16필드 값·타입·순서를 유지하며 중복 평가 비용 계약 RED→GREEN 1개·관련 95 PASS·0 SKIP 및 정적 검사/native exit 0이다. [TDD](../../runtime/closure/performance/envelope-kind-coalesce-tdd-001/green-receipt.json), [실복제 전체 typed 대조](../../runtime/closure/performance/envelope-kind-coalesce-tdd-001/actual-typed-receipt.json). `transactions.py` SHA `f1493c52…`→`8d08fe43…`, app185/RO DB 불변이다. [교대 SQL 진단](../../runtime/closure/performance/envelope-kind-coalesce-001/receipt.json)의 약 6ms 개선은 2초 상한 통과 근거가 아니다.
- 독립 실복제 0038→0044 DB 보존은 [receipt](../../runtime/closure/recovery/db-preservation-0044-001/receipt.json)의 `REAL_0038_TO_0044_DB_PRESERVATION_ONLY` 범위에서 PASS, [종료 native exit 0](../../runtime/closure/recovery/db-preservation-0044-001/exit.json)이다. 기존 전체 행·컬럼은 승인된 employees.level 제거만 제외하고 동일하며 테이블 면제는 없다. [0040 main 대조](../../runtime/closure/recovery/db-preservation-0044-001/0040-main-equivalence.json)의 기존 submission/reason backfill을 신규 백필로 취급하지 않는다. 0041~0043 nullable 값 NULL과 main의 suppliers.scope warehouse 추가를 구분했다. 원본/baseline DB와 migration/model 소스는 불변이며 실제 paired artifact restore는 미실행이다. 최종 코드·프론트·Node 공동복구 완료로 승격하지 않는다.
- UUID 공유 객체 캐시는 기존 객체별 독립성 변경, 정수 캐시 후 UUID 새 생성은 같은 실제 입력 replay의 모든 비교에서 지연 증가로 각각 NO-GO·미채택이다. [공유 경계](../../runtime/closure/performance/uuid-cache-prototype/replay-receipt.json), [정수 replay](../../runtime/closure/performance/uuid-cache-prototype/int-cache-replay-receipt.json), [native 종료 0](../../runtime/closure/performance/uuid-cache-prototype/native-observation.json). nested JSON도 NUL 접미 원문의 기존 JSONDecodeError를 SQLite가 숨기는 반례로 NO-GO이며 raw processor·오류 경로를 유지했다. [결과](../../runtime/closure/performance/nested-json-nogo-001/result.json), [종료 native 0](../../runtime/closure/performance/nested-json-nogo-001/exit.json). 제품 미채택 상태로 추가 실험을 종료했다.
- 모든 제품을 현재 동결했다. SHA는 transactions `8d08fe43…`, daily `ce35c3c4…`, integrity `a3fa75e3…`, effect history `c5f02fbf…`, UUID base `d6981f3e…`이며 [고정 입력 manifest](../../runtime/closure/performance/final-coalesce-formal-001/source-hashes.json)를 사용한다. 부모의 정식 30회×3묶음 성능 실행이 진행 중이고, 이 기록에서 완료 확인한 [부분 비교](../../runtime/closure/performance/final-coalesce-formal-001/comparisons.json)는 실복제·합성 1,000·5,000 endpoint/users=1의 세 scenario·조회/버전별 90표본이다. 성능 전체·새 전체검사·실제 공동복구·커밋·CI는 미완료이며 원장 NOT_RUN·체크리스트 2완료/7미완료·전체 IN_PROGRESS를 유지한다. 기능 커밋 개수는 고정하지 않으며 최종 HEAD CI 성공 뒤 활성 TODO 갱신으로 별도 문서 커밋이 필요할 수 있다.

## 진행 근거 — 2026-10-07

아래는 각 실행 당시의 진단 이력이다. 당시의 승인 대기·실패·미완료 기록은 보존하며 현재 완료 여부는 위 체크리스트와 최종 실행 근거를 따른다.

- 정상 복귀 화면의 history 처리는 전용 환경에서 PC·모바일 × B급·구형 × 부분·전량의 8개 Playwright 흐름을 통과했다. 뒤로/앞으로 이동, 원건 잔량·창고 수량, 중복 거래 차단을 확인했다. 원본 `mes.db` 불변과 전용 환경 정리를 확인했다.
- 브라우저 검증 중 창고 격리품 정상 복귀가 출고 가능한 `warehouse_qty` 대신 창고의 `PRODUCTION` 위치로 들어가던 결함을 발견했다. 창고 출처만 원래 창고량으로 복귀하도록 수정했다. 관련 백엔드 234개 및 보강한 최종 위치·취소·통계·실패 원복 검사 34개가 통과했다. 기존 데이터의 자동 이동은 수행하지 않았다.
- 위 브라우저 실행의 원본 JSON, 환경 식별, 성공 화면은 `_attic/runtime/closure/navigation-browser-pass/`에 보존했다. 병렬 구현 중의 진단 실행이므로 전체 원장 완료 근거로 승격하지 않았다. 최종 입력이 고정된 실행과 조건별 연결은 남아 있다.
- 실행 근거 도구는 실제 runner 결과, 수집한 전체 파라미터, 입력 파일 목록 변화, 조건별 근거, 성공 화면 SHA를 검증한다. 직원용 기대 문구와 기술 기대 분리 및 정규식 리터럴의 괄호·따옴표 처리 회귀를 포함해 도구 검사 49개가 통과했다(`evidence-tools-regex-green.log`). 최종 입력 고정 후 원장 실행과 CI 연결은 남아 있다.
- 공동복구의 강제 종료 후 resume 및 실패 복구 재진입 결함은 별도 프로세스 종료로 재현해 보완했다. 관련 검사 59개와 0038→0040→0038 격리 리허설이 통과했다. 리허설 프론트는 대체 파일이며 실제 서비스 시작·중지는 대체 함수로 검사했으므로 실제 배포 완료 근거로 사용하지 않는다. 0042와 실제 빌드를 포함한 최종 리허설은 남아 있다.
- 공통 인증·설정·알림의 원문/피드백과 기존 assertion을 대조했다. 서버의 타직원 설정 변경 차단·비활성 actor 확인·결재 알림 정리, 화면의 비활성 안내·미저장 입력 보호·focus 재검증·없는 경로 복구를 나누어 구현·검증 중이다.
- 내역의 실제 기간·복수 필터·요약 모집단, 추가 조회 실패·연속 클릭·재시도는 전용 브라우저에서 통과했다. 승인 실행자와 요청자가 다른 거래의 취소 권한 누락은 불변 작업 원장의 요청 연결로 보완했다. 정확한 원거래 ID 조회와 기존 취소·권한을 포함한 관련 백엔드 83개가 통과했다(`history-original-cancel-green.xml`).
- 브라우저 새 DB의 원장 활성 설정이 복제 DB와 달라 구 처리 경로가 실행됨을 확인했다. 전용 합성 시드 이후 명시적으로 원장을 활성화하고 시드 영수증에 시각을 기록하도록 보완했다. 원장 연결도 배치 연결도 없는 레거시 거래는 표시 문자열로 요청자 권한을 추정하지 않는다.
- 출하 재시도용 0041 마이그레이션이 기존 metadata DB·완료 revision 재실행에서 컬럼을 중복 추가하던 문제를 재현했다. 정확한 타입·길이·nullable·기본값의 기존 컬럼만 보존하며, 손상 스키마는 거부한다. 전체 마이그레이션 검사에서 실패가 없어졌으며 PostgreSQL 미설정 2건·구 revision 전용 실DB 검사 1건은 제외 상태다(`migrations-0041-green.xml`).
- 부서 표시명 0042는 기존 `name` 위치 키를 보존하고 nullable `display_name`만 native ADD한다. 모든 기존 테이블의 기존 컬럼 값, 직원 PIN·부서 연결, 테이블 재생성 없음, FK, 재실행·스키마 손상 거부를 검사했다. 0041과 합친 관련 마이그레이션 11개가 통과했다(`department-migration-green.xml`). 원본 개발·직원 DB에는 적용하지 않았다.
- 대시보드의 PA·PF 제외 기준을 숫자와 목록에 동일하게 적용하고 기준을 표시했다. 관련 Vitest 26개가 통과했으며 PC·모바일 새로고침 복원, 계정 간 격리, 404·권한·통신 실패 구분, KPI·목록 일치, 배경 조회 실패 중 목록 유지의 브라우저 5개가 통과했다. 삭제 브라우저의 잘못된 테스트 요청 경로는 수정 후 재실행 중이다(`inventory-report-browser-1.json`).
- 불량 격리·정상 복귀·재작업과 각 취소의 필터·묶음 건수·검색·추가 페이지를 검사했다. 상세의 작업명이 검색되지 않던 조건을 재현해 목록명과 상세 작업명 모두로 검색하도록 보완했다. 관련 백엔드 46개가 통과했다(`history-classification-green.xml`).
- 위 실행은 병렬 변경 중 진단 근거다. 원자 조건 연결 및 입력 해시가 고정된 최종 실행 전에는 전체 기대값 PASS로 표시하지 않는다.
- 실제 브라우저의 URL 반영이 popstate 처리보다 앞서는 출하 초안 이탈을 재현하고 표식 의존을 제거했다. PC 단위 171개와 출하 Back 브라우저가 통과했다. 입출고 Back은 SPA 진입·머무르기 후 실제 이력 깊이를 검사해 반복 이탈까지 통과했다(`back-history-browser-7.json`, `closure-new-flows-browser-8.json`).
- 재작업·폐기의 불량 증감이 목록에서 `변동 없음`으로 표시되던 결함을 브라우저와 단위 테스트로 재현했다. 두 거래 유형의 불량 증감을 포함하도록 보완한 관련 화면 검사 153개가 통과했다(`history-defect-stock-green.log`).
- 반복 조건을 검증할 때 파일을 다시 읽으며 근거 스냅샷이 섞일 수 있는 문제를 재현했다. 한 검사 내 소스·선언 분석을 재사용하고 다음 검사는 새 소스를 읽도록 보완했다. 근거 도구 검사 50개가 통과했다(`evidence-source-snapshot-green.log`).
- 주간보고에서 PF 픽업만 있는 주의 모델 표가 숨겨지는 기존 표시 조건을 확인했다. 동결된 화면이므로 수정 승인을 요청했으며 아직 변경하지 않았다. BOM 부족 정책과 기존 주간 안내·분류 결정도 회신 대기다.
- 새 404 복구 진입점이 양 Shell을 별도로 가져와 번들이 중복되는 원인을 격리 A/B 빌드로 확인했다. 같은 MesPage 진입점을 공유하는 수정은 격리 빌드 2.974MB로 승인 예산 3.00MB를 통과했고, 기존 404·viewport 단위 14개 및 ROUTE01 실제 브라우저도 통과했다. 최종 입력 고정 후 실제 빌드와 공동복구 리허설은 남아 있다.
- 내역 탭을 왕복할 때 검색어가 초기화되고 전체 로딩 덮개가 다시 나타나는 현상을 수정했다. 같은 직원의 검색·조회키를 복원하고 다른 직원에게 노출하지 않으며, 방문한 내역 탭은 바로 렌더한다. 관련 단위 79개와 실제 격리품→대시보드→내역 왕복이 통과했다(`history-cache-combined-green.log`, `closure-new-flows-browser-11.json`).
- 복원된 재작업의 정상·불량·폐기 결과 행을 각각 작업으로 세던 집계를 재현했다. 알려진 레거시 재작업 참조를 한 작업으로 묶고 취소는 별도로 센다. 내역·취소 및 전체 요약 관련 검사 50개가 통과했다(`history-rework-count-green.log`, `history-summary-green.log`).
- 관리자 모델 변경의 두 탭 온라인 복귀와 구매 기준 실패·재시도, 원본 CSV·Excel의 열·ID·한글·인증, 정합성 진단 전건 목록, 단말 감사와 오래된 단말 복구를 실제 브라우저에서 확인했다. 한국 시간 자정 경계의 내보내기 파일 검증도 통과했다. 해당 부분 실행 근거는 `closure-new-flows-browser-9/10/11.json`에 보존한다.
- 일반 직원의 창고·부서 격리 및 즉시 폐기, 정상 복귀 중 중복 입력 차단, 독립 입출고 역할 조합, 삭제된 품목의 기존 내역 보존, 대시보드 복합 필터·추가 조회, 빠른 작업 권한·품목·방향·부족 수량 차단이 부분 브라우저 실행에서 통과했다. 실패가 남은 흐름은 개별 수정·재검증 중이며 전체 PASS는 아니다.
- 기존 확정 결정의 조건이 새 검증 연결에서 빠지지 않도록 원자 조건 ID를 대조 중이다. 부분적으로만 검증한 조건은 미검증 부분을 별도로 남기며, 새 연결만으로 과거 기대나 현재 실행 상태를 덮어쓰지 않는다.
- BOM 전체 구성 저장은 전행 검증·동일 기준 버전 충돌·감사 원자성을 검증하고, 두 탭 충돌·완료 잠금·해제 실패 재시도·부서별 모집단·사용처를 실제 브라우저에서 통과했다(`closure-new-flows-browser-18.json`). 독립 리뷰에서 A의 변경 취소 응답이 B의 편집을 덮는 경합을 재현해 요청 당시 초안과 품목이 같은 경우만 반영하도록 수정했다. 관련 컴포넌트 51개가 통과했다(`bom-discard-race-green.log`).
- 품목 코드의 실제 모델·분류 미리보기와 저장값 일치, 조회 실패 입력 보존, 두 폼의 동시 생성 충돌 후 재미리보기·재시도가 브라우저에서 통과했다. 불량 통계의 세 최초 분류·카드·실제 차트·순위·필터·기간 유지 및 분류 변경·부분/전량 복귀 후 발생량 불변도 통과했다(`closure-new-flows-browser-20.json`).
- BOM 변경 전후 출하 요청이 각자의 구성을 보존하는 UI와 실제 준비·픽업·취소가 통과했다(`closure-new-flows-browser-19.json`). 주 마감 이후 취소를 F705가 과거 실적에서 제거하는 차이는 단일 연간 조회에 발생 주 마감 기준을 적용해 보완했으며, 주간보고 제품 코드는 변경하지 않았다.
- 마지막 AS·연구 승인자 해제 시의 알림 읽음 기록·실행 차단은 관련 자동 검사로 보강했다. 브라우저 첫 실행은 setup에서 요청 ID가 null인 테스트 준비 오류로 실패했고 수정 중이다(`closure-new-flows-browser-21.json`). 다른 시나리오의 미결 요청에 영향을 주지 않도록 실행기가 별도 fresh 시드를 사용하게 했다. 원장 도구 51개가 통과했다(`runner-asr-isolation-green.log`).
- 검토한 조건과 미검증 부분을 원장에 통합했으며, 연결 현황은 정규화 도구와 `reviewed-integration-audit.json`에서 계산한다. 현재 실행 상태는 아직 NOT_RUN으로 유지한다. 생성된 `-unverified` 조건을 다음 후보 생성의 정책 입력으로 재사용해 분모가 증식하지 않도록 최초 결정 스냅샷을 사용한다.
- 마지막 AS·연구 승인자 해제 브라우저의 준비 오류를 수정한 뒤, 기존 알림의 읽음 기록·실행 차단, 부서 승인으로 전환된 새 요청, 역할 재부여와 완료 요청 보존이 통과했다(`closure-new-flows-browser-24.json`).
- 거래 당시 품목 표시값 보존을 위한 nullable JSON 컬럼 0043은 새 거래부터 기록하고 기존 행은 NULL로 남긴다. 전체 마이그레이션 검사 199개가 통과했고 PostgreSQL 환경 미설정 등 3개는 건너뛰었다(`migrations-0043-green.xml`). 실제 원본 DB에는 적용하지 않았다.
- 관리자 등급 제거 UI·당시 품목명과 현재 연결·퇴사 직원의 완료 내역·부서 삭제 제한 4흐름이 통과했다(`closure-new-flows-browser-23.json`). 입출고 복합 역할 4흐름과 전체 품목 모집단·복합 필터·요청 수정/재제출/취소·오래된 초안 재고 재검증 3흐름도 통과했다(`closure-new-flows-browser-25.json`).
- 브라우저 회귀 스킬에 전체 기대값 실행·검증 결과 승격 명령과 기능별 재검증 흐름을 추가했다. 독립 검토자가 기존 문서에서 찾지 못했던 명령·흐름을 수정 후 찾을 수 있음을 확인했다. 이는 문서 검색 가능성 검증이며 제품 실행 PASS로 세지 않는다.

## 진행 근거 — 2026-10-08

- 0042 실제 빌드의 공동복구 진단은 DB 설치 직후 별도 프로세스 강제 종료, receipt SHA를 지정한 재개, 옛 DB·코드·Node·프론트 정확 복원과 실패 자료 보존을 통과했다(`recovery/0038-0042-0038-real-build-resume-diagnostic.json`). 복구 검증 중 경쟁 쓰기도 차단했다. 이후 수정된 긴 경로 처리·SQLite 조회 연결 종료와 0043을 포함한 최종 리허설은 소스 고정 후 수행한다.
- 관리자 모델 연결·업체 관리·품목 플래그 ON/OFF, 개인 불량 목록 순서, 출하 PC·모바일의 전체 예약 취소 확인이 부분 브라우저 실행에서 통과했다(`closure-new-flows-browser-27.json`). 품목 플래그용 초기 부서 재고는 직접 삽입 대신 정식 생성 API를 사용하도록 보완하고 초기 거래 보존과 소비 수량을 재검증했다(`closure-new-flows-browser-29.json`).
- 인보이스 수정 작업자·한국 시간과 BOM 변경 전후 각 요청의 준비·픽업 화면 구성 수량이 통과했다(`closure-new-flows-browser-28.json`). 원본 요청·새 요청 및 과거 이력의 검증 조건은 기존 원자 ID에 직접 연결한다.
- 실제 사진의 목록 높이가 지정 크기와 다르게 계산되어 이미지 비율 경고가 발생함을 재현했다. 목록·상세의 고정 영역과 object-contain을 명시한 뒤 실제 사진 로드·크기·경고 없음이 통과했다(`closure-new-flows-browser-28/29.json`).
- 품목 전환의 전체 후보·자기 자신/원자재/삭제 제외·후반부 검색 선택·검색 초기화 후 선택행 표시·재고 없는 대상 허용·원본 변경 시 대상 초기화가 통과했다. 창고 정/부의 자동 승인과 일반 직원의 양방향 승인 대기도 실제 수량과 함께 통과했다(`closure-new-flows-browser-30.json`). 원자재 완료와 일부 내역·출하 추가 흐름의 실패는 계속 보완 중이다.
- 위 부분 실행은 최종 입력 고정 전의 진단 근거이며, 전체 원장 실행 상태를 PASS로 승격하지 않았다. 관리자·출하 등 병렬 수정으로 assertion 또는 소스 해시가 바뀌면 통합 도구가 해당 연결을 거부하는 것도 확인했다.
- 자재 출고의 초안·실제 제출·잘못된 PIN 거부·한 번 취소, 다른 직원의 열린 품목·부서 후보 갱신, 불량 이력의 전후 수량·처리자·사유·취소 연결, 재작업의 모든 배분 오류와 실제 위치 효과, 출하에서 생성한 PA/PF 구분이 통과했다(`closure-new-flows-browser-32.json`). 커스텀 BOM 입력창과 일부 제출 확인의 테스트 조작 오류는 결과를 보존하고 재검증한다.
- AS·연구 혼합 요청의 서버 판정 승인 경로·건수와 전용 승인자 없는 부서 결재 안내가 PC·모바일에서 통과했다(`closure-new-flows-browser-33.json`). 승인함의 오류·중복 결정 흐름은 준비 직원의 권한 부족으로 실패했으며, 해당 실패를 제품 통과로 세지 않는다.
- 검토 후보를 다시 통합하고 실제 assertion 문자열·선택자·소스 해시 검사가 오류 없이 통과했다(`reviewed-integration-audit.json`). 원본·후속 기대의 연결 현황은 이 보고서 및 정규화 결과에서 계산하며, 실행 상태는 계속 NOT_RUN이다. 현재 연결과 실제 실행 통과는 별도 지표다.
- 원자재 입고의 최종 확인·창고 즉시 완료·실제 수량·내역 숫자쌍과, 일반 직원 요청의 실제 PIN 승인 및 창고 결재권자의 낱개 자동 승인이 통과했다. 각 경우 다른 부서 재고는 보존했다(`closure-new-flows-browser-36.json`).
- 같은 사람의 부서 요청·자동 승인 역할을 합치면서 승인자 표기가 사라지는 조건을 재현했다. 이름은 한 번만 표시하면서 부서 작업에는 요청자·승인자 역할을 함께 남겼고, 원문에서 별도 표시를 요구하지 않는 창고 자가승인은 그대로 유지했다. 관련 104개 검사가 통과했다(`process-self-approval-label-red/green.log`). 최종 커스텀 BOM 브라우저 검증은 진행 중이다.
- AS·연구 중복 승인에서 완료·거절·다른 승인 대기 상태를 409 충돌로 거부하도록 보완했다. 관련 서버 검사와 실제 중복 요청의 안내·재고 불변·사라진 딥링크 강조 해제가 통과했다(`asr-duplicate-approval-related-green.xml`, `closure-new-flows-browser-38.json`).
- 직접 불량 등록의 최종 확인 취소·입력 유지·실제 정상/불량 수량·사유·메모·한국 시간과 출하 전체 초안 보존이 통과했다(`closure-new-flows-browser-37.json`). 같은 실행의 출하 후보 재선택과 수정 이력 실패는 별도로 보존하고 보완 중이다.
- 불량 일괄 처리 도중 두 원건의 실제 잔량이 바뀌는 경합에서 전체 오류와 추가 변경 없음이 통과했다(`closure-new-flows-browser-39.json`). 다른 신규 흐름은 준비 데이터 누락·응답 숫자 형식·화면 조작 오류 등을 확인 중이며 해당 실행 전체를 PASS로 기록하지 않는다. 실패 자료는 `browser39-failures/`에 보존했다.
- 커스텀 BOM의 일반 승인·자동 승인에서 실제 구성 전체의 재고 반영·참여자·상세 수량과 묶음 취소 원복이 통과했다(`closure-new-flows-browser-34/40.json`). 출하 최신 BOM 재조회·취소 정합성도 통과했으며, 삭제/분류 변경된 완제품 차단·기존 요청 수정의 새 근거는 `closure-new-flows-browser-42/44.json`에 보존했다.
- 불량 일괄·개별 처리 범위, 응답 유실 뒤 같은 요청 재시도, 반품 취소와 원건·과거 업체명 보존이 통과했다(`closure-new-flows-browser-41.json`). 품목 상세와 불량 작업의 실제 출처 재고 대조는 `closure-new-flows-browser-43.json`의 별도 흐름으로 검증했다.
- 재작업 상세의 실제 창고 전후 수량이 모두 같은 경우에만 창고 무변경을 표시하도록 했다. 누락·변화·모순 자료는 표시하지 않으며 정상 원재고 경로를 불량 재고로 오표기하지 않는다. 관련 검사 113개 및 실제 재작업 상세가 통과했다(`rework-warehouse-proof-red/green.log`, `closure-new-flows-browser-45.json`). 같은 실행에서 직접 폐기·복수 오류 차단·B급/구형 분류별 등록·품목 전환도 통과했으며 원자재 상세 메모의 선택자 오류는 별도로 보완한다.
- 불량 작업 중 다른 탭으로 Back한 뒤 머무르기를 선택하면 입력이 사라지는 결함을 재현하고 수정했다. 다른 탭 이탈은 공용 화면의 확인 처리에 맡기며 불량 내부 Back/Forward 동작은 보존했다. 관련 검사 44개와 실제 입력 보존·명시 이탈 흐름이 통과했다(`defect-draft-cross-tab-red.log`, `closure-new-flows-browser-46.json`). 46 실행의 다른 입고·일보·AS·연구 흐름은 진행 중이며 전체 통과로 기록하지 않는다.
- 원자재 후보 제한·부서 필터의 선택 보존, 실제 일보의 승인자·메모·동일 거래 수량, 세 공정의 자동 처리 부서, 입력 없는 사유/메모 분리, 두 위치의 실제 격리 경합 원자성, 창고 결재 역할별 양방향 복수 오류 차단이 통과했다(`closure-new-flows-browser-47.json`, 13 PASS). 같은 실행의 AS·연구 이력 및 전환 취소 상세 실패는 별도로 남겼다. 일보 조회의 승인자·시각 누락은 RED 4개 뒤 관련 34개 통과, AS·연구 특별 승인자의 이력 누락은 RED 2개 뒤 관련 58개 통과로 수정했다.
- 전환 취소의 대표 변경품과 나머지 구성품의 실제 이름·수량 부호, 품목 상세↔불량 선택 표의 출처 수량 대조가 통과했다(`closure-new-flows-browser-48.json`, 6 PASS). AS·연구 혼합 BOM의 제외 구성품 재입고가 전체 작업 대표로 잘못 표시되는 추가 결함과 수량 보조 표기의 부서 불일치를 확인해 보완 중이다.
- 후보 통합의 직접 assertion·선택자·소스 해시 검사가 통과했다(`reviewed-integration-current.log`). 미연결은 주간보고 동결 및 출하 부족 검사·신규 직원 관리자 메뉴 정책 결정과 연결되어 있으며, 최신 집계는 원장 `metrics`와 `reviewed-integration-audit.json`을 참조한다. 전체 실행 상태는 계속 NOT_RUN이다.
- 별도 검토자가 공동복구의 admission·해시·쓰기 차단·명시 재개와 마이그레이션 0041~0043 기존 정보 보존을 코드·관련 테스트로 대조했으며, 이번 diff의 재현 가능한 추가 문제를 발견하지 못했다. 실제 0043 빌드·기동 리허설 통과를 대신하는 근거는 아니다. API 계약 변경을 읽고 OpenAPI 기준 파일도 현재 스키마로 갱신했다.
- AS·연구 혼합 BOM 내역에서 내부 사용을 대표 행으로 선택하고, 각 재고 변화의 실제 부서를 표시하도록 보완했다. 관련 단위 114개와 실제 AS 두 위치·연구 BOM 혼합의 브라우저 3개가 통과했다(`closure-new-flows-browser-49.json`). 복제 원본 DB SHA 불변 및 전용 E2E 환경 정리를 확인했다. 이 부분 실행도 전체 원장 PASS로 승격하지 않았다.
- 백엔드 전체 검사는 3,467개 중 3,397 PASS·12 FAIL·58 SKIP이었다(`closure-backend-full.xml`). 미설정 PostgreSQL 및 구 revision 전용 조건의 SKIP은 실행 완료로 세지 않는다. 실패는 검증 도구의 외부 runtime 경로 유입 7개, 창고 격리품 반품 정책과 다른 기존 fixture 3개, 원거래·취소를 각각 보존하는 F704 계약 1개, 옛 복구 옵션을 요구하던 정적 검사 1개로 구분했다. 전체 통과로 보고하지 않고 관련 범위를 수정·재검사한다.
- 반품 fixture는 실제 창고 원건을 생성하도록 정렬했으며, 부서 불량 보존·반품·취소·전체 재고 원복을 검증한 관련 6개가 통과했다(`history-fixture-policy-related.xml`). F704는 원·역거래의 날짜·수량·당시 업체명과 실제 Excel 셀을 모두 검사한 관련 11개가 통과했다(`f704-supplier-pair-green.xml`, `f704-supplier-pair-legacy.xml`). 복구 정적 계약은 구조 백업→admission→마이그레이션 및 보존 실행기의 명시 공동복구 연결로 정렬했고 관련 12개가 통과했다(`recovery/structural-backup-contract-green.log`). 제품 정책이나 보호 조건을 낮추지 않았다.
- 프론트 전체 정적 검사와 타입 검사가 통과했다(`closure-frontend-lint.log`, `closure-frontend-typecheck-repeat.receipt.json`). 전체 Vitest·커버리지 검사는 진행 중이다. 동결 주간보고의 미승인 기대를 확인하는 기존 RED는 그대로 유지하며, 최종 빌드·원장 실행·0043 복구·커밋·푸시는 아직 완료하지 않았다.
- 검증 도구의 7개 실패는 앱 import에서 읽은 외부 `MES_RUNTIME_ROOT`가 가짜 저장소 테스트에도 전달되기 때문이었다. 외부 설정이 유입된 재현을 추가하고 가짜 저장소별 runtime을 분리했다. 해당 파일 전체 22개·Ruff가 통과했다(`runtime-isolation-red.log`, `runtime-isolation-green.xml`). 이로써 앞선 백엔드 전체 실행의 실패 12개는 모두 현재 관련 재검사에서 통과했으며, 전체 명령 자체를 다시 실행했다고 주장하지 않는다.
- 백엔드 최초 실패 목록과 현재 JUnit의 실제 성공 테스트 ID를 대조한 `closure-backend-failure-reconciliation.json`에서 12개 모두 재검사 성공을 확인했다. 전체 실행의 SKIP은 그대로 남으며, 관련 재검사를 전체 재실행으로 치환하지 않았다.
- 프론트 전체 Vitest는 336개 파일·3,703개 검사 중 3,695 PASS·8 FAIL이었다(`closure-frontend-full.json`, 실행 종료 영수증 포함). 3개는 동결 주간보고 승인 대기이며, 나머지는 출하 상세 비동기 fixture·최근 재고와 모바일 이력의 위치 근거·재작업 입력 자동 보정의 오래된 기대였다. 실패한 전체 실행에서는 커버리지 보고가 생성되지 않았으므로 커버리지 통과로 보고하지 않는다.
- PA/PF 재작업 테스트는 잘못된 합계를 자동 보정한다는 옛 기대를 제거하고 입력 보존→오류 표시·제출 차단→명시적 수량 수정→정확한 작업 요청을 검증하도록 정렬했다. 제품 변경 없이 관련 51개·ESLint가 통과했다(`papf-wizard-policy-green.json`).
- 출하 완료 이력 테스트는 초기 빈 패널을 즉시 검사하던 경합을 없애고, 완료 상세 응답 및 서로 다른 요청자·처리자를 기다려 각각 확인하도록 보강했다. 제품 변경 없이 관련 196개·타입·ESLint가 통과했다(`shipping-requester-fixture-consumers.json`). 저장 전 좁은 실행은 통과하여 RED 근거는 최초 전체 실행의 실제 실패만 사용한다.
- 최근 재고·모바일 이력의 기존 실패 3개는 위치 근거가 있는 fixture와 위치를 알 수 없는 부서 합계를 구분하면서 기존 숫자·그룹·중복 검증을 보존했다. 추가로 실제 위치별 전후 수량이 모바일의 요청순 합계를 덮는 결함을 1 RED로 재현하고, 요청순 표시 영역에서만 실제 효과를 섞지 않도록 수정했다. 관련 46개 파일·838개 검사·타입·ESLint가 통과했다(`history-request-order-red/green/consumers.log`). 공용 실제 위치 계산은 유지했다.
- PC 요청순·계산 불가 및 모바일 요청순/실제 위치별 수량을 전용 브라우저에서 확인한 3개가 통과했다(`closure-new-flows-browser-50.json`). 이 파일은 응답 fixture를 사용하는 UI 계약 검사이며 실제 서버의 요청순 계산·거래 생성 근거를 대신하지 않는다. 복제 원본 SHA 불변과 테스트 DB·프로세스 정리를 확인했다.
- 현재 최초 전체 실행에서 발견한 미해결 실패는 승인 대기 주간보고 3개다. 전체 프론트 커버리지·고정 소스 빌드·원장 실행·0043 공동복구·커밋·푸시는 아직 남아 있다. 백엔드 전체 컴파일은 통과했다(`closure-backend-compile.receipt.json`).
- 50차 브라우저의 성공 이미지에서 실제 위치 수치가 두 번 표시되는 시각적 결함을 추가로 확인했다. 같은 위치·전후·증감이 이미 표시된 경우만 중복을 제거하고 결측 수량·불일치·불량·창고 박스 효과는 보존했다. 중복 3쌍의 개수 검사 RED 후 관련 177개·타입·린트가 통과했다(`history-actual-dedup-red/green.log`). 강화한 PC·모바일 브라우저 3개도 통과했고 새 화면에서 각각 한 번 표시됨을 직접 확인했다(`closure-new-flows-browser-51.json`, `browser51-results/`). 보호 DB SHA는 실행 전후 동일하고 테스트 환경은 정리됐다.
- 위 수정 후 후보를 다시 통합해 직접 assertion·선택자·소스 해시 검사가 오류 없이 통과했다(`reviewed-integration-current.log`, `reviewed-integration-audit.json`). 남은 연결 누락은 앞의 회신 대기 세 결정으로 한정되어 있다. 원장의 실행 상태는 계속 NOT_RUN이며, 부분 진단 통과를 최종 실행으로 승격하지 않았다. 소스 변경은 워크트리에 보존하고 Git 인덱스는 비어 있다.
- 정식 전체 실행기와 준비 도구를 교차 검사하면서 UTF-8 BOM이 있는 테스트 한 파일의 해시 계산 차이를 발견했다. 임시 통합 도구가 소스의 BOM을 제거하던 부분만 고치고 해당 13개 연결의 원본 파일 해시를 재생성했다. 제품·테스트·원문 기대는 바꾸지 않았으며, 공식 `normalize-mes-expectations.mjs --check`가 통과했다(`closure-canonical-current-check.receipt.json`). 이전 임시 통합의 오류 없음만으로 공식 실행기 검증을 대신하지 않는다.
- 공식 원장 검사 후 전체 실행 계획은 `8.4-03/component-shortage-block-unverified`에서 실제로 거부됐다(`closure-full-plan-policy-block.log`). 이는 회신 대기 출하 정책 조건이며, 주간보고 동결 및 신규 직원 관리자 메뉴 조건도 미완료로 보존한다. 같은 세 결정이 계속 미회신인 상태에서 진행 가능한 독립 오류 수정과 검사는 마쳤다. 최종 기대값·소스 고정·전체 근거 승격·배포 준비본 커밋·푸시는 결정 후 재개한다.

## 2026-10-09 최신 검증 상태

앞선 실패·승인 대기 기록은 당시 이력이며 현재 확정 정책은 결과 문서와 결정 원장을 따른다. 전체 완료 판정은 여전히 IN_PROGRESS이며 체크리스트 2완료·7미완료를 유지한다.

### 2026-10-09 최종 날짜 경계와 소스 동결

- `history-date-boundary-001/completion-nul-final.json`: 최종 관련 165 PASS·실패/오류/건너뜀 0·native 0. ISO-T·초 단위 날짜와 혼합 MIN/MAX, 잘못된 달력 날짜·24시 및 NUL 원문을 각각 실제로 재현했다. 정상 표기만 SQL 커서·suffix 제한을 적용하고 그 외에는 기존 전체 조회의 결과·오류를 보존한다. SQLite 함수·컬럼·변수 제한과 PostgreSQL SQL 원형도 관련 검사에 포함했다. PostgreSQL 실제 실행 완료와 성능 통과로 확대하지 않는다.
- `staged-import-executed-20261009-002`: 새 helper와 소비자 변경을 포함한 누적 9단계 mapper/OpenAPI import 모두 native 0, DB 연결 금지·index 불변. 기능별 중간 커밋의 업무 테스트 전체 통과를 뜻하지 않는다.
- `frontend-reuse-20261009-002.json`: 현재 앱 검사 입력 864개와 파일 집합이 기존 통과 시점과 동일함을 확인했다. 변경된 E2E 파일·생성 자료는 앱 lint·타입·단위 커버리지 범위 밖이며 별도 실제 브라우저 검증이 필요하다. 새 전체 프론트 테스트를 실행한 것으로 기록하지 않는다.
- 전체 백엔드003은 03:24:57~03:46:28 KST에 3,875개 중 3,796 PASS·실패/오류 0·79 SKIP·native 0으로 종료했고 실행 중 소스·보호 DB는 불변이다. 건너뜀을 통과로 세지 않는다. 이후 UUID 원문 경계의 좁은 수정이 추가되어 이 전체 실행을 최신 소스의 전체 실행으로 표시하지 않는다.
- `history-uuid-boundary-001/completion-sqlite-uuid.json`: 단일·혼합·중복 UUID의 대문자/하이픈 원문에서 대상 조회와 전체 조회가 달라지는 6개 실패를 재현한 뒤 수정했다. 정상 UUID의 구간 제한·조회 수와 NUMERIC 열의 정상 인덱스 검사를 유지하고, 비정규 숫자 PK는 전체 조회와 대조했다. 최종 관련 176 PASS·실패/오류/건너뜀 0·native/Ruff/diff 검사 0이며 실제 PostgreSQL 새 서비스 경로는 대기다. 두 버전에서 같게 발생한 기존 공개 API 오류는 이번 수정의 신규 회귀로 분류하지 않는다.
- c7 실제 조립은 native 0으로 종료했고 DB003의 실제 0038→0044 보존 검사도 통과했다. 실제 공동복구 세 모드는 아직 미실행이다. UUID 후속 소스를 새 c8 코드 동결에 연결하고, 입력이 불변인 p6/q6 빌드와 DB003을 원래 실행 이력 그대로 검증하여 재사용할 예정이다. 성능 기준 및 baseline 실패의 판정은 별도이며, main·직원 환경 미반영을 유지한다.
- PostgreSQL 최종 UUID 검사는 `portable-pg16-20261008T190613Z-27bb5602`에서 실제 4 PASS·실패/오류/건너뜀 0·native 0이다. 고유 스키마 OID를 확인한 뒤 정리하며, 기존 왕복 수와 전체 조회 수량을 대조한다. 최신 서비스의 snapshot도 `portable-pg16-20261008T191225Z-38e59389`에서 실제 1 PASS·native 0이다. 두 실행의 소스 275개는 전후·현재가 같고 소유 프로세스 종료·16432 재바인딩을 확인했다. 기존 84개를 새로 한 번에 실행한 것으로 집계하지 않는다.
- `backend-003-applicability-20261009-001.json`은 전체 백엔드003 이후 입력 차이가 서비스·관련 테스트 네 파일뿐임을 확인하고 해당 부분을 SQLite176·PostgreSQL4 근거와 연결했다. 새 전체 백엔드 실행 또는 성능 통과가 아니다. `staged-import-executed-20261009-003`의 누적 아홉 단계 import는 모두 native 0·index 불변이다.
- 최신 소스의 `final-source-preparation-20261009-004` 정규화·검사·full plan은 모두 native 0·보호 DB 불변이며 실행/승격은 하지 않은 준비 근거다. `final-c8-verified-20261009` 실제 전체 기대값 실행과 c8 복구 자료 동결을 시작했다. 두 작업의 완료 영수증과 실제 결과를 확인하기 전 원장 strict 또는 공동복구 완료로 표시하지 않는다.
- `backend-003-skip-reconciliation.json`: 전체 백엔드003의 SKIP 79개 중 77개 선택자가 실제 PostgreSQL 84개 결과와 일치한다. 이 대조는 소스별 검증 적용 범위를 대신하지 않는다. 남은 원래 C:\ERP 경로 전용 검사와 실제 0010 DB 전용 검사는 현재 환경에서 미실행이며 통과로 승격하지 않는다. 해당 두 선택자는 기대값 필수 조건에 연결되어 있지 않다. 최신 UUID 관련 SQLite176·PG4와 snapshot1을 별도로 연결한다.
- c8 freeze·assembly는 실제 native 0이며 새 코드 SHA `d32e0d40d38bafed83e21cc199f71b03893938cc0a67fa451a734d158a590ab1`, manifest SHA `c1b01d6f189756b278b0b90af7bfa5b90fc55d0056e09d06b8551dcc4f12d864`를 대조했다. p6/q6·Node·환경을 실제 검증했고 DB003은 원래 c7 실행으로 재사용했다. `c8-failure-resume-job` 실제 설치 실패·재개 리허설은 04:22~04:36 KST native 1이다. 의도한 실패 주입 전 Windows 긴 경로 `copytree` 오류로 실패했고 hard-exit/정상 모드는 시작하지 않았다. 구 버전 격리 기동·조회·종료와 실패 후 구 코드·프론트·Node·설정·복제 DB 보존, journal `ROLLED_BACK`, 전용 8042/3042 해제만 확인했다. 초기 복사·조립 성공을 실제 설치·공동복구 성공으로 세지 않는다.
- `original-drift-readonly-001.json`과 `original-sync-logical-comparison-001/receipt.json`: 과거 원본 두 DB의 파일 해시 변동을 발견했다. 기존 별도 예약 동기화의 04:01~04:24 실행·원본 교체·기존 서버 재기동 기록을 읽기 전용으로 대조했다. 해당 동기화 후보와 현재 C:\ERP 원본의 전체 테이블 정의·행 집합은 정확히 같았으며 원본 파일은 비교 전후 동일했다. 원본 SQLite 연결·쓰기·서버/예약 작업 조작은 0이다. 과거 보호 해시 불변을 재라벨링하거나 원본을 복원하지 않는다. DB003의 당시 보존 성공, 이번 작업 브랜치 미배포와 기존 동기화 사건을 구분한다.

- `final-backend-20261009-001`: 00:38:19~00:59:11 KST, 3,832개 중 3,772 PASS·실패/오류 0·60 SKIP, native 0, 소스·보호 DB 불변. PostgreSQL 및 경로 조건 SKIP을 완료로 올리지 않는다.
- `mobile-bulk-targeted-20261009-006`: 타입 검사 native 0, 실제 모바일 전량 복귀 1 PASS·retry 0. 원건 ID별 2/3개 제출과 창고 5개 복귀, 다른 부서·품목·예약 보존, API 후속 사용 5개를 확인했다. PNG 열람·전용 포트 해제·소스/보호 DB 불변을 확인했다. canonical 원장은 NOT_RUN을 유지한다.
- `final-coalesce-formal-001`: 00:37:01 KST 종료, 조회·버전·동시도별 30회×3묶음 표본과 소스 불변. 100비교 중 80 PASS·20 FAIL, native 0/accepted false. 단독·mixed 1명은 기준 안이지만 10/30명 상한·상대회귀가 남았다. 최대 합성 정합성은 baseline 87회 timeout·3회 HTTP 200, 작업본 90회 모두 HTTP 200이다. 2026-10-09 원시 세 묶음을 다시 집계하여 이전의 뒤집힌 타임아웃 수를 바로잡았다. 검사기는 양쪽 응답 성공을 요구하므로 baseline 실패 역시 완료를 막는다. 기준을 바꾸거나 전체 성능 통과로 보고하지 않는다.
- `staged-import-executed-20261009-001`: 별도 누적 소스의 9단계 실제 mapper/OpenAPI import native 0, DB 연결 금지 및 index 불변. 중간 커밋 업무·DB 테스트 전체 통과를 뜻하지 않는다.
- 최종 frontend 소스의 fresh 운영/QA production 빌드를 시작했다. 실제 0044 공동복구·canonical full·strict 완료·기능별 커밋·브랜치 push·최종 HEAD CI는 아직 완료하지 않았다. main·직원 환경은 미반영이다.

### 2026-10-09 13:45 KST 테스트 네트워크 격리와 후속 검증

- 공용 MSW의 미등록 요청 통과에서 감사 요청이 localhost:3000으로 빠지는 동작을 가짜 native fetch·실제 TCP 차단 환경에서 재현했다. 미등록 요청 오류 처리와 감사 204 모의 응답, 안전성 6조건을 추가했다. `vitest-network-safety-001/completion.json`에서 일반 설정 46개·기대값 설정 74개가 각각 PASS·native 0·실제 TCP 시도 0이며 중복 합산하지 않는다. 전체 프론트·canonical 재실행은 남아 있다.
- 원본 직원 DB의 파일 복제 비교에서 감사 80행 추가만 확인했다(`employee-drift-readonly-002/receipt.json`). 기존 행·다른 테이블·스키마는 동일하다. 테스트 시간과 겹치지만 각 행 원인을 확정하지 않았으며 앞선 예약 동기화와 구분한다. 원본 DB 불변이라는 완료 조건은 충족했다고 보고하지 않는다. 원본 연결·감사 정리·서비스 조작은 하지 않았다.
- p7의 production 빌드·번들은 통과했으나 원본 보호 해시 변화로 전체 native 1이었다. 새 안전성 입력을 포함한 p8/q8 운영·QA 전체 빌드·artifact·실행 전후 보호 검사는 13:54:23 KST native 0으로 종료했다(`c10-preparation/build-validation.json`). 운영 번들은 3,145,688 / 3,145,728 bytes로 승인 한도 안이다. 이후 backend 수정은 새 코드·DB·manifest 검증으로 다시 연결한다. 최종 공동복구 세 시나리오는 아직 미실행이다.
- 출하 재검증 내부 이동의 URL 경합 수정 후 관련 29개와 원래 브라우저 1개가 각각 PASS·native 0이다(`shipping-rematch-browser-001/completion.json`). Vitest 중복 인스턴스 이름을 구별하고 실행 상태 변경 없이 선언 근거만 갱신했다. 전체 원장 NOT_RUN·정식 성능 미충족·대시보드 2완료/7미완료·커밋/푸시/CI 대기는 유지한다.
- `final-frontend-native-003` 자식 lint/type/coverage는 모두 native 0·3,798 PASS지만 영수증 도우미의 Windows 경로 키 오류로 전체 native 1이다. 실패 원문을 보존하고 ignored 004에 키 정규화·실행 전 입력 즉시 저장을 보완해 14:06:30 KST 새 검사를 시작했다. frontend 제품 소스는 변경하지 않았으며 전체 완료로 승격하지 않는다.

### 2026-10-09 14:24 KST 후속 확인

- `final-frontend-native-004` 실제 lint·type·coverage·supervisor 모두 native 0, 341파일·3,798 PASS·0 FAIL/ERROR/SKIP이다. 입력·작업본 DB·network guard 전후 동일, guard 활성화 366개·차단 socket 시도 0개를 확인했다. 명시적인 빈 employee 자식 예외의 현재 소스와 한계는 영수증에 기록한다. 003 실패는 보존한다.
- 내역 metadata floor 후보의 최종 네 파일 135 PASS·native 0이며, 재고 요청 조회별 필드와 UUID NUL 접미부의 실제 실패 재현을 수정했다. 최종 router `9b87ccd7…`/전용 테스트 `1dc596cc…`의 좁은 독립 리뷰 중요 결함 0이다. 실제 조회 결과·속도 비교와 새 코드 공동복구는 아직 완료하지 않았다. 원장 strict·정식 성능·커밋/푸시/CI 및 대시보드 완료 판정은 유지한다.

### 2026-10-09 14:33 KST metadata floor 후보 미채택

- 실제 TCP 두 비교의 전체 응답은 동일했으나, 독점 재측정에서도 후보 SQL 계산 비용과 내역·일반 조회·검색 시간이 늘어 채택하지 않았다. 후보 코드·테스트·135개 통과·RED·독립 리뷰·측정 원문은 ignored `performance/tcp-floor-comparison-001/`에 보존했다.
- 제품 router는 이전 `de0f3ef2…`로 정확히 복원하고 후보 전용 미추적 테스트를 제거했다. 기존 기능·DB·성능 기준은 유지하며 후보 통과를 현재 제품 검증으로 계산하지 않는다. 원래 성능 미충족과 최종 공동복구·strict·커밋/푸시/CI는 남아 있다.

### 2026-10-09 14:39 KST 최종 코드 동결·전체 검사

- 실제 `c11-freeze-job` native 0, freeze SHA `9b2083c6…`; 코드/프론트는 후보 제외 후 p8와 동일하지만 현재 보호 비교·artifact 재검증을 새로 수행했다. assembly 진행 중이며 세 공동복구 모드는 아직 미실행이다.
- `final-backend-20261009-004` 전체 pytest는 14:36:08 KST 시작, 입력·보호 작업 DB 대조를 포함한다. 결과는 아직 미확정이다. 별도 compileall native 0이다.
- Next 생성 참조를 HEAD dev 형태로 복원하고 dev 직접 타입 검사 native 0을 확인했다. 004 입력 전체의 현재 SHA는 동일하며 생성 파일은 기존 수집·배포 계약에서 제외된다. 프론트 검사를 반복한 것으로 세지 않고 실제 canonical 원장 strict는 여전히 대기한다.

### 2026-10-09 15:04 KST 백엔드 최종 결과·복구 실패 보존

- 전체 backend004 native 0: 3,898개 중 3,815 PASS·83 SKIP·0 FAIL/ERROR, 소스·작업 DB 불변이다. 이전 실행 대비 추가 skip은 PostgreSQL UUID 네 변형이며 실제 PG/최종 CI 검증과 구분한다(`backend004-reconciliation-001.json`).
- c11 assembly 실제 native 0·manifest `cae0cf3d…`, 현재 DB003 84입력과 새 사본83입력이 일치했다. 기존 실제 보존 근거를 재사용했으며 새 DB 실행으로 기록하지 않는다.
- c11 첫 failure-resume는 설치 전 `_previous_node` 반환에 없는 version을 읽는 도우미 KeyError로 native 1이다. 기존 가짜 순수 fixture가 이 오류를 숨겼다. 원문·보호 불변·journal/DB 동일·전용 프로세스 종료/포트 해제를 보존하고 helper 최소 RED→GREEN만 진행한다. 실제 세 복구 성공으로 승격하지 않는다.
- 새 전체 기대값 `final-c11-verified-20261009`를 15:03:17 KST 시작했다. 합성 QA/9그룹 종료·개별 근거 확인 뒤 strict를 판단한다. 정식 성능·복구·커밋/푸시/CI와 대시보드 미완료 상태를 유지한다.

### 2026-10-09 15:12 KST 복구 Node 계약 최소 수정

- 원형 c11 helper·freeze·manifest·첫 실패 영수증은 보존했다. 별도 v2에서 존재하지 않는 dict version 접근만 실제 `release.node_version(Path(current['node']['path']))` 호출로 교정했다.
- 합성 임시 Node/설정에 실제 `_previous_node`를 호출한 동일 검사는 RED 14 FAIL·5 PASS에서 GREEN 19 PASS·0 SKIP·native 0으로 바뀌었다. 버전만 모의하며 실제 subprocess/socket/SQLite 연결은 모두 0이다. 구문·Ruff도 native 0이다(`recovery/c11-node-contract-fix-001/ready.json`).
- 기존 바이트·설정·DB·버전 불일치 거부를 유지하는 별도 attempt-002 연결을 준비한다. 실제 설치·복구·서버 기동은 아직 재시도하지 않았다. 순수 검사 성공을 공동복구 완료로 세지 않는다.

### 2026-10-09 15:21 KST 독립 정책 리뷰·별도 복구 재시도

- 주간/PF·동반 예약/신규 직원 메뉴 및 복구 가드의 읽기 전용 독립 리뷰에서 검토 범위의 새 Critical/Important는 없었다. 실제 코드·테스트 단언·소스 SHA와 직접 실행하지 않은 한계를 `final-policy-read-review-001.md`에 남겼다. 전체 실행 통과 판정과 구분한다.
- attempt002의 순수 연결 검사 36 PASS·native 0, SQLite/socket/subprocess 모두 0이다. 원래 c11 manifest·executor 및 역사 입력을 변경하지 않고 새 manifest `51d093bd…`와 별도 helper/worker/supervisor를 추가 admission으로 묶었다.
- 부모는 15:19:48 KST 정확 manifest/supervisor SHA와 8042/3042 해제를 확인한 뒤 failure-resume만 시작했다(PID 49316, private `run-6e4c17d0/employee/backend/mes.db`). 실제 결과는 진행 중이며 hard-exit/normal은 아직 실행하지 않았다.
- 추가 성능 읽기 리뷰도 전체 기준을 충족할 안전한 최소 수정은 입증하지 못했다(`performance/final-performance-read-review-001.md`). 취소 반복 조회 배치는 미검증 가능성일 뿐이며, 역사 formal FAIL·현재 정식 NOT_RUN·고정 baseline 성공요건과 작업본 절대상한 미충족을 분리해 유지한다. 제품/기준은 변경하지 않았다.

### 2026-10-09 15:30 KST 복구 준비 조회의 클라이언트 제한 진단

- attempt002 실제 native 1(15:24:45 KST): Node 계약과 구묶음 admission은 통과했지만 구버전 `/health/ready` 응답을 각 요청의 2초 내 받지 못했다. 서버 로그의 15개 준비 요청은 모두 200이며 3.102~55.122초다. 짧은 클라이언트 제한 뒤 재요청이 겹치는 현상으로, 서버가 503을 냈다고 기록하지 않는다. 실제 응답 본문은 수집되지 않았다.
- 별도 파일 해시 진단 native 0(`recovery/c11-attempt002-readonly-diagnostic/result.json`): 구 코드/프론트/Node/설정 및 C8 journal 전체 동일, fixture DB/backup/baseline `d7cd2ff8…` 동일, 보호 8파일+외부 6근거 전후 동일이다. 프로세스 종료·전용 포트 해제·lock 해제·기존 admission 보존·최종 result 없음도 확인했다.
- 프론트 기동·설치·마이그레이션·복구는 아직 미진입이다. 원형 harness와 실패 근거를 바꾸지 않고 별도 테스트용 readiness 어댑터의 RED→GREEN을 진행한다. 전체 90초·제품/성능 기준은 유지하며 요청/sleep을 남은 시간 안으로 제한하고 deadline 이후 200을 성공으로 인정하지 않는다. 실제 재시도는 새 admission/manifest 확인 뒤 별도로 수행한다.

### 2026-10-09 15:57 KST 새 실행 중간 근거

- canonical 첫 브라우저 묶음: 실제 259 PASS·0 SKIP/FAIL/flaky·native 0, execution 영수증의 583 조건·282 스크린샷 연결. 전체 9그룹 및 원장 strict 완료로 승격하지 않는다. 백엔드 기대값 묶음 진행 중이다.
- 요청별 대기만 보강한 테스트용 readiness 어댑터의 실제 순수 11개, 공유 스킬 경로 11개, CI와 같은 backend 경로 11개가 각각 통과했다. 전체 90초·소유권 검사·제품 성능 기준을 유지하고 deadline 이후 200을 거부한다. 공유 스킬 재현 명령과 기존 백엔드 CI의 해당 검사 단계를 추가했으며, 현재 canonical 및 코드 묶음의 수집 제품 입력 밖 변경임을 확인했다.
- 새 attempt003은 15:46:13 KST 시작했고 구버전 0038의 실제 백엔드/production 프론트 기동·조회·종료를 15:48:48 KST 완료했다. 새 프론트 설치는 15:56:13 KST 종료하고 코드 설치로 진입했다. 마이그레이션/복구 최종 판정은 대기다. 이전 실패/admission은 보존하고 원본 환경은 제외한다. 성능·strict·커밋/푸시/CI 미완료 상태와 대시보드 2 완료/7 미완료는 유지한다.

### 2026-10-09 16:03 KST 실제 실패와 검사 이식성 보강

- canonical 첫 백엔드 묶음: 실제 1,496 PASS·0 FAIL/ERROR/SKIP, execution 영수증 생성 후 Vitest 진행. 전체 원장 승격은 미완료다.
- attempt003 실제 native 1(15:58:54 KST): 프론트 설치는 통과했으나 `install_code`의 `old.rename(quarantine)`가 superseded-code 긴 경로에서 실패했다. 계획된 실패 주입 전의 실제 오류이고 최종 result는 없다. journal/원문은 보존하고 정확 복원·보호 비교 중이다. 동일 경로의 재현과 최소 수정 준비만 하며 재시도/다음 모드는 수행하지 않는다.
- 공유 readiness 검사에서 Linux LF 체크아웃의 실패를 실제 재현(1 FAIL/13 PASS)하고 CRLF→LF만 정규화한 해시 계약으로 수정했다. 실제 내용 변경 거부·LF/CRLF 포함 14 PASS·native 0, 별도 순수 실행도 입력 불변·DB/socket/subprocess 시도 0이다. 원형과 실행된 attempt003의 ignored 어댑터는 불변이며 최초 byte-exact/11개 결과와 현재 공유 소스 결과를 구분한다. 현재 전체 완료·성능·복구·커밋/푸시/CI 상태는 미완료다.

### 2026-10-09 16:18 KST 실행 종료·국소 경로 수정·새 검증

- c11 canonical 실제 native 0(15:03:18~16:08:11 KST), 대상 345개·9그룹 PASS·failures 0이다. 보류 6개와 구분하며 원장 승격은 하지 않았다. 뒤의 국소 제품 수정으로 수정 전 증거로 보존하고 새 실행을 시작했다. 작업 DB `08fd9b80…` 불변·8021/3100 해제를 부모가 확인했다.
- 코드 격리 경로의 실제 Windows 2 RED→2 GREEN 후 기존 경로 가드 뒤 mkdir/rename 두 줄만 `_copy_io_path`로 보강했다. 관련 130 PASS·0 SKIP/native 0, compile/Ruff/diffcheck 0, 다른 함수/클래스 48 AST 및 캐시/manifest/rollback 계약 보존, 보호 8+6 불변이다. 현재 release SHA `c2d0e774…`, 새 테스트 `62d447ab…`; 독립 읽기 리뷰에서도 Critical/Important 없음이다. Windows CI에 실제 긴 경로 검사 두 파일을 연결했다.
- 현재 소스로 `final-c12-verified-20261009` 전체 기대값을 16:17:43 KST 시작했다. c12 새 코드 동결·조립 준비 중이며 실제 공동복구 재시도는 미실행이다. 성능·최종 strict·커밋/푸시/HEAD CI는 미완료이며 대시보드 2 완료/7 미완료를 유지한다.

### 2026-10-09 후속 설치·QA 자료 검증

- `final-verified-20261009` 전체 기대값 실행은 최종 소스 수정이 필요하여 의도적으로 중단했다. 종료 직전 통과한 개별 검사를 전체 완료로 승격하지 않는다. 해당 프로세스 트리만 종료하고 전용 포트 해제를 확인했으며, 중단한 브라우저 자료는 `closure/final-verified-20261009-aborted-browser/ABORTED.json`에서 파일별 SHA256 동일성으로 보존했다. 상태는 `ABORTED_NOT_PROMOTABLE`이다.
- 격리 PostgreSQL 16 실제 신규 설치에서 기존 0016의 enum 변환 전 문자열 기본값과 0024의 인덱스 의존 오인이 확인됐다. 좁은 실패 재현 후 수정·실제 PostgreSQL 재검증 중이며, SQLite 전체 검사 성공을 PostgreSQL 성공으로 대신하지 않는다. 기존 서버·원본 DB는 조작하지 않는다.
- 실제 QA 화면 열람에서 정적 seed 직원명을 발견했다. 합성 QA DB의 직원 이름만 테스트용 이름으로 변환하는 제한된 도우미와 안전성 검사를 추가한다. 기존 이미지·실패 근거는 보존하고, 새 소스에 대한 브라우저 증거와 개인정보 검토를 다시 수행한다.
- p5/q5 fresh 빌드가 성공했지만 이후 마이그레이션 및 QA 소스 변경이 예정되어 있으므로 최종 공동복구 증거로 사용하지 않는다. 최종 소스 동결·새 빌드·DB 보존 검사·공동복구·전체 기대값 실행은 여전히 미완료이며, 정식 성능의 20 FAIL도 유지한다.
- QA 이름 변환 도우미의 안전성 검사 9개와 최종 대상 브라우저 4흐름이 통과했다(`qa-employee-names-targeted-002`, 타입·Playwright native 0, retry/SKIP 0). 부모도 같은 CI 명령의 9개 검사를 실행하고 PNG 5개를 직접 열람했다. 직원명은 합성 이름이며 PIN 화면에는 빈 입력의 기본 placeholder만 표시된다. 역할·다른 정보·원본 DB 불변과 전용 포트 해제를 확인했으며 전체 기대값 승격은 하지 않았다.

### 실제 PostgreSQL 설치·복구 선행 검사

- 실제 신규 설치에서 0016 기본값 enum 변환, 0024 인덱스 의존 판독, 0029 역할 enum 생성 오류를 재현해 해당 부분만 수정했다. 0038 제품 마이그레이션은 변경하지 않았으며 Alembic의 commit 경계를 허용하는 폐기용 private schema fixture로 검사한다. 정상 신규 head 0044 설치와 관련 38개 검사가 실제 PostgreSQL에서 통과했다.
- `portable-pg16-20261008T165018Z-1ca40c78`의 당시 필수 묶음은 첫 11 PASS·둘째 37 PASS/23 FAIL, 총 48 PASS/23 FAIL·0 SKIP이다. 전체 PostgreSQL 성공으로 기록하지 않는다. 실패는 Windows 긴 임시 경로, 실제 DB의 표현과 스키마 검사 간 불일치, 기존 검사 fixture의 세 오류로 구분했다.
- 짧은 고유 임시 경로를 쓰는 실행기에서 기존 fixture 세 오류는 제품·권한·잠금 계약을 바꾸지 않고 교정했으며 `portable-pg16-20261008T171235Z-fb26ddbd`의 실제 세 회귀가 통과했다. 실제 복구 집중 검사 두 개는 1 PASS/1 FAIL로, 정상 DB를 43개 스키마 불일치로 판단하는 오류가 남았다.
- 신규 PostgreSQL 스키마 회귀 11개를 추가했다. 실제 RED는 정상 metadata와 read-only snapshot 두 실패이며, 기존 문자열 대소문자 비교의 거짓 PASS도 독립 RED로 재현했다. 수정 후에는 Boolean·문자열/enum·CHECK·생성 열·sequence 대상/소유권 변경 거부와 읽기 전용 검사를 실제로 다시 실행한다. 현재 CI 연결 필수 분모는 첫 22개·둘째 60개이며 실제 전체 성공은 아직 미확정이다.
- 각 폐기용 cluster는 고유 경로·프로세스 소유권·입력 해시·종료 상태를 기록했다. 로컬 설치 도구의 SHA는 보존하지만 별도 공급자 checksum을 확보하지 못했으므로 공급자가 인증한 checksum이라고 표시하지 않는다. 기존 서비스·원본 DB·시스템 긴 경로 설정은 변경하지 않았다.
- 후속 스키마 판독 보정의 실제 RED 후 최종 `portable-pg16-20261008T172921Z-34da8601`에서 필수 84개(24+60) PASS·0 FAIL/ERROR/SKIP·native 0을 확인했다. 부모도 XML과 PASS 영수증·소스 불변·cluster 종료를 독립 대조했다. 선행 스키마 13개·dump/restore 집중 2개도 통과했으나 필수 분모와 중복 합산하지 않는다. 이는 Windows 로컬 PG16 성공이며 Linux CI나 최종 공동복구 성공으로 확대하지 않는다.
- `db-preservation-0044-002`는 당시 고정 소스로 실제 복제 DB의 0038→0044 기존 정보 보존에 통과했다. p6 운영 빌드의 실제 승인 번들도 통과했으며 q6와 최종 공동복구는 진행 중이다. 이후 backend만 바뀌면 새 코드·DB 검사·manifest 연결을 만들고, 같은 frontend/Node/환경의 산출물 재사용은 실제 계약·해시 검증으로 입증한다.
- 독립 읽기 리뷰에서 내역 SQL 최적화의 SQLite 날짜 표기 경계 두 건을 발견했다. ISO-T 독립 거래의 다음 페이지와 마이크로초 없는 거래의 suffix 조회를 기존 전체 조회 경로와 대조했고, 실제 HTTP/합성 DB RED를 추가한 뒤 좁게 수정한다. 현재 전체 backend002는 수정 전 소스의 실행으로 보존하며 최종 코드 전체 성공으로 재라벨링하지 않는다. 성능 20 FAIL·원장 NOT_RUN·공동복구 미완료·커밋/푸시 대기는 유지한다.
- 날짜 경계 실제 `history-date-boundary-001/red-002.xml`은 4 FAIL·0 ERROR/SKIP이다. ISO-T solo의 다음 페이지 누락과 초 단위 거래의 요청순/위치효과 맵 누락·HTTP 500을 메모리 DB로 재현했으며 파일 DB 연결은 0이다. 최초 setup 오류 실행은 제품 RED로 합산하지 않는다. 성능용 고정 실복제 QA DB의 관련 날짜 필드 원문은 `date-storage-diagnostic-002`에서 모두 정규였고 DB/빈 WAL/SHM 해시가 같았다. 이는 endpoint fallback 빈도나 성능 통과 근거가 아니다.
- 전체 `final-backend-20261009-002`는 02:38:43~03:01:04 KST, 3,852개 중 3,772 PASS·1 FAIL·79 SKIP·오류 0·native 1로 종료했다. 실패는 `test_crash_child_collects_native_exit_and_waits_on_unknown_identity[True]`의 0.2초 자식이 소유권 조회 전에 끝난 테스트 경합이며, 운영 거부 동작은 유지하고 테스트 handshake로 교정한다. 소스·보호 DB는 불변이었다. PG 필수 84개 actual PASS와 전체 명령의 실패 판정을 구분한다.
- p6/q6 실제 운영/QA fresh 빌드·source/Node/artifact 검사는 03:02:09 KST native 0으로 종료했다. 이후 날짜 제품 수정 및 lifecycle fixture 교정에 소스 동결을 해제했다. 당시 빌드 증거는 보존하고, 동일 frontend 산출물은 수정된 backend 코드·새 DB 검사·새 generation에 검증하여 연결한다. 최종 공동복구와 원장 strict는 여전히 미완료다.
