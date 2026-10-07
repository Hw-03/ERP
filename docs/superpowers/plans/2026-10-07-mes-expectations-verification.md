# DEXCOWIN MES 기대값 구현·검증 기록

2026-10-07 실행 기록. 사용자 승인 계획의 G01~G10을 구현했다. 원본 기대값·사용자 의견을 보존하고 후속 결정·개별 검증 조건과 연결했다. 전체 원장을 현재 실행 PASS로 표시하지 않는다.

정책: [활성 결정 기록](../../../_attic/handoff/active/2026-10-07-mes-expectation-decisions-todo.md). [실행 계획](2026-10-07-mes-expectations-implementation.md), [후속 기대값](../specs/2026-10-07-mes-expectations.json), [검증 연결](../specs/2026-10-07-mes-expectations.assertions.json), [원본 manifest](../specs/2026-10-07-mes-expectations.sources/manifest.json).

## 구현 결과

- G01: 직원 등급 enum·컬럼·API·로그인 저장·편집·CSV와 ADMIN 결재 특례 제거. 창고·부서 정/부, AS·연구 역할, 관리자 PIN과 담당 지정은 보존한다. 마이그레이션 `20261007_0039`는 SQLite native 컬럼 삭제 및 PostgreSQL 컬럼/미사용 enum 삭제를 사용한다. 정보 보존 검사는 직원 테이블을 제외하지 않고 해당 컬럼 삭제만 허용한다.
- G02~G05: 발생 시각·원래 수량·유일한 유효 최초 `is_initial` 이력으로 불량/B급/구형 집계. 없는 분류도 0을 반환한다. 비교 기간에도 같은 필드를 반환하며 최초 이력 손상은 추정 없이 제외·안내한다. 기존 직접 작업·복원 자료 중복 방지 유지.
- G06: 활성 canonical R 품목만 원자재 입고에 허용. 선택·미리보기·초안·저장·제출·실행에서 검증하고 잘못된 혼합 요청은 원자적으로 거부한다. 검색 목록에 없다는 이유만으로 정상 선택을 삭제로 판단하지 않는다.
- G07~G08: 직원·boot별 공용 상세 상태 저장과 서버 재조회. PC/모바일 검색·선택·상세 열림 복원, 삭제 확인과 404/접근/통신 오류 구분. 삭제 품목 신규 작업은 서버에서도 거부하되 이력·기존 작업 취소는 유지한다.
- G09: 요약과 월별 내역에서 원작업과 취소를 각각 한 작업으로 집계. 묶음/여러 거래 행 중복을 제거하고 취소의 실제 KST 기간과 원작업 업무 분류를 따른다.
- G10: theme/sidebar 원자 저장 API, 기존 개별 API 호환 유지. 동일 직원의 다른 탭은 성공 알림 후 서버 최신 설정을 재조회한다. 계정 변경·로그아웃·늦은 응답·동시 저장을 구분하고 미저장 설정/PIN 입력을 유지한다.

혼합 요청의 승인 단계와 전체 완료, 역할 부여·회수·재부여, 원건 잔량과 품목 카드 수, 예약 보존은 부족했던 실제 회귀 assertion을 추가했다. 주간보고·모바일 내비게이션 디자인·출하 고정 카드·지도 보류는 변경하지 않았다.

## 원장 연결과 실행의 구분

`node scripts/dev/normalize-mes-expectations.mjs --check`가 원본 SHA·ID·조건·테스트 선택자·함수 본문 assertion·소스 해시와 동적 집계를 검증한다. 함수 밖 helper/모듈 assertion, 주석·문자열 속 가짜 assertion, 잘못된 ID·누락·중복·소스 변경·존재하지 않는 선택자와 부분 조건만 실행한 전체 PASS는 거부한다. 실행 PASS는 명령·시각·결과 선택자·상태·소스/증거 해시가 일치하는 JSON 근거를 요구한다.

2026-10-07 검증 스냅샷(원장에서 산출): CONTRACT 270항목, 연결 14항목/55조건, 전체 646조건, 실행 PASS 0항목. DELTA 81항목, 연결 11항목/50조건, 전체 234조건, 실행 PASS 3항목. 이번 결정의 활성 25항목/105조건은 실제 assertion에 연결했고 미사용 지도는 보류다. 원장 PASS는 검증 도구 자체 TEST-01~03의 실행 근거가 있는 8조건뿐이다. 제품 테스트 실행 결과는 아래 별도 기록을 사용한다. 범위 밖은 문장별 조건을 보존하되 원자성 미검토·브라우저 필요·NOT_RUN이며, 원본 보류와 과거 관찰도 보존한다.

선택 명령은 구체적인 테스트 타겟 **계획**을 반환하고 실행하거나 전체 PASS를 판정하지 않는다.

```powershell
node scripts/dev/normalize-mes-expectations.mjs --check
node scripts/dev/normalize-mes-expectations.mjs --select --tier smoke
node scripts/dev/normalize-mes-expectations.mjs --select --tier P0
node scripts/dev/normalize-mes-expectations.mjs --select --ids PC-DELTA-TEST-03
```

Node 검증기 16개 PASS의 JUnit·JSON 근거는 sources/verification에 보존해 새 checkout에서도 연결 검증이 가능하다. 일반 실행 로그는 `_attic/runtime/`에 보존한다. 커밋 분리 검토에서 LF/CRLF에 따른 테스트 소스 해시 불일치를 재현하고 수정했다. 테스트 소스 해시는 줄바꿈만 LF로 정규화하며 코드 변경은 계속 탐지한다. 원본 자료·실행 artifact는 `.gitattributes`의 해당 경로 `-text`로 바이트 그대로 보존한다. 원본과 실행 근거의 해시는 정규화하지 않는다. Git index에서 추출한 LF 파일 46개의 독립 스냅샷과 현재 Windows 작업 파일 모두 `--check` PASS였다(`registry-index-check.log`, `registry-portability-check.log`).

## 자동 검증 근거

통합 검증은 공통 직원 API/enum 제거, 마이그레이션 보존 검사, 신규 작업 경계의 회귀 위험 때문에 `verify_local.ps1 -Mode full -ChangeSet working`을 한 번 실행했다. 이 최초 명령은 백엔드 로그 테스트 1건과 프론트 테스트 1건으로 종료 코드 1이었다. 전체 통합 명령은 반복하지 않고 실패한 검사와 미실행 빌드/번들·문서 검사를 직접 실행했다. 프론트 최초 전체 실행은 3,398 PASS/1 FAIL이며, 재조회 완료와 React Query 화면 반영을 같은 시점으로 단정한 테스트를 `waitFor`로 수정하고 관련 17개 및 최종 전체 커버리지가 PASS했다.

백엔드 실패는 변경하지 않은 `tests/test_logging.py:119`의 자식 프로세스 30초 대기 초과(`exitcode is None`)였다. 로그 코드·테스트에 이번 변경이 없음을 확인했다. 단독 재검사 4개 PASS(3.47초), xdist 2 worker·`--dist=loadfile --testmon-noselect`를 사용한 재검사도 4개 PASS였다. 세 프로세스의 기록이 각각 정확히 한 번 존재하는 원래 assertion을 유지했다. 통합 실행의 자원 경합 가능성은 추정이며 원인 확정이나 최초 전체 명령의 PASS로 기록하지 않는다. 그 외 백엔드 전체 실행의 실패는 없었고 실제 PostgreSQL 연결이 필요한 검사는 SKIP했다.

| 영역 | 확인 결과·근거 |
|---|---|
| 등급·권한·DB 보존 | 관련 직원/SR 69, preflight 66, 직원 계약 35, PIN 보존 41, 마이그레이션 11 PASS/실제 PostgreSQL 환경 1 SKIP, 편집 UI 10 PASS. 실제 개발 DB 복제 마이그레이션 보존·재고 정합성 PASS. `g01-green-*-retry/final` 및 `actual-db-rehearsal.log` 참조. 중간 실패 로그는 별도로 보존. |
| 발생 통계 | 서비스/route/불량 흐름 관련 126, UI 22 PASS. 세 최초 분류와 변경·부분/전량 복귀 조합에서 발생 응답 불변, 손상 이력·기간·중복 방지 회귀 포함. |
| 원자재·삭제 서버 경계 | 관련 225 및 위조 BOM 후속 검사·공통 생산 검사 PASS. 출하 삭제/취소 관련 56 PASS. `io-*-final.log`, `item-production-green-final.log`, `shipping-deleted-green-final.log`. |
| 상세·UI 검색 | 직원/boot·열림/닫힘·삭제/오류/늦은 응답 훅과 PC/모바일 관련 검사 PASS. 최종 재조회 훅 17, 검색 선택 picker 43 PASS. `inventory-retry-final.log`, `p2-picker-green-final.log`. |
| 취소·승인·원건 | 취소 요약/월 경계 관련 43, 별도 예약 복원 2, 혼합 승인/반려·자가승인 대기·알림 관련 6, 승인함 즉시 갱신·원건 UI 41 PASS. |
| 화면 설정 | API 최종 8, provider/operator 24, 모달/셸 71 PASS. 한 SQL UPDATE의 양 필드 포함·동시 저장·이전 PUT 완료·계정 변경·미저장 입력 보존 포함. |
| 반복 검증 도구 | Node 최종 16, QA 도우미/seed 안전성 19, 모바일 인증 도우미 Node 1 PASS. `registry-portability-red/green/check.log`와 sources/verification의 최종 JUnit·JSON, `qa-helper-green.log`, `mobile-auth-green.log`. |
| 타입·정적 계약 | 전체 프론트 lint/typecheck와 OpenAPI drift PASS. 직원 enum 제거 후 전체 백엔드 수집 오류 없음. |
| 프로덕션 빌드·번들 | 빌드·내부 TypeScript 및 번들 안전성 2개 PASS. 실제 번들 3,064,933 bytes(2.923 MB), 한도 3,093,299.2 bytes(2.950 MB) 이내. `build-final.log`, `bundle-final.log`. |
| 백엔드 통합·실패 재검사 | 최초 전체 실행에서 로그 프로세스 대기 초과 1건. 해당 파일 단독 4개 PASS 및 병렬/testmon 4개 PASS, 각각 종료 코드 0. `integration.log`, `logging-final.log/xml`, `logging-parallel-final.log/xml`. 뒤에 보완한 회귀 검사는 위 관련 검사로 별도 실행했다. |
| 최종 프론트 전체 커버리지 | 322파일/3,412테스트 PASS, 종료 코드 0. Statements/Lines 95.08%, Branches 92.25%, Functions 89.74%로 설정된 기준 통과. `coverage-final.log`. |
| 문서·작업 범위 | 문서 검증 도구 14 PASS/1 SKIP, 유지 문서 및 신규 계획·보고서·TODO·스킬 링크 검사 PASS. tracked/untracked 텍스트 공백, 고정 파일 무변경, 기존 `next-env.d.ts` 바이트 보존, main·빈 index 및 원본 DB SHA 확인 PASS. `docs-tools-final.log`, `docs-final.log`, `docs-created-final.log`, `final-evidence.json`. |

위 관련 검사들은 겹치는 테스트를 포함하므로 합산하지 않는다. 검증 로그 기본 폴더: `_attic/runtime/expectation-implementation-20261007/`; 추가 원장/UI 검사 기록: `_attic/runtime/reviews/2026-10-07-mes-expectations-verification.txt`.

## 브라우저 검증 및 보존

기존 `mes-browser-regression` 스킬의 전용 소스·QA DB·8031/3031 포트를 사용했다. HEAD `34890d0fb1b214a58eee3a1adcc1a2524b1dcbc8`와 이번 변경 overlay SHA, boot `a0c7bca354e24c70ac00bdcabe2d4329`는 `_attic/runtime/mes-browser-regression/expectations-20261007-a/session.json`에 기록했다. 원본 서버를 재시작하지 않았다.

격리 Playwright는 site-experience 5개/appearance-sync 4개 최종 PASS. 최초 실행 7 PASS/2 FAIL 뒤 해당 2개 재검사 PASS이며, 호출 연결 초기화와 오류 알림 선택자 수정 근거를 보존했다. 검색에서 빠진 정상 BOM 자식 수정은 별도 브라우저 1개 PASS. 실제 IAB UI는 직원 편집·관리자 PIN, PC 열림/닫힘 및 모바일 상세 복원, 실제 삭제·작업 차단·이력, 정상 원자재 입고·취소 건수, B급 발생의 구형 변경·부분/전량 복귀 후 통계 불변, 동일 직원 두 탭 설정 반영을 조작·관찰했다. 오류 주입과 정상 UI 관찰을 혼합하지 않았다.

부분별 감사 ID·URL·KST·실제 관찰·스크린샷은 QA 실행 폴더의 `results.md`에 보존했다. 항목 일부 관찰을 전체 기대값 PASS로 기록하지 않았다. QA 소유 프로세스만 종료했고 보호 포트의 PID·생성 시각은 동일했다. 원본 개발 DB 파일 SHA는 동일하고 WAL은 0 bytes였다. 읽기 연결이 만든 SQLite 잠금 sidecar의 유무는 별도 기록했으며 DB 거래 변경으로 취급하지 않았다(`protection-after.json`).

추가 관찰: 정상 복귀 직후 기존 보관 화면의 `작업 선택`이 같은 보관 history entry에 머무는 경우가 있었다. 이번 변경 밖 `DefectHubPanel`의 기존 history back/replace 경로로, 해당 뒤로가기 조건은 PASS로 표시하지 않았으며 QA 기록에 남겼다. 통계 검수는 사이드바를 통해 다시 진입해 완료했다.

## 후속 CI 브라우저 테스트 수정

첫 푸시 `8fb3118a`의 [CI](https://github.com/Hw-03/ERP/actions/runs/37573098582)는 백엔드·프론트·Windows 검사에 통과했으나 생산 BOM E2E 1건이 실패했다. `io-process-produce.spec.ts:63`의 카드 중앙 클릭이 사이드바를 펼친 1280/1366px 화면에서 수량 감소 버튼에 닿는 것을 재현했다. `IoBundleCard.tsx:229`의 펼침 헤더 안에 있는 수량 영역은 `:346`에서 클릭 전파를 막으므로, 카드가 닫힌 상태로 수량이 바뀌었다. 제품의 의도된 입력 동작을 유지하고 테스트의 클릭 대상을 품목 영역의 가장자리로 한정했다. `aria-expanded=true`와 자식 수량 2→3의 기존 assertion도 함께 검증한다.

새 QA 실행 `ci-bom-20261007-a`는 커밋 소스·전용 DB·8031/3031을 사용했다. 기존 클릭은 폭/사이드바 8조합 중 2 FAIL/6 PASS, 수정 후 같은 8조합과 원래 생산 2개·이력 2개가 합계 12 PASS였다. 재시도는 0이며 실제 클릭·수량·위치와 화면을 기록했다. 변경 파일 ESLint와 원장 `--check`도 PASS. 초기 QA 시드 준비 오류와 본 테스트 결과는 구분했다. 관련 로그는 `ci-bom-width-diagnostic.log`, `ci-bom-green.log`, `ci-bom-lint.log`, QA 폴더 `results.md`에 보존한다. 앱 구현·DB 스키마 변경은 없다.

## 적용 범위 및 보존

원본 개발 DB에는 새 revision을 적용하지 않았고 직원 환경에 배포하지 않았다. 제거 전 DB·코드 백업과 명시적 마이그레이션이 실제 적용 시 필요하다. PostgreSQL 실제 연결 환경은 없어서 해당 통합 검사는 SKIP했으며 offline DDL과 보존 규칙을 별도 검증했다. 기존 수정 파일 3개 중 공유 preflight의 이전 변경은 보존해 이번 정책만 통합했고 `next-env.d.ts`는 최종 생성 작업 후 기존 바이트로 복원했다. 구현 검증 단계에서는 브랜치 변경·stage·커밋·푸시를 수행하지 않았다. 이후 사용자의 별도 커밋푸시 요청으로 main에서 기능별 커밋을 분리하며, 기존 preflight 변경과 `next-env.d.ts`는 제외한다. 기존 preflight 변경을 제외한 index 스냅샷에서도 보존 검사 46개가 PASS했다. 부분 스테이징을 충돌로 표시한 smart 계획은 그 사실을 기록하고 검증된 실제 diff와 소비자 기준으로 검사 결과를 재사용한다.
