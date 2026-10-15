# DEXCOWIN MES NOT_RUN 기대값 근거 정리 결과

2026-10-13 19:26 KST에 **현재 작업본의 기대값 엄격 완료**를 확인했다. 기존 NOT_RUN 615조건을 완료했고 실행 대상 345항목·1,058조건 모두 유효 PASS다. 이 문서의 수치는 아래 실행의 역사적 스냅샷이다. 현재 분모와 상태는 정본 기대값 원장에서 계산한다.

## 기준과 범위

- 작업본: `C:/Users/user/.codex/worktrees/mes-expectation-closure/ERP`
- 브랜치: `codex/mes-expectation-closure`
- 시작 HEAD: `8df423cdf66ca88db649458e730c1ad32e055b3b`
- 시작 상태: 실행 대상 345항목·1,058조건 중 PASS 443·NOT_RUN 615. 합의된 제외 6항목은 유지한다.
- 분모 구분: 정본 `cases`의 351항목은 실행 대상 345항목과 지도 보류 6항목(6조건)으로 나뉜다. `excludedCases`의 인수인계 3항목은 사용자 미사용 지시로 정본 실행 분모 밖에 별도 기록돼 있다. 지도 보류의 NOT_RUN을 이번 대상의 미완료로 합산하거나 PASS로 바꾸지 않는다.
- 계획: `docs/superpowers/plans/2026-10-13-mes-not-run-evidence-closure.md`
- 로컬 실행 제어·사전 검사: `_attic/runtime/not-run-closure-control-20261013-001/`
- 이전 성공 집계: `_attic/runtime/mes-expectations/api-db-final-20261013-002/run.json`
- 새 집계 실행: `_attic/runtime/mes-expectations/not-run-closure-20261013-003/`
- 중단 실행 보존: 같은 위치의 `not-run-closure-20261013-001/`·`not-run-closure-20261013-002/` — `INTERRUPTED_NOT_COMPLETE`

001·002의 `INTERRUPTED_NOT_COMPLETE`는 이 문서의 완료 분류다. 의도적으로 중단한 래퍼의 실제 상태는 `EXPECTATION_GROUPS_FAIL`·native exit 1이며, 완료 집계 영수증이 없다. 원문 상태를 성공으로 바꾸거나 중단 전 개별 화면만 성공 집계로 승격하지 않았다.

이번 작업은 기존 근거의 현재 유효성을 확인하고 무효 그룹만 다시 실행해 원장을 정리한다. 관련 CI 실패의 테스트 선택자와 관리자 E2E의 보조 API fixture 연결만 최소 수정했다. 커밋·푸시·main 반영·직원 배포는 범위에 포함하지 않는다. 성능·동시 부하·복구·전체 빌드·coverage 검사를 반복하지 않는다.

## 실제 재사용 판정

사전 검사에서 이전 영수증·실행 파일·원문·화면 캡처의 해시와 모든 그룹의 런타임 동일성을 확인했다. 기본 계획의 5그룹 재사용·4그룹 실행과 달리, 실제로는 **4그룹 재사용·5그룹 재실행**했다. `not-run-closure-20261013-003/run.json`은 2026-10-13 18:25:02 KST에 9그룹 PASS·failures 0으로 완료됐고 각 그룹의 native exit 0·근거 대조 성공을 확인했다.

| 그룹 | 실제 처리·원문 결과 | 근거 |
|---|---|---|
| 일반 Playwright `playwright-a39d40068b` | 재실행·261 PASS | E2E 소스·공용 보조 요청 fixture·새 연결 회귀 검사로 프론트 스냅샷 변경 |
| 일반 pytest `pytest-0929f3cdc2` | 재실행·1,496 PASS | 소스·런타임은 동일하지만 조건 지문 변경(최초 3조건·선택자 수정 후 11조건) |
| Vitest `vitest-d4c81f0c18` | 재실행·772 PASS | 프론트 전체 입력 스냅샷 변경 |
| 운영 pytest `pytest-6eb3066497` | 재사용·6 PASS | 입력·런타임·조건 지문·원문 일치 |
| Node `node-a86a95cbd0` | 재사용·24 PASS | 입력·런타임·조건 지문·원문 일치 |
| Node `node-ff9f8c06ce` | 재사용·15 PASS | 입력·런타임·조건 지문·원문 일치 |
| Node `node-6cec52101c` | 재사용·23 PASS | 입력·런타임·조건 지문·원문 일치 |
| AS·연구 UI `playwright-411a1b28c5` | 재실행·8 PASS | 프론트 전체 입력 스냅샷 변경, 독립 합성 DB 사용 |
| AS·연구 API/UI `playwright-8338f033f9` | 재실행·1 PASS | 프론트 전체 입력 스냅샷 변경, 독립 합성 DB 사용 |

모든 원문에서 실패·SKIP가 없고 브라우저는 flaky·재시도·전역 오류도 없다. 재사용한 4그룹의 실제 최초 실행 ID는 `api-db-final-20261013-001`이며, 직전 성공 집계 `api-db-final-20261013-002`를 통해 출처를 연결했다. 재사용 원문의 실행 시각을 이번 실행 시각으로 바꾸지 않았다. 테스트 수와 원장 조건 수는 서로 다른 집계다.

일반 pytest의 추가 재실행 대상 조건은 `8.3-03/defect-card-population`, `PC-DELTA-HISTORY-04/owner-independent-of-executor`, `PC-DELTA-HISTORY-06/search-group-child-consistency`다. 업무 기대·결정·필수 근거·단언은 동일하며, 같은 조건에 연결된 `history-expectations.spec.ts`의 해시와 선언 위치가 변경돼 전체 조건 지문이 달라졌다. `backend-fingerprint-explanation.json`에서 이전 지문과 변경 필드를 대조했다. 검증 가드를 유지하고 해당 그룹을 추가 실행한다.

위 3조건은 최초 사전 검사의 결과다. 아래 선택자 최소 수정 후 002 사전 검사에서는 일반 pytest에 연결된 지문 변경이 11조건으로 계산됐다. 실제 재사용 후보 4·재실행 5그룹은 같다. 이 단계의 입력은 `not-run-closure-control-20261013-002/environment-before.json`에 보존한다.

관리자 보조 API fixture 연결 후 003의 사전 검사도 일반 pytest 지문 변경 11조건·재사용 후보 4·재실행 5그룹이다. 현재 실행 입력은 `not-run-closure-control-20261013-003/environment-before.json`을 따른다.

## 실행 중 확인한 CI 선택자 실패

[현재 HEAD의 CI](https://github.com/Hw-03/ERP/actions/runs/38355881303)에서 일반 E2E가 실패했다. 나머지 backend·frontend·근거·AS/연구·Windows 작업은 성공했으나 이를 일반 E2E 성공으로 확대하지 않는다.

- 실패 경로: `history-expectations.spec.ts`의 기간/필터 검사와 `shipping-additional-expectations.spec.ts`의 출하 원작업·취소 건수 검사.
- 원인: `HistoryFilterPanel.tsx`의 제목은 카드 바로 아래에 있다. 제목에서 부모를 두 번 선택한 테스트는 카드 전체가 아닌 세 카드의 공통 컨테이너를 선택했다. CI 원문 snapshot에서 부서 `출하`와 작업 종류 `출하`가 동시에 존재했고 엄격 선택자 오류가 발생했다.
- 001 실행을 계속해 변경 예정 소스의 근거를 쌓지 않도록 소유 프로세스만 종료했다. 기존 자료와 합성 DB 사본을 보존했다. PostgreSQL 종료 native exit 0·전용 포트 해제·보호 DB 불변을 확인했다. 중단 자료를 PASS로 승격하지 않는다.
- 최초 국소 실행의 제목 정규식이 전체 테스트 이름과 맞지 않아 0건 수집으로 끝났다. `filter-red.json`은 업무 실패 재현 근거가 아니다. 선택 목록의 2건을 확인한 뒤 `filter-red2.json`에서 기존 출하 선택자의 같은 충돌을 재현했다(1 PASS·1 FAIL·재시도 0). 내역은 이 국소 순서에서는 통과했고 동일 충돌의 실패 근거는 CI 원문이다.
- 두 파일의 선택자 세 줄에서 부모 이동을 한 번으로 제한했다. 수정 후 `filter-green.json`은 2 PASS·0 FAIL·0 SKIP·0 flaky·재시도 0, native exit 0이다. 해당 두 파일 ESLint native exit 0.
- 제품 코드·재고 처리·업무 단언·timeout·재시도 설정은 변경하지 않았다. 48조건의 기존 바인딩을 `historicalBindings`에 보존하고 변경된 파일의 해시만 갱신했다. 국소 통과만으로 전체 원장을 PASS로 바꾸지 않았다.

CI 원문과 다운로드한 실패 자료, 로컬 RED/GREEN, 해시 갱신 목록은 최초 제어 디렉터리에 보존한다. 수정 후 CI는 이번 작업에서 다시 요청하지 않았다.

## 관리자 보조 API 연결 실패

002의 `8.19-12`는 실제 직원 삭제의 409 응답과 대기 업무 안내를 확인한 후 `physical()` 보조 GET에서 실패했다. trace의 직전 API 응답 종료와 실패 GET 시작 간격은 6,017.991ms였고 실패 응답은 `read ECONNRESET`이다. 취소 정리와 직원 정리 요청은 이어서 성공했다. 이는 이전 연결 진단의 약 6초 유휴 만료 경계와 맞지만 이번 trace에는 소켓 직접 식별 정보가 없어 그 특정 소켓의 종료 주체까지 확정하지 않는다.

`admin-expectations.spec.ts`만 기존 `_isolated-api-expectations`의 `test`를 사용하도록 바꿨다. 별도 worker와 Node 보조 API의 `Connection: close` 정책은 기존 검증된 구현을 재사용하며 이번에 수정하지 않았다. 직원 브라우저의 실제 요청·UI 제출·409/예약/재고 보존 단언과 정리는 유지한다. 새 테스트 재시도나 timeout은 추가하지 않았다.

- 002의 실제 실패 trace·화면·QA 사본·요청 시간은 두 번째 제어 디렉터리에 보존했다. 002를 중단하고 소유 프로세스 종료·포트 해제·보호 DB 불변을 확인했다.
- `admin-green.json`: 해당 관리자 파일 6 PASS·0 FAIL·0 SKIP·0 flaky·재시도 0·native exit 0. ESLint native exit 0.
- 4조건의 이전 바인딩을 보존한 뒤 해시와 한 줄 이동한 선언 위치만 갱신했다. `binding-audit.json`에서 다른 필드·단언·실행 상태 불변을 확인했다.
- 기존 연결 회귀 10회 근거는 fixture·회귀 검사 소스 및 설치 런타임이 같으므로 보조 근거로 재사용한다. 이번 관리자 파일의 실제 통과는 별도 새 실행으로 확인했다.
- 신규 fixture import의 직접 TypeScript 검사 native exit 0. 추가로 세 E2E 파일 전체를 좁혀 본 타입 검사는 출하 fixture 44행의 기존 TS2352로 exit 2이며 PASS로 기록하지 않는다. 가상 compiler host로 세 파일을 기준 HEAD 원문으로 대체한 검사도 동일 위치·코드의 오류를 반환했다. 해당 형변환은 이번 수정 범위 밖이며 제품 타입 검사 통과와 이 추가 점검을 구분한다. 근거는 세 번째 제어 디렉터리의 `tsc.log`·`tsc-baseline.json`·`tsc-transport-import.log`다.

## 실행 환경과 보존

- Node 20.20.2·Playwright 1.60.0·Next 16.3.4·Python 3.12.0을 사용한다.
- 새 PostgreSQL 전용 cluster는 제어 디렉터리의 `cluster/`, 포트는 16432다. 기존 cluster를 재사용하지 않았다. 초기화·기동·DB 생성·schema-head 준비는 모두 native exit 0이다.
- 브라우저 실행 영수증은 합성 `backend/mes_e2e.db`, 스키마 `20261008_0044`, 프론트 3100·백엔드 8021을 확인했다.
- 보호 워크트리 DB의 시작·종료 SHA256은 `08fd9b8025375a5e61cbdacb0c65ad8acede6423b27eef09abd0634c1a458f0a`로 동일하다. 종료 영수증에서 PostgreSQL 종료 native exit 0·`clusterStopped: true`·`remainingQaPortOwners: []`를 확인했다.
- 새 실행 ID와 별도 원문 디렉터리를 사용한다. 이전 전체 PASS·API 연결 원인 진단·실패 자료를 덮어쓰지 않는다.

이번에 수정한 실행 파일의 최종 SHA256은 다음과 같다. 나머지 검증 입력과 런타임의 전체 스냅샷은 각 그룹의 `*-execution.json`에 보존한다.

| 파일 | SHA256 |
|---|---|
| `frontend/tests/e2e/admin-expectations.spec.ts` | `7f30ddaaf241bb2e443ef697cf739164591bece41a7d1b712b3e41ad88d815df` |
| `frontend/tests/e2e/history-expectations.spec.ts` | `e83d29cd661386dc41c1ffe3bc67df452da0983ffc0b0e01b8d2dcb6d547f8d7` |
| `frontend/tests/e2e/shipping-additional-expectations.spec.ts` | `1bf2399fd2013348ab9c11bc4e4aee9bacc493266862f5af6621ee72aee68bdc` |

## 최종 판정과 보존 검사

실행 ID `not-run-closure-20261013-003`의 완료 결과는 `STRICT_COMPLETE`다. 승격된 정제 근거는 `docs/superpowers/specs/2026-10-07-mes-expectations.sources/verification/not-run-closure-20261013-003/`에 있다. 실패 trace·영상·합성 DB·PostgreSQL cluster와 대용량 진단 자료는 ignored runtime에만 보존한다.

| 단계 | 명령 또는 근거 | native exit / 완료 시각(KST) |
|---|---|---|
| 그룹 실행·재사용 | `run-mes-expectations.mjs --resume …/api-db-final-20261013-002/run.json --run-id not-run-closure-20261013-003` | 0 / 18:25:02 |
| 승격 | `run-mes-expectations.mjs --promote …/not-run-closure-20261013-003/run.json` | 0 / 18:56:14 |
| 정규화 | `normalize-mes-expectations.mjs` | 0 / 19:10:25 |
| 엄격 완료 | `normalize-mes-expectations.mjs --check --require-complete` | 0 / 19:26:20 |
| 이력·보존 대조 | 로컬 `not-run-closure-control-20261013-003/audit-final.py` | 0 / 19:26:21 |

명령의 전체 경로·인자·시각은 실행 영수증과 계획의 실제 명령을 따른다. 로컬 `finalization-receipt.json`과 각 단계 로그에 종료 코드를 별도로 보존했다. 업무 테스트를 승격·정규화·엄격 검사 때문에 다시 실행하지 않았다.

`final-audit.json`에서 다음을 확인했다.

- 기본 계약 270항목·666조건, 추가 기대값의 실행 대상 75항목·392조건이 모두 PASS다. 실행 대상에 NOT_RUN·PARTIAL·FAIL·SKIP가 없다. 지도 보류 6항목·6조건과 원장 외 인수인계 제외 3항목은 기존 상태 그대로다.
- 기존 유효 PASS 443조건은 이전 실행 이력으로 정확히 보존했다. 조건 ID·바인딩·기존 이력·범위·제외 집합은 동일하며 원본 기대값·피드백·이전 영수증과 실행 파일의 해시도 유지했다. 앞선 52조건의 바인딩 수정은 두 개별 audit의 보존 근거와 연결된다.
- 시작·종료 HEAD는 `8df423cdf66ca88db649458e730c1ad32e055b3b`, 브랜치는 `codex/mes-expectation-closure`로 동일하고 인덱스는 비어 있다.
- 보호 DB 본체 해시가 동일하고 기존 WAL은 0바이트다. 소유 QA 프로세스를 종료했고 3100·8021·16432에 남은 청취 프로세스가 없다. DB·코드 복구 사본과 실패 자료는 보존했다.

- [x] 새 집계의 모든 그룹 native exit·근거 검사와 실제 재사용/실행 수 확인.
- [x] 성공 집계 승격·정규화·`--check --require-complete`의 개별 native exit 0 확인.
- [x] 원장의 대상/제외 집합·조건별 완료와 이전 이력 보존 확인.
- [x] 소유 QA 종료·포트 해제·보호 DB·HEAD·브랜치·변경 파일 확인.
- [x] 활성 TODO와 계획의 실제 완료 상태 갱신.

과거 API 실패의 특정 소켓 귀속 한계와 사용자 수용으로 추가 최적화를 제외한 성능 상한 FAIL 기록은 이번 기대값 완료로 변경하지 않는다. 전체 테스트 반복 통과·원장 연결만으로 현재 조건을 PASS로 승격하지 않는다.

**종료 상태: 작업본 기대값 검증 완료·미커밋·미푸시·main 미반영·직원 환경 미적용.** 이번 수정 후 CI·전체 빌드·coverage·성능·복구 검사는 새로 실행하지 않았다. 과거 결과를 이 소스 묶음 전체의 새 통과로 확대하지 않으며, 위에서 기록한 추가 E2E 타입 점검의 기존 TS2352도 PASS로 바꾸지 않는다.

2026-10-14 후속 승인: 사용자가 이 검증 완료 상태를 작업 브랜치에 세 커밋으로 저장하고 푸시하도록 요청했다. 위 종료 상태는 검증 시점의 기록이다. 선택자 수정 `7be28e06`·관리자 fixture 연결 `0081ea06`에 이어 원장과 정제 근거·문서를 분리한다. 9그룹의 입력 스냅샷과 337개 산출물 참조 해시·정본/생성 원장 일치·런타임/설치 의존성 동일성을 확인해 기존 검증을 재사용했다. 실제 최종 커밋과 푸시 결과는 Git 로그 및 최종 보고를 따른다. main과 직원 환경은 계속 미적용이다.
