# main 기능 동기화 후 별도 UI/UX 비교 작업 인계

## 현재 상태

**2026-09-11 브라우저 동등성 검증과 승인된 수정을 유지한 채 최신 main 5커밋까지 통합했다. 원 품질 70커밋은 최종 후보 `94afc622…`에서 70/70 모두 도달 가능하며, GitHub 전체 CI 6/6이 통과했다.**

통합 후보는 최신 main `76a56416…` 기준이다. 출하 재처리·BOM 1EA 증분·배포 검증·B급/구형 자재와 자동 부서 라우팅·번들 예산의 신규 5커밋을 모두 검토해 정상 merge했다. 사용자 지시에 따라 최종 검증 뒤 중간 승인 정지 없이 main fast-forward·push·main CI·정리까지 진행한다.

### 2026-09-10~2026-09-11 후속 진행

- [x] 고정 main과 품질 pending merge를 독립 합성 DB·포트·브라우저 세션으로 비교
- [x] 206개 시나리오에 증거 또는 미검증 이유 기록
- [x] 사용자 확정 문구, 30분 비활동 세션, 초안 보호, 창고·부서 결재 역할 분리 구현
- [x] 브라우저 비교에서 발견한 로그아웃·창고지도 편집 회귀와 최종 검토에서 발견한 IO 초안 조회 권한 누락 수정
- [x] 로컬 백엔드 영향 suite, 프런트 strict lint·타입·전체 테스트, production build·bundle 검사 통과
- [x] pending merge 완료와 기존 후보 생성; 원 품질 70커밋 전부 보존
- [x] 최신 main `76a56416…`의 신규 5커밋 검토·통합과 34개 충돌 해결
- [x] 통합 과정의 출하 exact 재고 셀, 양쪽 Alembic head, 보안 manifest 계약을 수정하고 표적 검사 통과
- [x] 코드 후보 `94afc622…`의 GitHub 전체 CI 6/6 통과 — run `34559821873`
- [x] 최종 보고서·검증표에 최신 main 통합 범위와 검증 증거 반영

이 active TODO의 구현·검증 항목은 모두 닫았다. 이어지는 main fast-forward·push·동일 최종 SHA의 main CI·증거 복사·브랜치와 워크트리 정리는 승인된 저장소 운영 절차로 연속 수행하며, 실제 최종 SHA·CI URL·clean 상태는 ignored `_attic/runtime/final-main-integration-20260911-102700/final-receipt.md`에 기록한다.

아래의 “커밋·푸시 및 브라우저 검증 미실행” 문장은 2026-09-08 동기화 직후의 역사적 스냅샷이다. 현재 사실은 위 후속 진행표와 `2026-09-08-main-quality-ui-parity-report.md`를 따른다.

- 작업 위치: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- 브랜치: `codex/full-code-quality-improvement`
- 동기화 전 품질 HEAD: `d4a3bb103b4491d5731537dd611936d417525fc3`
- 반영할 고정 **로컬 main**: `27e6c9dba5465d83f837788c12c89efc5bbf07fa`
- 공통 기준: `d2b0dd2969883b2c8876c4375c99a456dcb6f21e`
- 당시 `origin/main`: `03d8205443a62be539cb075882b01eeb68f64ac0`. 원격이 아니라 사용자의 최신 로컬 main을 기준으로 한다.
- main 변경 snapshot: 14커밋·146경로. 명령 원장은 `_attic/runtime/main-sync-20260908/main-delta-commits.txt` 및 `main-delta-paths.txt`.
- `git merge --no-ff --no-commit <고정 main>`으로 품질 쪽에만 반영했다. 시작 시 내용 충돌 22경로. **커밋·푸시는 승인받지 않았으므로 수행하지 않는다.**
- main 파일/index/DB와 개발·직원 서버는 변경하지 않는다. main이 이후 이동해도 이번 동기화에서 추가로 따라가지 않는다.

## 실행 체크리스트

- [x] 양쪽 clean 상태와 정확한 Git 루트/HEAD 확인, 로컬 main 고정
- [x] main→품질 방향 pending merge와 변경 원장 생성
- [x] 품질 내부 Node 20 의존성 재설치 및 Python 의존성 검사
- [x] 의미 단위 충돌 해결과 자동 병합된 위험 경로 확인
- [x] OpenAPI/생성 타입과 통합 직접 검사
- [x] 명세 검토 후 독립 품질 검토
- [x] 최종 pending merge 상태·검증 한계·다음 작업 인계 기록

실제 실행 결과는 아래와 같다. 이 체크리스트는 코드 동기화 범위의 완료이며, main 통합·배포 승인이나 전체 UI/UX 동등성 판정이 아니다.

## 최종 결과와 검증 한계

- 최초 충돌 22경로를 해결했다. main 신규 기능을 품질 워크트리의 실제 파일에 반영했지만 **HEAD는 이전 품질 SHA 그대로이고 MERGE_HEAD에 고정 main이 남아 있다.** 다음 작업은 HEAD만 checkout하거나 새 worktree를 HEAD에서 만들어 이 결과라고 취급하면 안 된다.
- main HEAD는 `27e6c9dba5465d83f837788c12c89efc5bbf07fa`, main working tree는 최종 읽기 전용 확인에서도 clean이었다.
- 코드·테스트·생성 파일과 새 인계 문서를 병합 index에 정리했다. 최종 snapshot은 staged 150경로, 미해결 충돌·unstaged·untracked 각 0이다. merge commit은 사용자 승인 전 만들지 않는다. 새 브랜치·푸시·PR·배포는 없다.
- 백엔드·프런트 각각 명세 검토 후 독립 코드 품질 검토를 수행했고, 이번 결합 회귀의 최종 Critical/Important/Minor는 0이었다. main 자체의 통계 오류 focus/alert 미흡은 별도 후속 확인점으로 남긴다.
- 작업자 또는 관리자 계정을 생성하거나 사용하지 않았다. 실제 main/직원 DB를 복사·연결하지 않았으며 canonical 품질 `backend/mes.db`도 생성하지 않았다. 테스트용 합성 자료와 로그는 ignored runtime 내부에만 남긴다.
- 개발·직원 서버 및 비교용 애플리케이션 서버를 시작·중지하지 않았다. 새로운 포트의 실제 브라우저 비교도 수행하지 않았다.

| 검사 | 실제 결과 / 범위 |
|---|---|
| 백엔드 직접 서비스 / API·라우터 | 각각 132 / 321 PASS. 이후 두 결합 수정은 별도 직접 회귀로 검증 |
| 초안 reroute 재시도 / 기존 지문 보호 | RED→GREEN 및 관련 6 PASS; 내용 변경 409·직접 submit 계약 보존 |
| 불량 잠금 순서 / bulk | RED→GREEN 및 관련 9 PASS; 실제 PG 경합은 별도 미실행 |
| 프런트 충돌 인접 / 불량·API | 각각 113 / 145 PASS |
| 마지막 인증 복원 경합 / 로그인 | RED→GREEN 및 마지막 로그인 62 PASS. 앞선 프런트 묶음과 중복되므로 합산하지 않음 |
| App TypeScript / E2E TypeScript | PASS. E2E 타입 검사는 실제 E2E 실행이 아님 |
| OpenAPI | 실제 `app.openapi()`와 정본 exact 비교 PASS, raw frontend 타입 재생성 해시 불변 |
| 번들 스크립트 문법 | 두 파일 node syntax PASS; 2.82 MiB 한도 및 단위 유지 |
| 번들 단위 명령 | **실행 2 FAIL / FAILED_ENV**: `.next-prod/static/chunks` 빌드 산출물 없음. PASS 또는 미실행으로 바꾸어 기록하지 않음 |
| 문서 | 변경 핵심 문서·인계 문서 링크 검사 PASS; 전체 docs gate와는 구분 |
| Git 정리 | staged/working `git diff --check` PASS, 충돌 0, 커밋·푸시 0 |
| 미실행 | production build/실제 bundle 판정, 전체 local gate, CI, 실제 PostgreSQL 두 연결 경합, Playwright 실행, 브라우저 비교 |

최종 main 병합 전에 다음 작업에서 빌드·번들·필요한 전체 검증과 PostgreSQL 경합을 확인해야 한다. 이번 부분 검증을 release-ready로 확대 해석하지 않는다.

실행 명령·exit code·로그·해시·병합 정리 대상은 `_attic/runtime/main-sync-20260908/implementer/verification-receipt.md`를 따른다. 독립 리뷰는 같은 runtime의 `backend-quality-review.md`, `frontend-quality-review.md`에 있다. 이 runtime은 Git 비추적이므로 다른 컴퓨터에서 문서만 받아 실행 결과가 모두 존재한다고 가정하지 않는다.

증거 한계: API/라우터 321 PASS의 결과 로그와 종료 결과는 남아 있으나 당시 선택 인자 전체는 복원하지 못했다. 따라서 이 수치를 특정 endpoint의 전수 검증 근거로 쓰지 않으며, 후속 검증에서는 선택 목록을 다시 명시하고 원본 명령도 로그에 보존한다.

## 동기화 정책

main의 최신 기능과 품질의 안전장치를 함께 유지한다. 한쪽 파일 전체를 선택해 다른 쪽 변경을 지우지 않는다.

- main: 품목코드 기반 IO 자동 부서 경로, 조회 실패 재시도, BOM 로딩/실패 중 잘못된 품목 추가 차단, 다부서 요청 표시, 불량 다건 처리/통계/분류 필터, 출하·대시보드·주간 개선.
- 품질: 실제 서버 작업자 세션과 PIN 변경, 로그아웃 pending, 행위자 검증, 멱등 재시도, 원장 행 귀속, 공통 가용량/예약, 물리 위치 원장, 전용 취소, dirty/save/비동기 generation, 접근성, 출하 pagination, 생성 API 타입.
- 주간 동결 화면은 main에 이미 승인 반영된 결과를 가져오고 이번에 추가 변경하지 않는다. 모바일 하단 탭/pill과 출하 step 5 카드의 시각 배치를 새로 다듬지 않는다.
- 기존 migration을 다시 쓰거나 새로운 업무 정책을 만들지 않는다. main delta에는 migration 파일 변경이 없다.
- 직원 운영 스크립트 변경분은 소스 통합 대상일 뿐이다. 실제 직원 동기화/배포/readiness 명령은 실행하지 않는다.

## 격리 환경

- 품질의 `frontend/node_modules`를 `npm ci`로 재설치했다: Node 20.20.2, npm 설치 exit 0, audit 0. 기존 패키지 deprecation 경고는 유지한다. Python 3.12.0 `pip check` 통과.
- shell 준비 파일: `_attic/runtime/main-sync-20260908/environment.ps1`. 정확한 cwd와 Git 루트를 확인하고 TEMP/cache/합성 DATABASE_URL을 품질 워크트리 내부로 제한한다.
- ignored `backend/.env`는 상위 main의 `.env`를 탐색하지 않도록 차단하는 로컬 파일이며, 합성 DB URL만 담는다. 환경 준비 파일도 `PYTHON_DOTENV_DISABLED=1`을 설정한다.
- 이전 실수 삭제로 없어졌던 canonical `backend/mes.db`는 아직 복원하지 않았다. 다른 작업의 보관 DB를 이 원본이라고 사용하거나 main/직원 DB에서 복사하지 않는다.
- 이번 단계에서는 브라우저, 실제 서버, 계정 생성, 배포를 실행하지 않는다. 테스트 DB가 필요하면 ignored 임시 합성 DB만 사용한다.

## 다음 별도 작업의 목적

사용자 목적은 main에 반영하기 전에 직원이 느끼는 **어색함·불편·예상 밖 동작 차이**를 찾는 것이다. 코드 병합 성공이나 unit test만으로 UI/UX 동등성을 선언하지 않는다.

검증 작업은 이후 별도로 만든다. 이 문서를 읽었다는 이유만으로 자동 main 병합·배포를 시작하지 않는다.

### 비교 기준 고정

- 실제 개발 서버가 어떤 버전/빌드를 제공하는지 먼저 **읽기 전용으로** 확인한다. Git main HEAD와 실제 실행 버전이 같다고 추정하지 않는다. 기존 서버를 재시작해 맞추지 않는다.
- 품질 비교 환경은 이 문서의 pending merge 결과를 사용한다. HEAD만 보면 이전 품질 커밋이므로 MERGE_HEAD 및 실제 working tree를 함께 확인한다.
- 로그인, 관리자 인증, 저장/취소, 오류/재시도, 버튼 비활성·로딩, 모달 focus 복귀, PC/모바일을 비교한다.
- 기존 품질 작업에서 의도적으로 추가한 보안 확인·오류 안내·접근성 개선과 실제 회귀를 구분한다. 화면이 달라 보인다는 이유만으로 인증·재고 안전장치를 제거하지 않는다. 사용자가 불편을 느낄 수 있는 의도된 차이도 보고한다.

### 업무 체크 범위

1. 로그인 성공/실패/재시도, 새로고침, 세션 복원, 로그아웃 및 다른 탭에서의 상태 변화
2. 모든 화면의 주요 컴포넌트 클릭·선택·모달·탭·뒤로 이동, dirty 저장/취소, 로딩/오류/빈 상태
3. 결재 요청 생성·자가승인/일반승인·반려·취소·중복 클릭·재시도와 요청 목록/상세 표시
4. 창고/부서 입출고, 자동 부서 경로, BOM·부족품목 가져오기, 품목 전환/조회, 재고 위치와 수량 갱신
5. 출하 목록/더 보기/준비/픽업/각 취소, step 5 카드 배치·스크롤과 구성품 표시
6. 불량 격리·정상 복귀·다건 처리·통계 기간/분류 필터·요청 실패 후 선택 상태
7. 일일작업일보의 작성자 전환, 날짜/탭/상세 토글, 저장/이동·오류 흐름
8. 관리자 인증 이후 접근 가능한 각 설정·관리 화면의 실제 기능 목록을 먼저 만들고, 빠짐없이 비교

### 서버와 데이터 보호

- 개발·직원 서버에 영향을 주지 않는다는 기존 사용자 조건을 유지한다. 특히 `C:\ERP-dev`는 읽기·검색·해시·DB·프로세스·포트 확인까지 금지다.
- 실제 개발 서버에서 재고·결재·관리자 설정을 바꾸는 전수 시험은 이번 승인에 포함됐다고 추정하지 않는다. 실서버에서는 비변경 관찰만 하고, 양쪽의 mutation 비교가 필요하면 **고정 main 코드의 별도 격리 기준 환경과 합성 DB**를 준비하는 방식을 우선한다.
- 테스트 데이터는 합성 namespace로 구분하고 실제 사용자/직원 데이터와 혼합하지 않는다. 기존 개발/직원 DB를 그대로 복사하는 방법은 임의 사용하지 않는다.
- 테스트 프로세스는 고유 포트·PID·종료 소유권을 기록한다. main/직원 포트를 가져오거나 전역 종료 스크립트를 실행하지 않는다.

### 로그인 정보

- 사용자는 김현우 작업자 계정과 관리자 인증으로 확인할 의사를 밝혔다. 실제 PIN은 대화에서 받은 정보를 별도 작업에 안전하게 전달하며 **추적 문서에는 저장하지 않는다.**
- 격리 DB에 필요한 관리자 계정이 없다면 사용자 승인 범위 내에서 **격리 합성 DB에만** 준비할 수 있다. 이번 동기화 단계에서는 계정을 생성하지 않는다.
- 작업자 PIN 및 관리자 인증 성공 여부를 현재 확인한 것으로 표시하지 않는다.

## 소스 검토 중간 기록

- 백엔드 최종 정적 명세 검토는 `sr_execution.py`와 `test_io_v2.py` 안정본까지 포함하여 Critical/Important 0이었다. 승인·자가승인 live reroute, B/Z/U 선락, 다건 불량 exact 검증과 원장 행 연결을 확인했다. 별도 코드 품질 검토 및 API 검사는 이 판정과 구분한다.
- 백엔드 직접 서비스 검사: `implementer/backend-services-green.log`에 `132 passed in 23.78s`를 확인했다. API·프런트·브라우저 또는 전체 gate 통과를 뜻하지 않는다.
- 백엔드 API/라우터 직접 검사: `implementer/backend-api-focused-green.log`에 `321 passed in 35.66s`를 확인했다. 초기 서비스 7건/API 9건 실패와 수정 후 재검사 로그는 같은 `implementer/`에 보존했다. 전체 gate와 PostgreSQL 경합 재실행 결과로 확대 해석하지 않는다.
- 후속 독립 품질 검토에서 두 결합 회귀를 검증/수정 대상으로 분리했다: (1) 승인 중 자동 부서 정규화 이후 draft submit 지문 불일치, (2) exact 불량 요청 생성과 bulk 정상복귀의 Item/Record 잠금 순서 역전. 이 단계의 132/321 PASS는 두 후속 수정 이전 기준선이다. 최종 수정 검증과 재검토 결과를 별도로 확인해야 한다. 실제 PostgreSQL deadlock을 재현한 기록은 아니다.
- 위 두 건은 국소 수정과 직접 RED/GREEN 후 독립 재검토에서 해소됐다(Critical/Important/Minor 0). 서버가 정규화한 부서만 지문 갱신을 허용하고 실제 payload 변경 409/direct submit 계약을 유지했다. exact 불량 경로는 Item→Record 순서를 사용한다. 증거: `backend-quality-review.md`, `implementer/draft-reroute-replay-*.log`, `draft-fingerprint-regression.log`, `defect-lock-order-*.log`. **실제 PostgreSQL 두 연결 경합은 NOT_RUN**이며 최종 main 병합 전에 후속 검증해야 한다.
- 프런트 직접 검사: `implementer/frontend-focused-attempt-2.log` 최종 결과는 10파일·113테스트 PASS였다. 로그인 세션 조회에도 main의 timeout/retry를 적용하고, 자동 부서 지정 E2E의 제거된 수동 부서 버튼 선택을 실제 preview 계약으로 바꿨다. 실제 브라우저/E2E 실행 PASS를 뜻하지 않는다.
- 프런트 정적 명세 최종 검토는 Critical/Important 0이었다. 기존 main 통계 오류 focus 미흡은 후속 비교 대상으로 남겼다. 독립 코드 품질 검토는 별도 결과로 기록한다.
- 동결 및 migration 경계 확인: 주간 production 파일은 고정 main blob과 같고(테스트 fixture 제외), 모바일 Shell/globals.css 및 Alembic/bootstrap은 동기화 전 HEAD 대비 diff 0이었다. 출하 step 5 배치는 별도 UI 소스 검토로 main 결과 보존을 확인했다.
- 변경 핵심 문서 `ARCHITECTURE.md`, `CONTEXT.md`와 이 인계 문서는 유지 문서 링크 검사 exit 0을 확인했다. 전체 docs gate 실행 결과는 아니다.
- 자동 병합된 UI의 별도 읽기 전용 검토에서는 출하 pagination/history generation과 step 5 배치, 불량 목록 최신 응답/다건 오류 무효화, 통계 stale 응답 차단, PC·모바일 BOM 조회 성공 전 차단 및 preselect generation, BOM API adapter가 유지됨을 확인했다. 로그인·수동 충돌 해결 파일과 실제 화면 검증은 이 중간 검토에 포함하지 않았다.
- 운영 스크립트 자동 병합은 읽기 전용으로 별도 검토했다. `scripts/dev/sync-to-employee.ps1`의 수동 실행 활동 가드와 승인된 예약 wrapper의 우회, `scripts/ops/employee_schema_preflight.py`의 모델 docstring-only 예외 및 격리 snapshot 검사는 함께 남아 있다. 이 소범위에서 확인된 결함은 없었다. **운영 스크립트 또는 직원 환경 검증을 실행했다는 뜻은 아니다.**
- 두 변경 PowerShell 파일(`sync-to-employee.ps1`, `auto-sync-to-employee.ps1`)은 PowerShell Parser의 `ParseFile`로 문법 오류 0을 확인했다(exit 0). 파일 내용은 실행하지 않았다.
- 미해결 병합 마커 때문에 발생한 Python collection SyntaxError는 초기 병합 상태의 기록이며, 신규 업무 로직의 실패 테스트나 제품 결함으로 집계하지 않는다.
- 다음 UI 비교 확인점: 신규 `DefectStatisticsView.tsx`의 조회 실패 안내는 main 원본과 동일한 일반 안내 영역으로, 공용 `LoadFailureCard`와 달리 alert/focus 처리가 없다. 이는 이번 병합으로 생긴 회귀가 아니므로 동기화 범위에서 수정하지 않는다. 다음 작업에서 키보드·스크린리더로 확인하고 필요 시 별도 개선 판단한다.

## 이전 품질 증거와 워크트리 정리

CP1~CP7 완료 증거는 기존 감사 문서와 `_attic/runtime/code-quality-improvement/20260907-cp6-cp7-supervisor/quality-closeout-final-receipt.json`에 있다. 이번 main 동기화 결과는 그 이전 CI 통과 SHA와 다르므로, 이전 PASS를 새 통합 결과의 PASS로 재사용하지 않는다.

정리된 CP6/CP7/repair 작업의 자료 경로는 `_attic/runtime/worktree-cleanup-20260908/README.md` 대응표를 따른다. 이력에 적힌 옛 작업 폴더를 무심코 다시 실행하지 않는다.
