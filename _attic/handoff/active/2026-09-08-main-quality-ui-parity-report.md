# DEXCOWIN MES main–품질 개선 브라우저 동등성 검증 보고서

검증·최종 정리: 2026-09-08~2026-09-10 KST
최종 판단: **미검증 범위 때문에 판단 보류**

## 직원 관점 한 페이지 결론

고정 main과 현재 품질 pending merge 파일을 서로 다른 합성 DB·포트·Chrome context에서 실제 클릭·입력·저장·결재·재고 이동으로 비교했다. 현재 증거에서 **품질 버전에 남은 직원 사용성 회귀는 0건**이다. 창고·부서 입출고, 생산·분해, 출하 준비·픽업·각 취소, 불량 처리, 보고서, 체크리스트, 창고지도, 관리자 CRUD의 기존 비교에 더해 이번에는 인증·권한과 stale 재고 부족 흐름을 다시 실행했다.

확정 변경은 의도대로 동작했다. 잘못된 PIN은 두 화면 모두 `PIN 번호가 올바르지 않습니다.`로 안내한다. 품질 버전은 마지막 활동 기준 30분 세션, 잠금 1분 전 경고, 명시적 `로그인 유지`, 자동 조회 제외, 탭 간 상태 공유를 적용한다. 만료 시 입력은 화면에서 숨겨지고 같은 직원 재인증 때만 탭 메모리에서 복구되며, 다른 직원에게는 폐기된다. 로그아웃 응답 유실도 완료 확인 전 재로그인을 막고 재시도로 복구한다.

결재 화면은 사용자가 정한 역할표와 맞는다. 창고 전용 담당은 창고 승인함만, 부서 전용 담당은 부서 승인함만, 겸임은 둘 다, 역할 없는 직원과 역할 없는 관리자는 둘 다 보지 못한다. 품질 API도 같은 기준으로 200/403을 반환하고 승인·반려를 제한한다. main은 화면이 숨겨져도 일부 queue GET이 200이고 역할 없는 관리자에게 부서 승인함을 표시하므로, 품질 쪽 차이는 권한 안전 개선으로 분류했다.

재고 부족 재현도 양쪽이 같았다. 입출고에서는 다른 UI 요청이 마지막 1개를 먼저 예약한 뒤 오래 열린 대상 제출이 422로 거절됐고, 대상 요청·batch·거래는 생기지 않았다. 출하는 대상 요청을 PREPARING으로 만든 뒤 경쟁 출하가 출하 위치 10개를 먼저 예약하자 대상 준비가 422로 거절됐으며, 대상 allocation·event·operation·receipt와 재고가 변하지 않았다. 이 두 시험은 순차 stale 화면 경합이며 PostgreSQL 동시 잠금 시험을 대신하지 않는다.

판단을 보류하는 핵심 이유는 두 가지다. 사용자가 실제 벽시계 30분 대기 시험을 생략해 해당 한 행이 미검증으로 남았고, 이 호스트에는 독립 PostgreSQL을 만들 도구와 `TEST_POSTGRES_URL`이 없어 세션 만료/갱신 및 재고·승인의 두 연결 잠금 경합을 실행하지 못했다. 제어된 만료시각·+31분 절전 복귀 시험과 SQLite UI/API/SQL 대조는 통과했지만 이 두 범위를 통과로 바꾸지는 않았다. 실물 모바일·카메라·네이티브 인쇄, 외부/직원 동기화와 실제 직원 서버 변경도 보호 조건에 따라 미실행으로 남겼다.

## 비교한 코드와 격리 실행 환경

| 항목 | 값 |
|---|---|
| 고정 main | `27e6c9dba5465d83f837788c12c89efc5bbf07fa`를 `git archive`로 추출한 `sources-v4/main-fixed` |
| 품질 브랜치 / HEAD | `codex/full-code-quality-improvement` / `d4a3bb103b4491d5731537dd611936d417525fc3` |
| 품질 실제 원본 | `MERGE_HEAD=27e6c9dba5465d83f837788c12c89efc5bbf07fa` pending merge의 현재 working-tree 파일을 복제한 `sources-v4/quality-pending` |
| 보존한 index tree | `a969140a6c9adf92ce2e0d50edfb2d6c1c87d59d` |
| 최종 작업 상태 | staged 150경로, unstaged 70경로, untracked 4경로; stage/reset/checkout 없음 |
| 소스 해시 증거 | `evidence/manifest/quality-source-refresh-20260909.json`, `evidence/quality-working-tree-sha256.tsv` |
| 주소 | main `127.0.0.1:3301/8021`, 품질 `127.0.0.1:3302/8022` |
| DB | 각 버전 정식 schema/bootstrap의 별도 SQLite 합성 DB·동일 논리 fixture |
| 브라우저 | 시스템 Chrome/Playwright, PC 1440×900·모바일 390×844 외 기존 경계 viewport, `ko-KR`, KST |
| 런타임 | Node 20.20.2, Python 3.12.13 |

`C:\ERP`의 파일·index·DB와 기존 서버는 변경·재시작하지 않았고 `C:\ERP-dev`에는 접근하지 않았다. 시험마다 고유 phase 영수증으로 소유한 프로세스만 종료했다.

## 전체 화면·조작 검증 목록

총 **206개** 시나리오다.

| 판정 | 수 |
|---|---:|
| 동일 | 178 |
| 의도된 품질 개선 차이 | 20 |
| 회귀 또는 불편 | 0 |
| 미검증 | 8 |

- [전체 Markdown 검증표](../../runtime/ui-parity-20260908-155732/parity-matrix.md)
- [Excel 호환 CSV](../../runtime/ui-parity-20260908-155732/parity-matrix.csv)
- 브라우저 증거: `../../runtime/ui-parity-20260908-155732/evidence/browser/`
- SQL snapshot: `../../runtime/ui-parity-20260908-155732/evidence/sql/`
- 실행·빌드 로그: `../../runtime/ui-parity-20260908-155732/logs/`

모든 행에는 증거 경로나 미검증 이유가 있다. 자동화 선택자·하네스 자체 문제로 실패한 중간 시도는 `attempt` 또는 이전 로그로 보존했으며 최종 PASS 근거에서 제외했다.

## 의도된 품질 개선 차이

- 인증: 탭 간 로그인·로그아웃 공유, 기본 PIN 변경 요구, 로그아웃 응답 유실 복구, 30분 활동 세션과 경고·연장·잠금, 동일 직원만 미저장 입력 복구.
- 결재: 품질 서버가 창고 역할과 부서 역할을 분리하고, 역할 없는 직원·관리자의 queue·상세·승인·반려 직접 접근을 차단한다. 기존 생산·불량 흐름은 관련 회귀 테스트를 통과했다.
- 입출고: 처리 완료 뒤 응답만 유실된 제출 재시도는 품질에서 원 batch를 되돌려 UI가 복구된다. 두 버전 모두 수량 중복은 없다.
- 대시보드: 전체 카드에 `출하 중간 공정·공정 완료 품목 제외`를 표시하고 별도 행 설명은 제거했다.
- 정합성·번들: 품질 정합성 검사가 확장됐고 현재 품질 build/bundle gate가 통과했다. 고정 main bundle의 기존 5,644-byte 초과는 품질 회귀가 아니다.

## 발견·수정하고 재검증한 회귀

- 창고지도 편집이 잘못된 PIN으로 먼저 열리던 회귀를 전용 `verify-editor` 권한 확인으로 수정했다. 잘못된 PIN 403·화면 미진입, 올바른 PIN 뒤 생성 201·삭제 204, SQL 원상 복구를 확인했다.
- 다른 탭 로그아웃 뒤 정상 로그아웃에도 로그인 잠금 표식이 남던 회귀를 수정했다. 두 탭이 오류 없이 로그인 화면으로 돌아오고 재로그인 가능함을 실제 브라우저로 확인했다.
- 최종 읽기 전용 검토에서 인증 없이 IO 초안 조회가 가능하던 권한 누락을 발견했다. 초안 단건·목록을 현재 세션의 요청자에게만 허용하고, 완료 내역은 인증된 직원에게 기존처럼 공유하도록 수정했다. 수정 전 200 응답을 재현한 테스트가 수정 후 401/403으로 통과했고 관련 행위자 계약 13개가 통과했다.
- 이전 backend full 실행에서 드러난 저장 초안 `Decimal` fingerprint 직렬화 3건, PowerShell 캡처 인코딩 2건, 과거 창고 역할 자가승인 기대 1건을 수정했다. 실패 6건이 속한 영향 suite와 핵심 인증·권한 계약을 통과한 뒤, 최종 수정 조합의 backend 전체 suite도 다시 실행해 exit 0을 확인했다.

관련 코드 위치: `backend/app/services/operator_session.py:18,170-190`, `backend/app/routers/operator_sessions.py:418-436`, `backend/app/routers/stock_requests.py:227-238,267-409,559-575`, `frontend/app/mes/_components/login/useOperatorIdleSession.ts:13-16,363-426`, `frontend/app/mes/_components/login/MesLoginGate.tsx:116-159,379,469-489`, `frontend/app/mes/_components/login/OperatorLoginCard.tsx:136,228`, `frontend/app/mes/_components/_warehouse_steps/_constants.ts:94-106`, `backend/app/services/command_idempotency.py:49-61`.

## main에도 있는 공통 문제

- `HAND-06`: 인수인계 작성 UI가 숨겨진 조립 사용자의 직접 `POST /api/handovers`가 양쪽 모두 201로 문서를 만든다. 동등하지만 권한 결함이다.
- 불량 통계 오류 화면의 초기 포커스가 alert/재시도 버튼으로 이동하지 않는다.
- 불량 완료 뒤 브라우저 뒤로가기가 완료 전 장바구니를 다시 표시한다.
- 관리자 모델 삭제가 커스텀 확인 뒤 native confirm을 한 번 더 요구한다.
- BOM 생산·분해 왕복 뒤 수량 0인 위치 행이 남지만 합계·가용량·거래는 양쪽이 같다.
- 주간보고 품목 상세를 닫은 뒤 포커스가 원래 행으로 돌아오지 않는다.

## 현재 코드 검증 결과

- 프런트: Node 20.20.2에서 strict lint, 앱·테스트·E2E 타입 검사, 289 files / 2,769 tests가 PASS했다. production build와 bundle은 2,788,699 bytes / 2.820 MiB 한도로 PASS했다 (`../../runtime/main-integration-20260910-105710/logs/`).
- 백엔드: 최종 수정 조합의 전체 pytest suite가 exit 0으로 PASS했다. 독립 PostgreSQL이 필요한 테스트는 로컬에서 skip됐으며 GitHub PostgreSQL 16 CI에서 별도로 닫는다 (`../../runtime/main-integration-20260910-105710/logs/backend-full-after-fixes.log`).
- OpenAPI: 정본 갱신 내용을 프런트 생성 타입에 다시 생성했고 새 타입 기준 앱 타입 검사가 PASS했다.
- 실제 브라우저: 인증·세션 19개 결과 PASS, PC/모바일 역할 matrix PASS, 입출고·결재 양쪽 각 17개 조작 PASS, idle cross-tab·draft PASS, IO/출하 stale 부족 PASS.
- 재고 SQL: 입출고 확장 시나리오는 양쪽 요청 8건(완료 4·반려 2·취소 2), batch 8건, transaction 8건, 중복 client request ID 0이며 최종 재고가 초기값과 같다.
- PostgreSQL: 관련 테스트가 전용 URL 부재로 skip됐다. SQLite 결과로 통과 판정하지 않았다.
- 독립 검토: 검증표 수치·증거 연결·민감정보·본문 일관성·pending merge 보존을 읽기 전용으로 교차 확인했고 차단 발견이 없었다 (`evidence/reviews/final-artifact-review-20260910.md`).

## main 병합 전에 반드시 해결할 항목

1. 폐기 가능한 PostgreSQL에서 operator session 갱신/만료/폐기, 중복 승인, 입출고·출하 재고 잠금 경합을 실행한다.
2. 실제 벽시계 30분 경과를 출시 조건으로 삼는다면 생략한 `AUTH-15`를 한 번 실행한다. 제어된 경계·절전 복귀는 이미 통과했다.
3. 최종 조합의 backend full suite를 한 번 다시 실행하려면 약 1시간 검증 시간을 확보한다. 현재는 전체 실행의 유일한 6개 실패가 속한 영향 suite와 핵심 112개 계약을 수정 후 통과시킨 상태다.
4. 공통 권한 결함 `HAND-06`의 정책을 확정하고, 작성 권한 없는 부서의 직접 생성 API를 막을지 별도 처리한다.
5. 실물 기기·카메라·네이티브 인쇄와 외부/직원 동기화는 승인된 실제 환경에서만 닫는다.

제품 코드 수정 외에 새 브랜치·추가 main 병합·stage·commit·push·배포를 수행하지 않았다. 보고서의 종료 판단은 위 미검증 항목이 남아 있으므로 **미검증 범위 때문에 판단 보류**다.
