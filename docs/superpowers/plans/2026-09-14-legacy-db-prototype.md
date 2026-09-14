**추천 모델: GPT-5.6 Sol** — 취소 원장과 현재 업무 상태의 의미를 보존해야 한다.
**추천 추론 수준: Extra High** — 스키마 적합성만으로 취소·재시도 정합성을 증명할 수 없다.
**실행 방식: 순차 구현·독립 검토** — 부모가 격리 후보를 만들고 별도 검토자가 원장 변환을 검토한다.

# 금요일 구조 DB 변환 복제본 검증

**GOAL:** 품질개선 코드와 오늘 변경을 별도 브랜치·워크트리에 보존하고, 현재 직원 데이터와 필요한 수정이 유지되는 금요일 기준 메인으로 복원한다.

## 2026-09-14 사용자 승인 변경

현재 단계는 위 전체 목표의 선행 검증이다. 사용자는 운영 DB를 건드리지 않고 별도 복제본에서 `금요일 DB 구조 + 최신 업무 데이터` 변환을 만들어 검증하는 방향을 승인했다.
현재 DB 구조 유지 조건을 **격리 후보에 한해** 완화한다. 메인·원격·직원 환경 전환은 이 단계에서 하지 않는다.
기존 원장을 삭제하거나 복구를 재실행하지 않는다. 새 구조에 담지 못하는 원본 정보는 검증된 원본 증적 DB에 전부 보관하며, 제외 항목을 명시한다. 운영 기능에 필요한 정보가 제외되면 후보는 부적합이다.

## 실행

- [x] `76a56416`의 canonical bootstrap으로 빈 DB 생성: head `20260910_0033`.
- [x] `scripts/ops/tests/test_legacy_db_candidate.py`를 먼저 실행해 누락 구현으로 실패 확인.
- [x] `scripts/ops/build_legacy_db_candidate.py`: 읽기 전용 원본, 새 출력 폴더 전용, 원본 hash 검증, 공통 열의 최신 행 전체 이식, 원본 증적 복사, FK·행 hash 검증.
- [x] `py -m pytest scripts/ops/tests -q` 통과: 20 tests (2026-09-14). 입력의 비어 있지 않은 WAL/journal 거절 및 immutable 읽기로 입력 sidecar 미생성 검사 포함.
- [x] 직원 백업에 이관 도구 적용. schema metadata는 실제 금요일 schema template의 값을 유지하고 현재 DB revision을 위조하지 않음.
- [x] 구버전 판독 불가 취소 효과 41건의 등가 변환 구현. 판독 통과만으로 안전 취소를 주장하지 않음.
- [x] 최신 PIN을 재설정하지 않고 유지하는 최소 PBKDF2 읽기 검증 지원 테스트·구현. 신규 PIN 해싱 정책은 아직 Friday SHA256이며 운영 승인 사항이 아님.
- [ ] 오늘 필수 업무 수정(원자재 권한·작업 선택 보호·custom BOM 양방향·취소 재시도) 이식.
- [ ] 후보의 기동·조회 불변성, 승인·반려·신규 입출고·기존 취소·재시도·출하 검증. 김종숙 9품목 미완료 상태 유지.
- [ ] 독립 검토와 결과 보고. 운영 전환 가능 여부와 남은 차이를 명시하며 목표 전체 완료로 오인하지 않음.

## 불변식

운영 DB·기존 검증 백업·schema template은 변경하지 않는다. 재고 및 예약을 거래 재실행으로 재계산하지 않고 현재 상태를 복사해 중복 반영을 피한다.
필수 열·FK·원장 의미 검증이 실패하면 후보를 배포하지 않는다. 현재 데이터 전체 보존을 단순 거래 이력 보존으로 축소하지 않는다.

## 2026-09-14 격리 검증 중간 결과

- 후보 runtime backend/frontend만 `76a56416`으로 복원했다. main과 직원 배포는 변경하지 않았다. 후보 HEAD는 기존 main `a0cf0809`이며 새 복원 커밋은 아직 없다.
- 원본은 12:27 KST 검증 백업이다. 이후 직원 업무는 포함하지 않는 시점 복제본이므로 전환 시 최종 온라인 백업이 반드시 필요하다.
- 빈 canonical schema는 실제 직원 DB에는 없는 FK 때문에 실패(378건)했다. 데이터를 삭제하거나 FK를 수동 제거하지 않았다. 실제 09-11 08:10 직원 백업 복제본을 Friday canonical bootstrap으로 0032→0033 업그레이드한 `old-schema-from-employee.db`가 `employee_legacy_20260720` profile 검사에 통과했다.
- `candidate-projection-03`: 공통 업무 52테이블의 모든 행을 최신 값으로 대체하고 다중집합 hash·FK·SQLite integrity 검증. Friday 백업의 오래된 업무 행을 남기지 않는다.
- `candidate-friday-dialect-01`: B/Z 배치 전체 0, W와 U의 품목별 현재 수량 일치, W/U 전후 수량 및 delta 일치를 모두 검사한 후 41개 로그의 중복 U 셀만 제외했다. W/location, contract_version=2, 모든 reverses 연결과 다른 모든 값은 불변. 원본 전체는 인접 `source-evidence.db`에 보존한다.
- `legacy-read-probe-02`: 후보 backend의 기동 및 조회 6개 HTTP200, 전체 table 행 불변, 정합성 진단0, 기존 effect 4,343개 판독 통과. 이 결과는 신규·승인·출하 전체 검증을 대신하지 않는다.
- `cancellation-probe-01`: 최신 미취소 V2 작업27개를 격리 rollback-only transaction에서 시험.22개는 실제취소·계획재고검산·정합성0·중복취소차단 통과.5개는 재고부족(1개는 불량원장잔량 조건 포함)으로 정상 차단. 전체 시험 transaction 롤백 후 원본 후보와 모든 table 행 일치.
- 오늘 취소/복구 상태를 오판하던5개 문제는 기존 최신효과/후속취소/즉시IO 최종상태 해석 helper만 이식해 해결. historical effect JSON이나 업무 상태를 고쳐 맞추지 않았다. 관련3개 테스트파일33건 통과.
- 원자재 `receive_supplier`의 신규/초안/공통실행 경로에 창고 정·부 권한검사를 이식했다. 미리보기/초안저장은 아직 허용되며 제출 때 재검사한다. 일반 RAW_RECEIVE 요청 전체 정책이나 현재 세션 인증 체계를 이식했다는 뜻이 아니다.
- 부모 검토에서 `ship + receive_supplier` 직접 제출의 우회가 재현되어, 원자재 세부유형에는 `work_type=receive`를 먼저 요구하도록 좁게 보강했다. 잘못된 유형조합422, 정상유형 비권한403, 배치/재고/원장 불변을 확인했고 기존 `internal_use + receive_supplier`422 계약도 유지했다. 관련 IO API/dispatch 테스트파일 전체 통과.
- 취소·IO·예약·StockRequest·출하 서비스, IO/출하/작업 API의 직접관련 기존 테스트 묶음도 통과. PostgreSQL 포함 최종 gate, 실제 모바일↔PC 브라우저, 동부하 성능 비교, 직원DB 복제본의 신규·승인·반려·출하 전체 업무 검증은 미완료다.
- 독립 요구사항 검토는 위 DB투영·PIN·상태해석 프로토타입 범위에서 승인했다. 전체 운영 승인과 원자재 권한 후속포트 검토는 포함하지 않는다.
- 작업 시작 시 보존한 main 파일2,635개의 hash를 다시 대조해 변경0을 확인했다. main HEAD `a0cf0809` 및 원래 작업 상태106개 항목 그대로다.

## 화면 보호 이식 대기 목록

실제 렌더 경로를 확인했으며 다음7개 파일의 오늘 보호 hunk만 후보로 좁혔다. 보호 hunk는 아직 이식하지 않았다. 이후 사용자가 직접 시험하도록 localhost 격리 서버를 시작했다(아래 후속 기록 참조).

- `_warehouse_v2/useIoWorkState.ts`: 작업유형을 실제 선택하기 전에는 Step1 진행 금지.
- `_warehouse_v2/useIoUrlSync.ts`: 늦게 도착한 URL snapshot으로 새 선택을 되돌리지 않음.
- `_warehouse_v2/useIoDraftRestore.ts`: canRestore를 autosave/state/goTo보다 먼저 검사.
- `_warehouse_v2/IoComposeView.tsx`, `mobile/warehouse/MobileIoComposeWizard.tsx`: 진입/복원 권한 및 사전 선택 품목 보호 hunk만. 파일 전체 복사 금지.
- `mobile/warehouse/MobileWorkTypeStep.tsx`: 선택 전 aria-pressed=false.
- `mobile/MobileShell.tsx`: 같은 탭에서도 dirty 확인, flush 완료 후 URL 초기화. 동결된 nav/pill 디자인은 그대로.

custom BOM 프런트의 방향 판정은 Friday와 보존본의 `ioWorkType.ts`가 동일하므로 추가 이식 근거가 없다. 백엔드 custom BOM 양방향/재시도는 별도 검증이 남았다. 품질개선의 pending-command 하위 시스템은 이번 최소이식에서 제외한다.

## 운영 전환 전 미확정 사항

1. Friday 취소는 해당 요청을 종결하고 새 요청으로 재처리한다. 현재 같은 요청 재승인을 유지하려면 예약/실행 정책 추가 이식이 필요하다. 사용자에게 선택 질문을 보냈으며 아직 확정하지 않았다.
2. Friday-only 원장 표현을 현대 코드에 그대로 연결하면 안 된다. 향후 재승격은 W→W/U 역변환과 새로운 Friday 거래의 증적 처리가 필요하다.
3. 향후 박스·구역 배치 시 `B+activeZ <= W` 조건을 Friday 코드가 항상 강제하지 않는다. 초기 후보 B/Z=0 증명은 미래 모든 배치·취소의 안전 증명이 아니다.
4. `npm ci`로 확인한 Friday Next.js14.2.3에는 Windows 원격 코드 실행 취약점(CVE-2026-75604)이 있다. 공식 수정 버전은15.5.24 또는16.3.3이며14.x 수정판은 없다. 보존본16.3.4는 이 advisory 수정 범위에 포함된다. 구버전 서버는 localhost 시험용으로만 시작했으며 LAN/운영에는 노출하지 않았다. 이후 사용자가 보안 수정 실행 기반 사용을 명시 승인했다(아래 후속 기록 참조).
   - 공식 근거: https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36

모든 private 검증 파일은 `C:/ERP/_attic/runtime/rollback-pre-quality-20260914/` 아래이며 DB/비밀설정은 Git에 넣지 않는다. 이 문서는 운영 승인 또는 전체 GOAL 완료 보고가 아니다.

## 독립 코드 품질 검토 후속

현재 고정 후보는 추가 격리 실험 가능 판정이나, 변환기를 운영 반복 실행용으로 사용하기 전 다음을 보강해야 한다.

- Important: W/U JSON `row_id`→품목 및 거래 `item_id` 동일성 자동검사. 현재41건은 별도 읽기전용 실측으로 모두 일치하나 도구 자체의 거절 조건에는 아직 없다.
- Important: 검증된 template hash를 필수 인자로 받아 고정하거나 actual DDL/profile/fingerprint를 직접 검증. 현재 실제 template은 Friday bootstrap 및 별도 대조에 통과했지만 generic 도구는 revision0033만 검사한다.
- Minor: offline 입력 전제에 더해 출력 확정 직전 WAL/journal 재검사, 부분 산출물/receipt 원자적 공개, 최종 폴더에 1단계 receipt 사본 포함.
- 해결: SQLite immutable 읽기를 사용해 입력 옆 sidecar 생성을 막고, 비어 있지 않은 WAL/journal 입력을 거절하는 회귀 테스트2건을 추가했다. 이미 존재하던 진단용 sidecar를 지우지는 않았다.

품질 검토에서 PIN 읽기 호환 및 상태 부활 방지에는 추가 결함을 찾지 못했다. 전체 운영 전환·미완료 UI/업무 검증을 승인한 결과가 아니다.

## 2026-09-14 사용자 시험 후 검증 재개

- 사용자가 후보 화면을 직접 시험하고 계속 진행해도 좋다고 응답했다. 이후 질문에 `보안 수정 버전으로 진행`을 명시적으로 선택했다. Friday UI/업무 흐름을 유지하면서 Next16.3.4/React19.2.8 및 필요한 설정·타입 호환만 별도 검증한다. 품질개선 전체 재병합 승인이 아니다.
- 사용자 시험 환경은 `http://127.0.0.1:3014/mes`, backend8014이며 두 프로세스 모두127.0.0.1 바인딩이다. DB는 `manual-test-20260914-1337/manual-test.db`: golden 후보를 추가 복제한 시험 전용이다. 기동·GET 전후54테이블 행 불변 및 원후보 SHA 불변을 확인한 뒤 사용자에게 열었다. 사용자 입력을 직원 DB로 반영하지 않는다.
- 사용자 서버/DB는 그대로 유지하고, 자동 검증과 보안 실행 기반 수정은 별도 private 폴더/새 DB 복제본에서만 진행한다. 기존 개발3001/8011과 직원 배포는 변경하지 않는다.
- 13:52 KST 최신 직원 온라인 검증백업: `employee-validation-02/backups/sqlite/mes-before-rollback-validation-latest-20260914-135236-ceb49ca7.db`, SHA256 `5ad61c2e2609435b106982fd7b480bf41304ebef3ee9914166581e353768deb7`. schema/SQLite/FK/재고 blocking0. 12:27본 대비 operator_sessions/data_revision/activity_audit_logs만 달라졌고 업무 테이블은 동일하다. 감사로그3행도 새 변환 입력에 포함한다.
- 읽기 성능 비교는 동일한12:27 업무 상태로 현행→후보→후보→현행 순서의 로컬 ASGI 측정이다. 각 경로 동시4요청/측정12회, 총4실행의 기동·조회 후 모든 DB 행 불변. `performance-{current,candidate}-{01,02}/report.json`에 결과 저장. 작업단위 이력 p50은 현행2333/3092ms, 후보1341/1534ms였으며 품목 조회는 일관된 개선이 없었다. 네트워크·실사용 부하 합격 증거로 대체하지 않는다.
- **운영 차단 확인 사항:** 동일 DB의 생산 가능량이 후보에서104개 더 크게 나온다. 출하 예약3품목의2+2+100개와 일치한다. Friday `stock_math.available`는 ShippingAllocation을 차감하지 않지만 현재 코드는 차감한다. 원본을 변경해 숫자를 맞추지 않는다. 일반 업무가 예약재고를 소비할 수 있는지도 별도 복제본에서 검증 중이다.
- 변환기 중요 보강2개(W/U row→품목 동일성, caller의 trusted template SHA 필수)는 TDD 구현 및 부모 재실행26테스트 통과 후 독립 요구사항/품질 검토를 통과했다. 품질 검토의 Minor인 missing/비문법 row_id 부정 테스트4개도 추가해 최종30테스트/Ruff 통과. 운영 전체 승인이 아닌 새 격리 후보 구성 도구로의 승인이다.
- 보강한 도구로13:52 백업을 `candidate-latest-projection-01`→`candidate-latest-friday-01`에 재변환했다.52공통 업무 테이블 보존, 원장41건 등가변환 및 나머지 값 불변 검증 통과. 최종 DB SHA256 `e1e502c484865b665aece15d5d0fa28764f917b6c4246d186b85686b246c6ac0`; 원본 증적 SHA256는 최신 직원 백업과 일치한다. 기존 golden 및 사용자 시험DB를 교체하지 않았다.
- **출하 예약 중복소비 재현:** `reserved-transfer-probe-01/report.json`에서 실제 출하 위치100/예약100인 품목의 `transfer_to_warehouse(1)`이 성공해 위치99/예약100이 됐다. 외부 transaction 전체 롤백 후 모든 테이블 원복을 확인했다. 이어 `workflow-checks-02/quick-overlap-03/result.json`에서는 실제 IO API의 `process/adjust_out`, manual12개 preview200/shortage0, submit201/completed로 위치88/예약100이 되어 API 도달성까지 확인했다. API 시험도 새 복제본에서만 실행했고 golden 원본은 불변이다. 소스와 DB 사본을 이용해 예약 보호 최소이식을 시작했으며 live 사용자 후보 파일에는 아직 반영하지 않았다.
- 보안 실행 기반 및 출하 예약 보호 검증 소스는 `security-runtime-01/source/{frontend,backend}`이다. frontend는 Friday archive, backend는 live 후보의 파일 복제본이며 별도 의존성과 DB만 사용한다. 부모 검토 후 필요한 변경만 후보 워크트리에 통합할 예정이다.
- 보안 frontend 중간 검증: 계약3테스트, TypeScript, strict lint 통과로 보고됨. React hooks 신규 규칙은 보존본과 동일한 legacy-equivalence 설정만 적용하여 Friday UI의 대량 리팩터를 하지 않는다. 전체 Vitest의 DefectHubPanel1건 실패를 분리 진단 중이며 build/브라우저 검증 및 부모 재검증은 아직이다.
- 예약 보호 backend 중간 검증: 실제 예약을 무시하는 이동/가용량/capacity 실패 테스트3건의 RED 확인, 해당 출하의 자기 예약 픽업 양성 경로는 기존 코드에서 통과. 이 기록은 수정 완료/전체 GREEN 보고가 아니다.
- 현재 `verify_local -Mode smart -PlanOnly`는 복원 범위 때문에 전체 게이트를 요구한다. 실제 게이트는 이 기록에서 실행/통과한 것이 아니다. PostgreSQL 검증 환경 부재 및 구버전의 검사 구조 차이는 최종 확인 대상이다.
- 메인 HEAD는 `a0cf0809`, 원래106개 작업 상태 유지. 새 복원 커밋, push, 직원 DB 교체/배포는 아직 하지 않았다.

## 2026-09-14 직원 환경 적용 요청 후 진행

- 사용자는 직원 서버를 의도적으로 정지했다고 확인했다. 임시로 직전 품질 버전을 재기동하지 않고 금요일 후보 완성·검증 후 적용/기동하도록 지시했다. 8010/3000 listener 없음, supervisor는 13:30~13:31 명시 stop 요청으로 stopped인 것을 확인했다. 부모는 재기동 명령을 실행하지 않았다.
- 보안 runtime private 후보 Next16.3.4/React19.2.8은 구현자 기준 build/type/lint 및 production audit0. 전체 Vitest 2596/2598: 추출본 상위 scripts 누락1건, 병렬실행 한정 비결정적1건. 아직 통합 전체 게이트 통과를 의미하지 않는다.
- 출하예약 보호 private backend 구현자 검증: 관련514테스트 통과, 실제 일반IO12개 제출422/재고100·예약100 불변. 실제 prepare/pickup 뒤 서비스 취소/재시도는 PICKED_UP→PREPARED→PICKED_UP 및 배정 CONSUMED→RESERVED→CONSUMED 확인. 부모가 독립 요구사항 검토를 요청했다.
- 사용자 시험 candidate에서 custom produce/disassemble child route 반전 두 결함을 실제 API로 확인했다. io_dispatch.py 최소 이식과 기존 저장 요청 의미 불변 테스트를 별도 담당자가 진행한다. 오늘 UI의 선택/URL/초안 보호도 private frontend에서 진행하며 동결 디자인을 변경하지 않는다.
- 부모는 기존 직원 supervisor가 요구하는 /health/ready가 Friday 후보에 없음을 확인했다. private backend app/main.py에 DB ping, 실제 Friday bootstrap schema 검사, 물리재고 진단, 취소/예약 원장 진단을 모두 수행하는 read-only readiness를 추가했다. 404 RED5건 후 관련 health 테스트13건 통과. 최신13:52 변환본의 추가 복제본 readiness-validation-01에서는 readiness 포함7경로200, 전54테이블 행 불변, 원장문제0 및 기존effect4343판독을 확인했다. 기동 성공만 반환하는 우회가 아니다.
- 운영 도구 호환성은 아직 검증 중: 현재 sync-to-employee는 source C:/ERP와 최신 migration 흐름에 고정돼 있으며, 현대 backup/restore는 inventory-integrity/v1 contract를 요구한다. Friday 진단 응답과 다르므로 기존 명령을 무작정 실행하거나 structural-only 옵션으로 검증을 우회하지 않는다. 실제 직원 DB 변환 설치/실패 복귀 절차는 후보 검증과 별도로 확인해야 한다.
- 이 기록 시점까지 실제 직원 코드·DB·서비스, main HEAD/원격은 그대로다. 사용자 시험3014도 그대로다.

### 후속 검증 — 보안 후보 통합

- 부모 재실행 frontend 전체 Vitest 2,607/2,607 통과(`security-runtime-01/frontend-final-vitest.json`). 보안 production 배포 준비 도구의 install/build/bundle 단계도 `rb-release/bab138342adef042bb5a8d58c37d37de3996f56d142af93ffe8e313e904d4488`에서 READY. 직원 설치는 하지 않았다.
- 독립 검토의 모바일 동일 탭 reset 잔존 상태 및 Node 최소 버전 문제를 수정했다. Next가 next-env.d.ts를 다시 생성하는 계약 때문에 static 파일 고정 방식은 폐기하고 `next typegen && tsc --noEmit`을 추가했다. 부모 typecheck 및 runtime 계약 3개 통과. 이 마지막 설정을 포함한 새 release 준비가 진행 중이다.
- 사용자가 3015 격리 환경에 직접 로그인했다. 대시보드·입출고 내역 화면에서 오늘 정상 거래, 취소 및 재처리 이력 표시를 확인했다. 실제 모바일 제출→PC 자동 갱신 검증 완료를 뜻하지 않는다.
- Friday 백업 검증은 현대 pure evaluator의 실제 전체 체크를 유지하되 `friday-0033` 명시 profile에서만 implicit 미배치와 신규 scope/delta 원장을 해석하도록 구현 중이다. 가짜 U행/전후 수량을 합성하지 않는다. 기존 원장에 선택 필드가 있으면 실제 identity와 수량을 엄격히 검사한다.
- DB 변환 설치에는 양측 코드의 FULL 검증과 최신 원본 일치 증명, 배포·DB 전환을 묶은 복구 기록이 필요하다. 표준 restore의 내부 함수를 검증 없이 호출하거나 STRUCTURAL_ONLY로 우회하지 않는다. 아직 운영 설치 절차는 완료되지 않았다.

### 최종 통합 준비 후속

- 최종 frontend release `rb-release/149c7b79f83ea2150ce4f4775c9cb39e8295f1a542988f194344abdc1b42cd01`의 install/build/bundle READY 및 build 후 runtime 계약3개 PASS. 독립 frontend 검토 Critical/Important0으로 승인했다.
- 3014/8014는 후보 워크트리 통합을 위해 부모가 명시적으로 중지했다. PID/포트/부모 프로세스 관계를 확인한 뒤 해당 시험 프로세스만 중지했으며 DB는 보존했다. 3015/8015 격리 검증 서비스와 직원 중지 상태는 그대로다.
- 검토된 frontend 변경을 rollback 워크트리에 통합했다. 줄바꿈만 다른 파일은 내용 동일성을 선행 확인해 검증 원본의 줄바꿈으로 맞췄다. 실제 배포 도구로 release와 워크트리 source 전체 hash 일치 검증 exit0, 워크트리 npm ci exit0.
- 격리3015의 모바일 UI에서 게터1개 부서 입고 승인 요청을 제출했다. batch `1e6fb9c3911847109c0ce523a687310f`가 submitted이며 재고/위치/기존 거래·원장/출하 행은 불변이다. 새 요청·알림·감사 행 및 data_revision만 변경됐음을 `verification-server-01/mobile-submission-verification.json`에 기록했다. 같은 로그인 세션의 PC 레이아웃과 새로고침 뒤 요청 표시를 확인했다. 별도 PC 탭 로그인/자동 갱신은 아직 대기 중이다.
- 현재 직원 DB에 대해13:52 FULL 백업의 freshness를 부모가 다시 검증해 PASS/errors없음 확인. 이는 전환 직전 최종 백업을 생략한다는 뜻이 아니다.
- `weekly-validation-01/result.json`: 최신 후보의 별도 복제본에서 실제 주간 스냅샷 예약 script exit0, 기존54테이블 불변, golden SHA 불변. 주간보고 화면/동결 코드는 변경하지 않았다.
- 검증 설정을 Friday full pytest/OpenAPI 및 frontend lint/typegen+tsc/coverage/build/bundle/E2E 범위로 정렬했다. 삭제된 quality 파일을 요구하는 Ruff/mypy/PG runner·별도 타입 gate만 제외하고, Node20/ESLint9/Next typegen/필수 E2E 실패 처리/실 DB 환경 변수 차단/기존 runtime 격리 가드는 유지한다. 정책 테스트 RED→GREEN 및 직접 전체 묶음 exit0 확인. 새 운영 DB admission은 별도 구현·검증 중이며 full 통합 gate는 아직 미실행이다.

### 통합 검사 및 전환 도구 후속

- 검토된 private backend 28개 파일을 rollback WT에 통합하고 실제 앱에서 OpenAPI baseline을 재생성했다. 직원 DB 연결 없이 in-memory 설정으로 생성했다.
- 최초 통합 backend 검사: 2,036 PASS / 119 FAIL / 5 SKIP / 수집 오류1. 대다수 실패는 보존한 현대 운영 도구와 복원된 Friday 운영 테스트의 계약 차이이며 정렬 중이다. 수집 오류는 실행 중 새 admission 모듈이 아직 생성되기 전 테스트 수집과 겹친 것이다. 이 결과는 배포 승인 아님.
- 실제 회귀도 발견했다: 구형 출하 픽업 취소에서 부서 예약 증분을 창고 셀에 잘못 적용해 사후 검산 실패. 독립 검토와 최소 수정 진행 중이며 해결 전 전환하지 않는다.
- 창고 권한 강화에 필요한 테스트 계정 역할을 WT 동시성/거래 취소 픽스처에 명시했다. production 권한 완화는 없다. 주간보고 범위 테스트2개는 당시 열린 주간이라는 조건을 날짜 고정으로 명시해 월요일 이후에도 같은 조건을 검증한다. 동결 주간보고 코드는 변경하지 않았고 해당 파일 전체43개 PASS.
- 개발 전용 이력 예제 도구는 금요일 서비스 서명과 맞는 Friday 버전으로 복원했다. 예제 데이터를 직원 DB에 쓰지 않았으며 해당 테스트4개 PASS.
- 통합 frontend strict lint/typegen+tsc PASS, coverage 실행은 2,606 PASS/1 FAIL. 출하 이름의 비동기 반영 전에 검사한 테스트1개를 실제 이름 반영까지 기다리도록 수정하고 직접 재검증 중이다. 기존 release149는 이 마지막 테스트 변경을 포함하지 않으므로 새 source hash에 대한 재준비가 필요하다.
- 공개 code install 단계를 기존 frontend release 도구에 추가했다. pinned source와 이전 코드 백업을 검증하고 DB/설정을 제외한 backend/scripts를 반영하며 실패 시 기존 공개 rollback으로 코드를 복구한다. 임시 디렉터리의 DB/설정 보존·소스 변조·직원 코드 drift·migration 경계·복사 실패 복구5개 PASS. 실제 직원 환경에는 실행하지 않았다.
- DB forward admission은 양측 public FULL 검사 및 원본 동등성/변조/최신성/교체 실패 복구 테스트6개 PASS로 보고됨. 성공 후 재개 전 health 실패에 대한 명시적 reverse recovery 경로는 추가 작업 중이다. 아직 운영 설치/기동/메인 커밋·push는 없다.

### 최종 전환 준비 후속 증거

- frontend 전체 coverage 재검증: 276개 파일, 2,607개 테스트 PASS (`integrated-frontend-coverage-03.log`). 커밋 `4d24e186ea3447ddcdf26d28faa5e34278433f39`는 출하 기능 변경이 아닌 헤더 비동기 렌더 대기 테스트 한 줄 수정이며, 해당 수정도 반영했다.
- 최종 frontend 준비 release는 `C:/ERP/_attic/runtime/rb-release/f839a9c16f62cc3aa267901ca8d87650f640c0a889ea8a7a3db0d69f8825cf6a`이며 build/bundle READY이다. 실제 설치 직전 source 일치 검증은 별도로 수행한다.
- 출하 픽업 취소의 예약 위치 검산을 실제 allocation 위치에 맞춰 수정했다. 직접 관련 검사 37개 PASS. 운영 도구 테스트 정렬은 아직 진행 중이며 전체 backend 통합 성공을 뜻하지 않는다.
- 8015 격리 backend를 rollback WT 코드로 재기동한 뒤 `/health/ready` 200 및 54개 테이블 불변을 확인했다 (`verification-server-01/final-backend-startup-verification.json`). 직원 8010/3000은 아직 중지 상태다.
- 16:21 직원 FULL 백업 `C:/ERP-dev/_attic/runtime/backups/sqlite/mes-before-before-friday-cutover-20260914-20260914-162103-c95af441.db`의 SHA256은 `5ad61c2e2609435b106982fd7b480bf41304ebef3ee9914166581e353768deb7`이며 13:52 백업과 동일하다.
- 위 백업에서 다시 생성한 Friday 후보 SHA256은 `e1e502c484865b665aece15d5d0fa28764f917b6c4246d186b85686b246c6ac0`이다. 공개 FULL 후보 백업은 `C:/ERP-dev/_attic/runtime/backups/sqlite/mes-before-friday-candidate-20260914-20260914-162342-16580d73.db`에 보존했다. 직원 DB 교체는 아직 하지 않았다.
- `friday-integrated-proof-02`는 실제 격리 입고 및 FULL 15개 검사 통과 증거다. 이후 bootstrap 호환 및 검증 번들 범위가 변경되어 코드 해시가 달라졌으므로, 배포 승인에 재사용하지 않고 최종 코드로 새 증거를 생성해야 한다.
- 공개 코드 설치/복구 연결 테스트 15개 PASS. 실제 DB를 사용하는 공개 순방향·역방향 전환 리허설은 별도로 수행한다. 재개 후 새로운 업무 데이터가 생겼다면 과거 DB로 복구하지 않는다.
- 구형 box 원장은 현재 삭제된 box의 과거 품목 식별 정보를 완전히 보유하지 않는다. 기존 해석의 이 한계는 명시적으로 남기며 데이터를 추측해 보충하지 않는다. 후보에는 B 효과가 없어 해당 모호성으로 새 행을 만들어내지 않았다.
- 추가 업무 회귀 계약 문서를 보존 브랜치 커밋 `3537ef3b`에 저장했다. 문서 전용 smart staged 검사 통과. main 복원 커밋 및 직원 적용 완료와는 별개다.
- 이후 갱신된 계약과 인수인계 후속 TODO도 문서 게이트 통과 후 `14e8f0f9`에 보존했다. 이는 후속 기능을 이번 롤백에 구현한다는 뜻이 아니다.
- 최종 검증 번들 `c2109481f1d39a54bac2c72eeb1e44e6016515093a57bbb18ae53f43f82cc77e`로 `friday-integrated-proof-03/final-proof-receipt.json` PASS. 실제 격리 입고 전후 FULL 차단 오류 0, 음수·예약 초과·잘못된 효과 차단 및 실패 후 54개 테이블 불변, golden 후보 불변을 확인했다. 기존 V1 효과 누락 경고 645건은 그대로 기록하며 임의 복구하지 않았다.
- 사용자가 별도 탭에 로그인한 뒤 3015 탭3(모바일 390px)에서 검증 메모 `독립 PC 자동갱신 1647`의 게터 1개 승인 요청을 제출했다. 탭2(별도 세션, PC 1928px)는 제출 전 해당 메모 0개, 제출 후 새로고침·화면 이동 없이 표시됨을 확인했다. DB batch `9d96f6c81f79430b85a5e01a324bc9ed`는 submitted이고 기존 재고·거래·원장·출하는 불변 (`verification-server-01/independent-pc-mobile-verification.json`).
- 오래된 탭2는 새로고침 시 재로그인 화면으로 전환됐다. 해당 로그인은 8015 재기동 전 것이며 Friday 로그인 게이트는 boot_id 변경 시 재로그인을 요구한다. 새 로그인 탭3은 새로고침 후에도 로그인과 요청 데이터가 유지됐고 PC 레이아웃에서 표시를 확인했다. 별도 PC 자동 갱신 증거와 새 로그인 세션의 새로고침 증거를 구분한다.
- 실제 직원 frontend install-preflight는 읽기 전용으로 exit0. 필수 staged smart 전체 검사와 E2E는 `final-staged-gate-01.json` 대상으로 실행 중이며, 실행 도중 정렬한 테스트는 재-stage 및 해당 검사 재확인이 필요하다. 이 단계는 직원 적용 완료가 아니다.
- 후속 보존 커밋 `60e045b3`에 최신 업무 계약 보완을 저장했다. 실제 main 전환 직전 변경 누락 여부를 다시 확인한다.
- `final-staged-gate-01.json`은 종료 코드 1이다. frontend lint/typecheck는 통과했지만 coverage는 2,602개 통과/5개 실패였고 backend 전체 검사도 실패했다. E2E와 이후 단계의 통과 증거로 사용하지 않는다. frontend 실패는 비동기 데이터 대기와 테스트 mock 초기화 3파일을 보강한 후 관련 84개 검사가 통과했다. 부분 coverage 실행은 전역 커버리지 기준 미달로 종료 코드 1이므로 전체 성공으로 해석하지 않는다. 전체 frontend coverage를 `final-frontend-coverage-02.log`로 재검증 중이다.
- `startup-writer-fence-proof-01/proof-receipt.json` PASS: 격리 WAL clone에 BEGIN IMMEDIATE를 유지하면서 실제 앱 lifespan과 readiness 200, 경쟁 writer SQLITE_BUSY, 54개 테이블 및 golden SHA 불변을 확인했다. startup 캐시 write 시도는 잠금으로 약 10초 지연된 뒤 내부 경고 처리된다. 이 증거는 운영 기동 완료가 아니라 전환 중 쓰기 차단 방식의 격리 실험이다.
- 공개 역방향 복구 리허설은 행 동등성 통과 후 독립 검토에서 WAL 동시 변경과 전체 스키마 비교 보강이 필요하다고 판정했다. 보강 및 재검증 전까지 해당 복구 증거를 최종 운영 승인으로 사용하지 않는다. 직원 DB와 운영 코드는 아직 전환하지 않았다.
- `final-frontend-coverage-02.log`: 최종 전체 frontend 276파일/2,607테스트 PASS, 종료 코드 0, statement/line 93.23%, branch 91.35%, function 89.07%. 테스트 mock 초기화와 비동기 화면 대기 보강 후 전역 커버리지 기준도 통과했다.
- backend의 이전 실패 캐시를 현행 테스트로 재확인했다. 구형 노드명 4개를 현재 대응 계약으로 구분한 5개 검사 PASS (`final-gate-five-repro-01`), 현존 비-activation 실패 노드 7개 PASS (`final-gate-seven-repro-01`, JUnit failures/errors/skipped 모두 0). 전체 backend 명령 재실행 성공과는 구분한다.
- OpenAPI를 현재 앱에서 생성해 Friday baseline과 비교한 별도 명령 종료 코드 0.
- `final-e2e-01.log`는 실패 후 중단했다. 보안 업데이트된 Next 개발 서버에서 127.0.0.1 origin의 HMR 연결이 차단되어 빈 화면이 재현됐고, 같은 서버 localhost 주소에서는 로그인 화면이 표시됐다. 운영 보안 설정을 완화하지 않고 E2E frontend 접속 주소만 localhost로 정렬했다. 첫 실행의 8021/3100 listener가 모두 종료된 것을 확인한 뒤 `final-e2e-02.log`로 재검증 중이다.
- `final-e2e-02.log`: 화면 자동 검사 19개 PASS, 1.5분, 공개 `verify_e2e.ps1` 종료 코드 0, 전용 테스트 환경 정리 및 8021/3100 listener 종료 확인. 관리자 탐색, 불량 건별 처리, 승인, 생산·원자재 입고, 내역, 데스크톱·모바일 수량 보정을 포함한다. 주소 정렬의 별도 검토도 blocking 없음이며 runtime 관련 단위 검사 4개 PASS.
- 17:25경 main의 변경·미추적 108개 경로와 quality-preserved 워크트리의 파일 존재/실제 SHA256을 다시 대조해 누락·해시 차이 0을 확인했다. 관련 `핵심 기능 상호작용 테스트` 작업도 현재 idle/completed를 조회했다. main 전환 바로 전에는 새 변경 여부를 다시 확인한다.

### 금요일 대비 남기는 수정과 이유 — 최종 후보 기준

| 구분 | 남기는 변경 | 이유 |
| --- | --- | --- |
| 실행 기반 | Next 16.3.4 / React 19.2.8, 해당 타입·ref 호환, Node 20 | 사용자가 승인한 보안 수정 기반에서 Friday 화면을 실행한다. |
| 작업 권한·선택 | `IoComposeView`, `MobileIoComposeWizard`, `useIoDraftRestore`, `useIoWorkState`, `io_preview`, `io_dispatch` | 원자재 작업의 권한 없는 진입·복원을 막고 작업을 선택하지 않은 채 기본값으로 진행하는 것을 막는다. |
| 화면 상태 보호 | `useIoUrlSync`, `MobileShell` | 늦은 URL snapshot이 진행 단계를 되감지 않게 하고 같은 탭 재선택도 저장 확인을 거친다. 모바일 하단 탭의 동결된 시각 디자인은 변경하지 않는다. |
| 커스텀 BOM | `io_dispatch`의 낱개 효과 및 승인 경로 정규화 | 상위 참조를 실제 재고로 중복 반영하지 않으며 저장된 입고·출고 방향을 유지한다. |
| 예약 재고 | `stock_availability` 및 입출고·생산·불량·출하·조회 소비 경로 | 실제 후보에서 재현한 출하 예약 재고의 중복 소비와 생산 가능량 과대를 막는다. 원본 재고를 재계산해 맞추지 않는다. |
| 취소 검산 | `inventory_operation_cancellation` 및 원장 효과 해석 | 현재 재고와 출하 예약을 함께 검사하며 픽업 취소 시 실제 배정 부서에 복원되는 예약을 검산한다. 오늘 복구를 재실행하지 않는다. |
| PIN 읽기 | `pin_auth` | 현재 직원의 보존된 PIN 해시를 읽는다. 직원 PIN을 일괄 초기화하지 않는다. |
| 기동·운영 검증 | read-only readiness, FULL 무결성 검사, 검증 백업·변환·복구·배포 도구 | DB 버전을 속이거나 기동 검사만 우회하지 않고 실제 Friday 스키마와 현 업무 행·원장 정합성을 확인한다. |
| 검증 코드 | 위 변경의 회귀 검사, 비동기 렌더 대기, 운영 도구 계약 정렬, E2E localhost origin | 업무 assertion을 생략하지 않고 최종 실행 기반에 맞는 검증을 유지한다. |

- 업무 화면은 `76a56416`을 기준으로 하되 위 필수 수정이 남으므로 해당 커밋과 완전히 동일한 바이너리는 아니다.
- 품질개선 전체, 현대 operator-session/pending-command 하위 시스템, 후속 인수인계 기능은 재병합하지 않는다. 현대 원본 DB와 그 메타데이터는 검증된 원본 백업에 보존한다.
- 보존 브랜치 최신 `60e045b3`의 전체 Git 이력을 `preservation/quality-preserved-60e045b3.bundle`에도 저장했으며 `git bundle verify`가 전체 이력 유효성을 확인했다.
- `codex/quality-preserved-20260914`를 일반 push로 원격에도 보존했다. `git ls-remote`의 해당 branch HEAD는 `60e045b3c465fa07c23173920570784ad337e0a0`로 로컬과 일치한다. 이 브랜치는 미검증 작업도 포함한 복구용 스냅샷이며 운영 승인본이 아니다.

### 최종 전환 도구 검증 후속

- 새 운영 release `C:/ERP/_attic/runtime/rb-release/1a90e1c7ccc62dddca40e4c9d06c06d943319925770b0e598a9fa0a9996662c4`: 공개 prepare 종료 코드 0, READY. production compile/TypeScript 및 bundle 검사 PASS (`final-release-prepare-02.log`). 실제 직원 설치는 아직 실행하지 않았다.
- 복구 비교는 WAL-aware snapshot을 먼저 고정하고, 열린 구간의 DB/WAL 세대, 전체 schema fingerprint, sqlite_sequence 및 전체 행을 비교하도록 보강했다. 정상 WAL 최초 열기로 생기는 빈 WAL은 동시 쓰기로 오인하지 않으며 실제 동시 commit·스키마·sequence 변조는 차단하는 회귀 검사를 추가했다.
- `public-cutover-rehearsal-01/receipts/recovery-receipt-secure.json` PASS, SHA256 `2e6f79a3a37bd83bd3e0f75b81975c0956cbd4f0fd1b398fe8604cf428e8738a`. 격리 target-secure에서 공개 0036→0033 전환, 복구 검증, 공개 0033→0036 역복구가 종료 코드 0이며 원본과 복구본의 전체 논리행 digest는 `a4b32e7de5dd90ee98db0df446dbe2b94a4928febb03f71d9751427062e63ace`로 같다. 운영 대상의 admission으로 재사용하지 않는다.
- activation 독립 검토의 추가 지적 네 건(실제 설정 DB와 fence 대상 동일성, 새 프로세스 기동, 설치 frontend hash binding, HTTP redirect 차단)은 보강·재검토 중이다. 이 지적 해소 전에는 운영 기동을 승인하지 않는다.
- 위 네 건은 보강 후 독립 재검토에서 모두 폐쇄됐다. 준비 artifact와 설치 파일을 대조한 뒤 journal에 기록하며, 실제 설정 DB 일치·fresh stop/start·redirect 거절·쓰기가 차단된 confirm을 검사한다. 관련 44개 검사 PASS. 최종 activation 도구 SHA256은 `00a4cfd73272aacda17214d0a7baad576046b14cd4ef424c74a302a5c0c8163b`이다.
- `final-backend-03.junit.xml`: 전체 2,576개 중 2,520 PASS, 56 SKIP, 실패 0, 오류 0, 실행 종료 코드 0. skip은 PostgreSQL 환경 등 개별 선행 조건이며 PostgreSQL 운영 검증 성공을 뜻하지 않는다. 전체 frontend 2,607 PASS, E2E 19 PASS, production build/TypeScript/bundle PASS, OpenAPI 일치, 문서 도구 15개 중 1개 symlink 권한 skip 외 PASS 및 링크 검사 PASS를 함께 확보했다. 실패했던 첫 smart gate가 성공한 것으로 기록을 바꾸지 않고 이후 각 해당 명령의 재검증 증거로 대체한다.
- 최종 직원 FULL 백업: `C:/ERP-dev/_attic/runtime/backups/sqlite/mes-before-final-friday-cutover-20260914-20260914-175219-5da56bbc.db`, SHA256 `dc97df4e568b587a04f20932aaf6fbb05f59a74e1fa005a137b7716343a96caf`. manifest의 schema/FK/SQLite/verification PASS 및 blocking 0. 16:21 원본 백업과 database 증거 객체 전체가 동일하고 기존 현대 V1 경고 4,797개도 동일하다. artifact 바이트 hash 차이는 업무 행 변경의 증거가 아니며 실제 전환 admission에서 다시 전체 행을 대조한다.
- 백업 실행 첫 호출의 runtime 경로 지정으로 `C:/ERP-dev/backups/sqlite/mes-before-final-friday-cutover-20260914-20260914-175056-5df00ae6.db`에도 검증된 추가 복구본이 생겼다. 삭제하지 않았으며 운영 전환에는 위 표준 `_attic/runtime` 경로의 최종 백업을 사용한다. 원본 직원 DB는 변경하지 않았다.

### 복원 커밋 이후 최종 동시성 보강

- 복원 후보를 `0aacf11a85ecee327f42821d7d56ea6c8e46df71`로 커밋했다. main과 직원 환경은 아직 전환하지 않았다.
- 커밋 직후 독립 검토에서 target snapshot 고정과 파일 세대 측정 사이의 `sqlite_sequence` WAL commit을 놓치는 경로가 재현되어 전환을 보류했다. 앞선 secure 복구 리허설만으로 최종 승인하지 않는다.
- 읽기 전용 keeper로 WAL 파일 생명주기를 안정화한 다음, 파일 세대 기준을 snapshot 고정보다 먼저 측정하도록 최소 보강했다. snapshot 직후의 실제 sequence commit 회귀와 idle WAL 정상 경로를 포함해 독립 표적 5개 PASS, 부모의 해당 테스트 파일 전체 25개 실행 종료 코드 0, diff-check PASS를 확인했다. 전체 장시간 게이트를 다시 통과했다고 주장하지 않으며 마지막 복구 변경의 직접 검증 결과로 기록한다.
- 개발 서버 3001/8011은 표준 stop 명령 종료 코드 0으로 중지했다. 직원 3000/8010도 listener 없음이다. 예약 작업 중 실행 중인 DEXCOWIN MES 작업은 없으며 다음 DB 백업은 22:00, 주간 snapshot은 2026-09-21 00:00이다.

### 직원 전환 실행과 기동 대기 보강

- `30958f5f`까지 main에 fast-forward 반영하고 일반 push 및 원격 SHA 일치를 확인했다. main의 기존 108개 변경은 보존 브랜치와 해시 차이 0을 재확인한 뒤 stash `a2fbfbb93035a76153dead4e1646b4d1fd3c3717`에도 추가 보존했다.
- keeper 수정 후 격리 공개 순·역방향 리허설과 부모의 복구 receipt 재검증이 PASS했다. `public-cutover-rehearsal-02/receipts/recovery-receipt.json` SHA256은 `9b9d1b978075f02c97af9cfbfcad7007addb04bbce8bb88930c6db020cdfe2de`이다. 최신 복구 파일 테스트 26개 PASS이며 마지막 추가 회귀도 부모가 직접 재확인했다.
- 실제 직원 admission `employee-cutover-admission-01.json` SHA256 `3d2da967a7dae49893204d8efa93d6158eb53cda1610b139b40f43f9a11d7667`: 양측 FULL/원본 최신성 PASS. frontend install, code install, begin-friday-cutover, Friday DB restore 모두 종료 코드 0이었다. 배포 journal은 `C:/ERP-dev/_attic/runtime/frontend-releases/77d679f71e1441ddac7f13d2945c9026/journal.json`이다.
- 실제 activation은 두 번 모두 외부 기동 명령의 짧은 6회 readiness 대기 때문에 실패했다. 앱은 각각 18:26:40, 18:30:41에 실제 `/health/ready` 200을 기록했으나 시작 명령은 먼저 대기 횟수를 소진했다. 두 번 모두 안전 경로가 포트를 정지했으며 직원 쓰기는 재개하지 않았다. 세 번째 동일 재시도는 하지 않는다.
- 원본으로의 공개 writer-fenced 복구는 종료 코드 0/PASS이다. `employee-recovery-after-startup-timeout-01.json` SHA256 `af3e8a669aae4b051407aea0394ab98573bdb1c61e461a2705a852d0c8fe2bd2`, 원본과 복구본의 전체 논리 해시 `a4b32e7de5dd90ee98db0df446dbe2b94a4928febb03f71d9751427062e63ace`가 일치한다. 검증된 receipt를 사용한 공개 코드 복귀를 진행한다.
- 수정은 `start-backend.ps1` 외부 readiness 시도 횟수 6→90 한 줄이다. 기존 liveness 대기와 같은 충분한 시도 예산을 주며 `/health/ready` 200 요건, 각 요청 제한, 최종 실패 throw를 유지한다. 계약 테스트 두 줄도 정렬했다. 전체 장시간 게이트 재통과로 표기하지 않고 직접 관련 Python 9개, PowerShell runtime 계약 및 구문 검사 증거로 확인한다. 실제 재배포와 기동 성공은 별도 확인 전까지 미완료다.

### 최종 완료 — 2026-09-14 18:50:56 KST

- `b2ab4f95` 수정본을 일반 push한 뒤 새 FULL 백업·admission으로 재배포했다. 실제 직원 기동 명령 종료 코드 0 및 `FRIDAY_ACTIVATION_RESULT=CONFIRMED`, journal `CONFIRMED`, backend live, readiness 200, 공개 MES 200, 직접·프록시 boot ID 일치를 확인했다.
- 실제 직원 DB revision은 `20260910_0033`이다. 오늘 업무 데이터와 복구 결과를 유지했으며 미완료 작업을 임의 처리하지 않았다.
- 최종 보존 경로, 남긴 수정, 검증 범위와 인계 사항은 [완료 보고](2026-09-14-friday-cutover-result.md)에 정리했다. 위의 미완료·실패 기록은 당시의 역사 증거이며 최종 상태와 구분한다.
