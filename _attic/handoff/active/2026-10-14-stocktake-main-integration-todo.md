# DEXCOWIN MES 전수조사 최신 main 통합

## 목표와 현재 상태

- 2026-10-14 최종 정리 감사·커밋푸시 승인: [최종 감사 인수인계](2026-10-14-stocktake-cleanup-final-audit.md)를 따른다. 원본 코드/테스트·ignored 증거·최신 QA/개발 DB 보존을 재확인했고 원본 의존 실행 프로세스가 없다. 관련 변경은 사용자 요청대로 30개 단위로 커밋하며 원본을 실제 삭제하거나 직원 서버에 배포하지 않는다.

- 2026-10-14 추가 승인 완료: 기존 제외/부분 반영 UI·이력 8개 항목을 선별 결합하고 자동 검사·격리 브라우저 검증·보존 감사를 수행했다. 최신 결과와 제한은 [8개 항목 활성 인수인계](2026-10-14-eight-ui-expansion-todo.md)를 따른다. 현재 원본 파일 분류는 통합 338 / 별도 보존 1 / 합계 339이며, 아래 기존 분류·검증 개수는 최초 통합 시점의 역사 기록이다. 구 직원 배치 문서 1개는 외부에 보존하고 현재 계약 문서로 대체했다.
- 사용자 승인: 최신 main에 전수조사와 필수 의존성만 미커밋 통합하고 검증한다. 기존 워크트리는 실제 정리하지 않고 정리 가능한 보존 상태까지 만든다.
- 상태: 2026-10-14 통합·업무 검증·외부 보존·최종 보존 감사 완료. 이후 개발 DB 적용·서버 재기동에 이어 실제 브라우저에서 3명·20개 품목·40개 위치의 계수/반영과 부분 종료까지 검증했다. 원본 QA 종료/이전과 그 시점까지 추가된 자료의 보존 후 워크트리 정리 가능. 실제 정리는 하지 않았다.
- 기준 main: `be658b4fe5ced5a7a80a7ed5ee4027416a1d1d4b` (`C:/ERP`, main).
- 원본: `C:/Users/user/.codex/worktrees/stocktake-preflight/ERP`, HEAD `0e44daa93a451f331dc4b0c2fe7acfe1499288af`. 원본은 읽기 전용으로 취급한다.
- 외부 보관·검증: `C:/Users/user/.codex/stocktake-sandboxes/2026-10-14-main-integration/`.
- 메인 개발 서버 3001·8011은 승인된 DB 적용 후 재기동하여 실행 중이다. 주소는 `http://localhost:3001/mes?tab=stocktake`. 8개 항목 추가 검증 종료 시 직원 서버 3000·8010은 시작 관찰 PID를 유지했고, 원본 QA3147·8147은 미수신 상태였다. 이번 확대 작업은 해당 서버를 제어하지 않고 소유한 격리 3167·8167만 기동·종료했다.
- 후속 승인: 사용자가 “개발 DB에 적용하고 서버 열기”를 선택했다. `C:/ERP/backend/mes.db`의 스키마·POOL 전환과 최초 메뉴 OFF만 적용했다. 직원 서버 DB·원본 초기화·스테이지·브랜치 전환·커밋·푸시·직원 배포·워크트리 삭제는 수행하지 않았다. 담당자 PIN 초기화는 사용자가 직접 수행했다.

## 확정 계약

- 회차 관리: 활성 로그인 직원의 `department_role`이 `primary` 또는 `deputy`.
- 타인 조사 강제 잠금 해제와 업무 정정 미리보기·승인·거절 및 해당 재시도·정리: 부서 정·부 + 매 요청 관리자 PIN. 직원 level은 복원하지 않는다.
- 메뉴 일괄: 창고·튜브·고압·진공·튜닝·조립·출하 활성 직원 중 부서 정·부 제외. 개인 설정을 실제 수정하고 이후 개인 수정이 우선한다. 과거 ADMIN 등급 예외는 제거한다.
- 마이그레이션: 기존 두 체인을 그대로 보존하고 `20261008_0041`, `20261006_0044`를 부모로 신규 병합 head `20261014_0045`를 만들었다. 최초 통합에서는 복사 DB만 적용했고, 아래 후속 승인 단계에서 검증된 사본을 실제 개발 DB에 설치했다.

## 진행 체크리스트

- [x] 양쪽 소스 기준 및 메인 개발 서버 중지·직원/QA 서버 유지 확인.
- [x] 원본 수정/미추적 전체 입력 보관 및 메인 HEAD 보관. `input-manifest.json`, `source-before/`, `source-base/`, `main-before/`, `main-head.tar`.
- [x] 실제 메인 DB와 현재 QA DB를 읽기 전용 연결의 SQLite backup으로 외부 복사. `database-baselines.json`; 두 복사본 quick_check=ok.
- [x] 백엔드·필수 기반·권한·단일 migration head 선별 통합 및 파일별 판정.
- [x] 프런트엔드·로그인·메뉴·저장 보호 선별 통합 및 파일별 판정.
- [x] 무시된 파일·작성 중 QA 회차·증거·첨부의 외부 보존 및 해시 대조. 보존 시점 이후의 live QA는 최종 대조한다.
- [x] 메인/QA 양쪽 복사본 upgrade·데이터 보존·무변경 기동 검증.
- [x] 전체 SQLite backend·frontend 검사 실행 및 발견 실패 해소, 타입·lint·build·API·bundle 검증. 전체 1회 실행과 수정 범위 재검증을 아래에 구분 기록했다.
- [x] 격리 브라우저 PC·모바일·업무 흐름과 API 복구·권한, 메인 기존 기능 회귀 검증. 직접 브라우저에서 확인하지 못한 범위는 아래 한계에 기록했다.
- [x] 독립 명세 검토 후 코드 품질 검토, 발견 문제 수정·재검토.
- [x] 모든 원본 파일 판정·실행 경로 독립성·원본 DB 불변 최종 대조 및 정리 가능 판정.

## 실행 분담

- `integrate_stocktake_backend`: backend 및 POOL 전환 도구. frontend·문서·실제 DB·서버는 변경하지 않는다.
- `integrate_stocktake_frontend`: frontend만. backend와 원본 워크트리를 변경하지 않는다.
- `preserve_stocktake_artifacts`: 외부 보관 폴더만 수정. ignored 자료 보존 및 목록.
- 부모: 문서·공통 계약·복사 DB 검증·최종 전체 검사·브라우저·독립 리뷰·보존 판정.

## 남겨 둘 한계

- PostgreSQL 실환경 검증은 별도 미완료이며 SQLite 결과로 대체하지 않는다.
- 원본 QA는 살아 있는 동안 원본 소스/의존성 경로를 사용한다. 실제 워크트리 정리 때 해당 QA 종료 또는 새 격리 화면으로 이동이 필요하다.
- 최초 메뉴 초기화: 개발 DB는 후속 승인 단계에서 이필욱으로 기존 “현재 일괄 설정 다시 적용”을 실행하여 OFF를 적용했다. 참여 부서 활성 일반 직원의 실제 개인 설정에 반영되며 정·부는 제외됐다. 직원 서버에 향후 적용할 때도 해당 환경의 최초 OFF가 필요하다. 새 마이그레이션이나 기동 시 쓰기는 추가하지 않았다.

## 복사 DB 검증 — 2026-10-14

- `migration-proof/main-0041-upgraded.db`, `qa-current-0044-upgraded.db`에만 `bootstrap_db.py --migrate` 및 `--check`를 실행했다. 양쪽 모두 exit 0, 단일 head `20261014_0045`.
- 기존 테이블의 공통 열을 순서 독립 SHA256과 행 수로 대조했다. 양쪽 모두 변경된 테이블은 스키마 추적용 `alembic_version`, `alembic_schema_state`뿐이며 기존 업무 데이터는 보존됐다. 삭제된 테이블 없음, foreign_key_check 오류 없음, quick_check=ok.
- QA의 직원 level 제거와 새 열 추가는 기존 main migration의 의도된 변경이다. 작성 중 회차·조사·재고·영수증의 기존 열은 모두 보존됐다. 전체 근거는 외부 `migration-proof/*-proof.json`, `*-migrate.log`, `*-check.log`.
- 기존 DB를 업그레이드한 결과를 검증해야 하므로, 빈 DB를 seed하는 일반 브라우저 회귀 도우미 대신 외부 복사 DB와 명시적인 환경 변수를 사용한다. 브라우저 증거·프로세스 소유 정보·기동 전후 데이터 대조는 같은 기준으로 기록한다.

## 격리 업무·기동 검증 — 2026-10-14

- 새 코드의 QA 복사 DB 서버 `8157`이 ready를 반환했다. `browser-verification/startup-proof.json`에서 기동 전후 변경 테이블 0개. 실제 QA3147·8147은 그대로 유지했다.
- 별도 main 복사본에서 POOL 사전검사 차단 0개. 기존 효과 증빙이 없거나 모호한 역사 경고는 원본을 보존하는 경고이며 `main-pool-preflight.json`에 기록했다. 신규 복사본에서 PIN 확인 후 전환 영수증을 생성했고, 기존 재고·이력 테이블은 변경되지 않았다. 결과: `main-pool-apply-proof.json`.
- `copy-workflow-proof/20261014T015352Z/summary.json`: 복사 DB의 API 25단계 통과. 로그인 → 회차 시작 → 조사 저장·확인 → 본인 일괄 반영 → 동일 키 재전송/영수증 일치 → 전체 종료 보류 → 부분 종료/종료 증빙, 일괄 표시/개인 수정/같은 값 재적용, 역할 회수 후 민감 명령·복구 거절을 검증했다. TestClient 기동 전후 및 입력 복사본의 논리 해시 불변. 별도 검증 직원·설정은 해당 테스트 복사 DB에만 만들었다.
- 독립 품질 검토에서 발견한 일반 직원 새로고침 후 메뉴 복원 오류와 이전 계정 응답의 새 세션 삭제 경합을 수정했다. 실제 React hook·원본 세션 모듈 재현과 회귀 테스트가 통과했다. 원인·최종 재검토: `quality-review.md`, `reproduce-menu-reload.cjs`, `recheck-menu-session.cjs`.

## 최종 검증 결과 — 2026-10-14

다음 개수는 이번 실행 로그의 스냅샷이며 제품의 고정 품목·직원 수가 아니다. 원본 로그와 정확한 명령은 외부 보관 폴더에 있다.

- Backend 전체 SQLite 실행: 진행 로그 기준 3,499 통과·53 실패·58 건너뜀. 실패는 Windows 긴 임시 경로/테스트용 runtime 환경 51건, 병합 후 migration head 기대값 1건, 신규 OpenAPI 태그 설명 1건이었다. 짧은 외부 임시 경로와 테스트 전용 환경에서 정확히 실패했던 53개를 재실행하여 **53/53 통과**했다. 전체 명령 자체가 처음부터 성공했다고 표기하지 않는다. `backend-full.log`, `backend-failed-only-summary.json`, `backend-failed-only.xml`.
- 전체 검사 이후 UI 업무 반영/재시작에서 `application_bulk_scope` 증빙을 기존 진단기가 거절하는 오류를 발견했다. parent preview·receipt·request hash·selection·application/operation·actor 연결을 검증하도록 수정하고 정상/변조를 포함한 관련 9파일 **110개 통과**. 독립 검토에서 확인한 다른 정·부의 종료 미리보기 이어받기 계약도 보존하도록 actor 조건을 bulk에만 한정했다. 해당 RED 재현 후 evidence/close-contract/owned-waiting **36개 통과**. `backend-bulk-evidence-*`, `backend-close-actor-*`.
- Frontend 전체 실행: 354파일 중 351 통과, 4,004검사 중 4,001 통과. main의 불량 색상 보존과 세션 복원 경합 기대를 수정한 후 직접 영향받은 4파일 **28개 통과**. 로그아웃 Promise 순서 및 PC/모바일/유휴 계정 전환 관련 8파일 **86개 통과**. `frontend-full-tests.log`, `frontend-full-gate-regression-green.log`, `frontend-logout-order-green.log`.
- 최종 프런트 상태의 전체 app TypeScript, strict app/lib lint, production build, 번들 검사 모두 exit 0. `frontend-full-results.json`의 마지막 각 gate 결과와 `frontend-full-{typecheck,lint,build,bundle}.log`.
- 번들은 전수조사·세션·저널을 포함하여 3,285,497 bytes(3.133 MiB)다. 테스트 코드 혼입·중복 청크를 확인한 뒤 한도를 **3.00→3.20 MiB**로 갱신했다. 기존 3.00 한도를 통과했다고 주장하지 않는다. 바이트 측정/초과 실패 게이트 3개 통과. 근거 `bundle-review.md`.
- OpenAPI 전체 계약 검사 **7개 통과**. 최신 main 기준 operation 45개 추가, 삭제 0개, 기존 verify-pin 응답 타입 명시를 반영하고 baseline을 갱신했다. `openapi-diff.json`, `openapi-current.json`.
- 인앱 브라우저: 390·473·1024·1280·1915px 라이트/다크, 진행 skeleton/그래프·모바일 숫자표, 조사→확인→변화량 0 반영, 전체 종료 보류, 부분 종료/증빙, 일괄 ON→개인 OFF→동일 일괄 ON 재적용, 기존 대시보드/입출고/불량/출하 조회를 확인했다. 상세 증거 `browser-verification/results.md`, `layout-evidence.json`, PNG 파일들.
- 로그아웃 후 서버 해지가 끝나기 전에 reload하여 경고가 남던 문제를 수정했다. 최종 build에서 11:57 KST DELETE 204 후 로그인 화면으로 복귀하고 해지 미확인 경고가 없는 것을 확인했다. `logout-final-state.txt`, `logout-final.png`, `browser-console-final.json`.
- 최종 증빙 수정 후 같은 업무 시험 DB를 **정정하지 않고** 재시작했다. 11:58 KST readiness 200, database/schema/inventory/ledger 모두 true, 기동 전후 논리 스냅샷 동일. `browser-verification/restart-proof.json`, `session.json`. 검증 서버 3157/8157은 종료했다.

## 선별·보존 결과 — 2026-10-14

- 입력 수정/미추적 **339개 전체 판정**: 통합 331개, 별도 보존 8개, 미분류 0개. 원본·최초 보관본 SHA256 모두 일치. 기존 main에 겹치는 코드는 그대로 두고 필요한 부분을 통합한 파일도 통합으로 분류했다. 정확한 파일별 이유와 최종 해시는 `final-classification.json`.
- 별도 보존 8개는 직원 상세 전체 배치 기록/테스트, 사용하지 않는 InventoryOperationHistory와 테스트, InventoryItemRow, InventoryItemsTable, InventoryRecentHistoryPanel 테스트 전체 교체, MobileDashboardScreen 전체 교체다. 원본 바이트를 `source-before/`에 보관했고 필요 시 개별 검토할 수 있다.
- 원본 HEAD 전체, 미커밋 패치·미추적 파일, main 기준 및 기존 미추적 자료를 외부 보존했다. ignored 자료는 `ignored-inventory.json`, `artifact-preservation.json`, `source-dependency-manifest.json`, `preservation-summary.md`에 기록했다. 재생 가능한 의존성/빌드 캐시만 명시적으로 제외했고 SQLite WAL은 일관 backup에 포함했다.
- 최신 추가 보관은 `preservation-deltas/20261014-115843/`이다. 11:59 KST까지의 기록에서 새/삭제 비캐시 파일 0개, 새 사본 해시 모두 일치, live QA와 일관 사본의 회차 메타데이터 일치. 작성 중 회차 `d78e4dc706c644cba53dda78814149bf`는 원본에서 계속 진행 중이다. 이 시점 이후의 원본 QA 업무·로그는 다음 정리 시점에 추가 보관해야 한다.

## 최종 보존 감사와 판정 — 2026-10-14 12:00 KST

- `final-audit.json`: main/source HEAD 불변, main 브랜치 유지, index 비어 있음, 원본 수정/미추적 경로 추가·삭제 없음. 기존 main 미추적 18개도 바이트가 동일하다. `final-classification.json`의 원본 339개 SHA 대조는 오류 0개다.
- 실제 main DB는 최초 backup과 논리 대조하여 변경·추가·삭제 테이블 모두 0개, quick_check=ok. 직원 서버 3000/8010과 원본 QA3147/8147은 최초와 같은 PID로 실행 중이며 main3001/8011 및 검증3157/8157은 중지 상태다.
- 실행 코드·설정·production build 1,399파일에서 원본 워크트리 경로 의존이 없고, main frontend/backend 안의 원본 지향 symlink/junction도 없다. frontend node_modules는 독립 실제 디렉터리다.
- 통합된 현재 코드와 문서는 `integrated-current/`, tracked diff는 `main-integrated.patch`로 외부에도 보관했다. 최신 main 원격 hash도 기준과 같음을 최종 `git ls-remote origin refs/heads/main`으로 확인했다.
- 판정: **선별 통합·검증·보존 준비 완료. 원본 QA를 종료/이전하고 마지막 추가 자료를 보관한 후 원본 워크트리를 정리할 수 있다.** 현재 QA를 계속 실행한 채 즉시 삭제하는 것은 이 판정에 포함하지 않는다.

## 후속 단계의 경계

- 원본 QA3147/8147은 사용자 요청대로 실행 중이다. **실제 원본 워크트리 삭제 전 해당 QA를 종료하거나 새 위치로 이동하고 마지막 DB/로그 차이를 추가 보관해야 한다.** 현재 실행 중 QA까지 그대로 두고 즉시 삭제 가능하다는 판정은 아니다.
- PostgreSQL 실환경, 인앱 브라우저 OS 모션 감소 변경은 직접 검증하지 않았다. 최초 격리 통합에서는 실제 일반 직원 로그인을 하지 않았으나 후속 개발 서버 검증에서 김현우 로그인·새로고침 후 메뉴 숨김을 직접 확인했다.
- 원본 밖의 과거 QA workspace에 남은 `node_modules` junction은 원본 경로를 가리킨다. 이후 그 과거 workspace를 실행할 때 의존성을 재설치/재연결한다. 외부에 보관한 DB·문서·이미지·검증 파일 자체는 원본 삭제와 무관하게 보존된다.
- 실제 개발 DB 적용·최초 일괄 OFF·개발 서버 재시작은 아래 사용자 승인에 따라 완료했다. 커밋·푸시, 직원 배포, 원본 QA 이전/종료 및 워크트리 정리는 후속 단계로 남는다.

## 승인된 개발 서버 적용·브라우저 검증 — 2026-10-14 12:36 KST

아래 수치는 이번 검증 로그의 스냅샷이다. 증거 폴더는 외부 보관 루트의 `development-activation-20261014/`다.

- [x] 실제 적용 승인과 백업: `before.db`에 SQLite 일관 백업을 만들고 기존 데이터 지문을 대조했다. 외부 `candidate.db`에서 `bootstrap_db.py --migrate`, `--check`, POOL 사전 검사·전환을 수행했다. 차단 0개, 기존 역사 경고 194건은 증빙 부족 이력을 보존하는 경고로 `preflight.json`에 남겼다.
- [x] 검증 사본 설치: 기존 재고·거래·작업 이력 불변을 확인한 뒤 SQLite backup API로 실제 개발 DB에 설치했다. 단일 head `20261014_0045`, inventory mode `POOL`; 신규 작업은 전환 영수증 1건이다. `migration-proof.json`, `candidate-proof.json`, `cutover-receipt.json`, `installed-proof.json`.
- [x] 서버 기동: `start-backend.ps1 -NoReload`, `start-frontend.ps1` 성공. 브라우저 로그인 전 `startup-proof.json`의 변경 테이블 0개로 기동 자체의 DB 무변경을 확인했다. readiness는 database/schema/inventory/ledger 모두 true다. 개발 3001 PID 59100, 8011 PID 21648. 보호 포트 3000/8010/3147/8147의 PID는 최초 값과 동일하다.
- [x] 실제 계정: 사용자가 이필욱·김건호의 PIN을 직접 초기화한 뒤 두 계정으로 로그인·회차 관리 접근을 확인했다. 김현우는 일반 직원 권한을 유지하며, 일괄 OFF 후 전수조사 메뉴가 숨겨지고 새로고침 후에도 유지됐다. 비밀번호·PIN 원문은 검증 산출물에 기록하지 않았다.
- [x] 최초 일괄 OFF: 이필욱의 회차 관리에서 현재 OFF 설정을 재적용했다. 이 실행에서 참여 직원 15명의 개인 표시 설정을 초기화했고, 이필욱·김건호의 개인 표시 설정과 부서 정·부 역할은 보존했다. 이후 개인 수정·다음 일괄 재적용 계약은 기존 격리 시험 결과를 유지한다.
- [x] 실제 개발 브라우저: 390·473·1024·1280·1915px 라이트에서 회차 관리·메뉴 표시 카드와 가로 넘침 없음 확인. 개발 DB에는 회차가 없으므로 빈 상태를 검사했고 시험 회차나 재고 반영은 생성하지 않았다. 기존 대시보드·입출고 진입·입출고 이력·POOL 격리 목록 조회 성공. `browser-checks.json`, PNG 파일들. 실제 개발 DB의 유효 회차 그래프·업무 확정·다크 전체 행렬은 재실행하지 않았으며 앞선 격리 검증과 구분한다.
- [x] 발견된 PC 복원 오류 수정: 실제 모바일→PC 전환에서 `useCurrentOperator`의 최초 null을 메뉴 숨김으로 판정해 대시보드로 이동했다. `DesktopMesShell.tsx`에서 작업자 복원도 전수조사 로딩 대기로 취급하도록 최소 수정했다. 권한이 확정된 숨김 직원은 기존대로 진입을 거절한다. 회귀 RED 3개를 확인한 후 PC 전환·로그인 복구 77개와 모바일 레이아웃 46개 통과, 전체 TypeScript와 변경 파일 lint 통과. 실제 새로고침·모바일→PC 재진입도 확인했다. `desktop-remount-{red,green}.log`, `mobile-shell-regression.log`, `typecheck.log`, `lint.log`. 앞선 production build 뒤의 이 국소 변경은 위 직접 영향 검사로 재검증했으며 전체 build를 다시 실행했다고 표기하지 않는다.
- [x] 최종 보존: `final-data-proof.json`에서 재고·거래·조사 데이터 불변, 시험 회차 0개, 무결성/FK 정상. 바뀐 테이블은 로그인·감사·메뉴 설정·사용자 PIN 초기화·revision 알림에 한정됐다. 브라우저 console error 0개이며 기존 Next 이미지 비율 경고가 남아 있다. 새 코드 2파일과 현재 인수인계도 실행 증거 폴더에 별도 보존한다.

개발 서버와 김건호의 회차 관리 브라우저 탭을 열어 둔다. 임시 viewport를 복원하고 현재 PC 다크 화면도 `development-final.png`로 확인·보존했다. 직원 서버와 원본 QA에는 배포·DB 변경·재시작을 하지 않았다.

## 실제 개발 DB 20개 품목 업무 검증 — 2026-10-14 13:58 KST

사용자가 개발 DB의 임의 계수·재고 반영과 3명으로 나눈 20개 품목 완료·부분 종료를 명시 승인했다. 아래 수량은 이번 시험의 고정 시험 건수와 실행 스냅샷이며 제품 전체의 고정 수치가 아니다. 외부 증거: `C:/Users/user/.codex/stocktake-sandboxes/2026-10-14-main-integration/twenty-browser-20261014-1340/`.

- [x] 준비: 실행 직전 실제 개발 DB를 SQLite backup으로 `before.db`에 보존하고 품목·위치별 전후 기대값, 회차·직원 메뉴 설정을 `manifest.json`에 기록했다. 기존 활성 회차 `3b13e684aa2f49c49a5041aa45e9405e`(2026-10-14 개발서버 테스트 시작)를 그대로 사용했다. 새 회차·직원을 만들지 않았다.
- [x] UI 업무: 김건호 7개·14위치 → 이필욱 7개·14위치 → 김현우 6개·12위치. 모든 업무 명령은 인앱 브라우저의 입력·버튼으로 실행했다. SQL은 백업·조회 대조만 사용했다. 일반 작업자는 모바일 390·473px에서 실제 계수·확인·재고 반영을 완료했다.
- [x] 수량 종류: 현재값 유지, 정상 증가/감소, 정상→불량/B급/구형 재분류, 명시적 0 입력을 포함했다. 3번의 일괄 반영 미리보기에서 40개 위치×4분류의 현재/계수/차이를 기준표와 대조했다. `preview-1-7.json`, `preview-8-14.json`, `preview-15-20.json`.
- [x] 상태 보호: 미확인 입력이 남으면 계수 확인 버튼 비활성화, 입력 수정 후 확정, 다른 탭 이동·새로고침 후 초안 복원, 반영 검토 닫기 후 선택 유지와 재진입을 확인했다. 결과 불명이나 업무 실패는 발생하지 않아 영수증 복구를 강제로 재현하지 않았다. 정상 반영 증빙은 DB의 confirmation revision·count·actor·application line 연결로 대조했다.
- [x] 집계: 완료 20·대기 0, 확인/반영 위치 40. 작업자 품목은 김건호 7/7·이필욱 7/7·김현우 6/6이며 실셈 수량은 각각 2,196/2,196·11,655/11,655·3,714/3,714로 실제 입력 합과 일치했다. PC 공통 척도의 7개 막대는 동일한 332.5px, 6개는 285px(6/7)임을 DOM으로 확인했다. `three-workers-graph.json`.
- [x] 종료: 미확인 1,790위치가 남아 전체 종료는 보류되고 최종 버튼이 비활성화됐다. 부분 종료 사유 누락도 차단됐다. 지정 사유 “개발 서버 브라우저 검증 — 20개 품목 완료 후 부분 종료”로 13:53:07 KST 김건호가 부분 종료했다. 회차 종료 작업 이력·불변 증빙 및 새로고침·재로그인 후 유지 확인.
- [x] 최종 대조: `final-data-proof.json`에서 20품목/40위치의 계수·현재 재고·불변 반영 증빙이 모두 기대값과 일치했다. 변화량 0인 24위치도 반영 증빙을 유지했다. 미선정 품목의 재고/위치/POOL, 기존 거래/operation 행, 직원 역할/개인 메뉴 설정은 보존됐다. 무결성/FK 정상, readiness의 database/schema/inventory/ledger 모두 true. 시험 후 일관 DB도 `after.db`로 보존했다.
- [x] 메뉴 원상태: 시험 직전 사용자가 일괄 표시를 이미 ON으로 변경해 둔 상태였다. OFF→ON 버튼 동작을 확인한 뒤 최초 ON 및 직원별 숨김 비트를 그대로 유지했다. 과거 12:36 단계의 OFF 상태로 되돌리지 않았다. 계정 PIN·권한 변경은 수행하지 않았다.
- [x] 종료 환경: 개발 3001/8011과 직원 3000/8010, QA3147/8147은 모두 기존 PID로 실행 중이다. 임시 viewport를 해제하고 김건호의 종료 회차 진행·작업자 그래프 화면을 열어 뒀다. 브라우저 console error 0개. `final-result.png`, `ports.json`, `ready.json`, `console-errors.json`, `results.md`.

이번 실행에서는 제품 코드 수정이 필요하지 않았고, 관련 전체 테스트·빌드를 반복하지 않았다. 검증 결과는 실제 UI 업무, 수량/증빙 대조, 서버 무결성 검사에 대한 PASS다. 직원 서버·기존 QA 조작, 직접 업무 SQL 쓰기, 커밋·푸시·배포·워크트리 정리 없음. 변경된 시험 재고와 종료 이력은 승인대로 실제 개발 DB에 남긴다.
