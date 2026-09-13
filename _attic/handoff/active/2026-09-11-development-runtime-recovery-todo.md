# DEXCOWIN MES 개발서버 정상화 — 완료 기록

기준 시각: 2026-09-11 15:28 KST. 작업 기준 main/origin/main은 `bfede9d899c11aa276642ca8cad68f1f86adf523`이며, 이번 복구 변경은 미커밋 상태다.

후속 기록: 아래 내용은 15:28 복구 당시의 결과다. 이후 직원 프로필의 Node 선택도 보강했으며, production build와 전체 테스트의 추가 결과는 [예약 동기화 사전 준비 기록](2026-09-11-scheduled-sync-preparation-todo.md)을 따른다. 해당 후속 작업에서는 실제 직원 반영을 실행하지 않는다.

## 결론

개발서버의 설치 패키지를 현재 main의 Next.js 16.3.4·React 19.2.8에 맞추고, 개발 전용 Node.js 20.20.2로 재시작했다. 개발 백엔드의 과거 원장 호환성과 실패 요청 상태도 백업·복사본 검증 후 복구했다. 개발 프런트 3001과 백엔드 8011의 응답은 정상이며, 실제 인앱 브라우저에서 로그인·검색·입출고 진입·내역 펼치기·새로고침 후 로그인 유지까지 확인했다.

직원 서버·직원 DB·공용 Node 설치는 변경하지 않았다. 재고 수량·예약·거래 및 효과 원장 기록은 보존했다. 이번 확인은 개발서버 정상화 범위이며, 신규 변경의 전체 CI나 재고 업무 전수 검증 완료를 의미하지 않는다.

## 완료 목록

- [x] 설치 버전과 현재 코드의 불일치 확인 및 잠금 파일 기준 의존성 설치
- [x] 개발 전용 Node 20 실행 경로와 재시작 경로 검증
- [x] LAN 주소의 Next 개발 리소스 접근 복구 및 외부 Origin 차단 유지
- [x] 개발 DB 백업, 복사본 마이그레이션, 업무 데이터 해시 비교
- [x] 개발 DB에 정식 마이그레이션 적용 후 readiness와 독립 정합성 확인
- [x] 변경 영역 테스트, 타입 검사 및 읽기 전용 독립 리뷰
- [x] 실제 브라우저 로그인·조회·새로고침 검증 및 정상 대시보드 열어두기

## 원인과 변경

1. 코드·잠금 파일은 Next 16과 React 19였지만 실제 의존성 폴더는 Next 14 계열이었다. 로그인 gate의 React `Activity` 렌더 오류가 발생했다. 기존 `.next`를 보존하고 현재 잠금 파일로 `npm ci`를 수행했다. 서버 시작 시 개발 프로필만 Node 20을 검증하고 절대 경로로 실행한다. 직원 프로필의 기존 실행 방식은 유지한다.
   - `scripts/dev/runtime-control.ps1:432`, `README.md:66`
   - 로컬 실행 파일: `_attic/runtime/tools/node-v20.20.2-win-x64/node.exe`
   - ignored 설정: `_attic/runtime/frontend-node-path.txt`
2. Next 16 개발 서버가 LAN Origin의 폰트·개발 리소스를 차단했다. 개발 모드에만 현재 컴퓨터의 IPv4 주소를 정확히 허용했다. 와일드카드와 production 허용 설정은 추가하지 않았다.
   - `frontend/next.config.js:24`
   - 실제 LAN Origin의 폰트 요청 200, 외부 Origin을 붙인 동일 로컬 요청 403 확인.
3. 과거 v1 원장 활성화 시각이 v2 증빙 강제 기준에도 사용돼 과거 기록이 현재 차단 오류로 분류됐다. v1·v2 기준 시각을 분리했으며, contract version 2 이상 기록에는 엄격한 검사를 계속 적용한다. 일반 서버 시작에는 DB 쓰기를 추가하지 않았다.
   - `backend/app/services/inventory_operations.py:25`
   - `backend/app/services/inventory_integrity_engine.py:824`
   - `backend/app/services/inventory_integrity.py:728`
   - `backend/app/services/inventory_operation_activation.py:226`
4. 과거 실패한 요청의 부모 상태와 미실행 하위 행 상태가 불일치했다. 정식 마이그레이션 `20260911_0036`은 부모가 `FAILED_APPROVAL`인 요청의 `RESERVED`·`SUBMITTED` 행만 실패 상태로 정리하고 v2 기준을 한 번 기록한다. 완료 행·수량·예약·타임스탬프·원장 증빙은 수정하지 않는다.
   - `backend/alembic/versions/20260911_0036_legacy_ledger_boundary.py:1`

## 개발 DB 결과

- 복구 직전 schema `20260911_0035` → 적용 후 `20260911_0036`.
- 백업과 복사본을 먼저 만들고, 복사본 성공 후 개발 DB에만 적용했다.
- 과거 실패 요청의 하위 행 46개를 정리했다. 남은 동일 상태 불일치는 0개다.
- 의도한 행 상태·신규 기준값·schema 메타데이터를 제외한 업무 테이블 55개의 해시가 복구 전후 일치했다. 인증 후 신규 로그인 세션 생성은 이 데이터 복구 비교와 별개다.
- 최종 독립 검사: 차단 0개. 과거 v1 증빙 누락 경고 4,734개는 숨기거나 증빙을 만들어 채우지 않고 유지했다. 수량·예약·창고 위치·출하·불량·취소 등 나머지 검사 항목은 모두 0개다.
- 서버 `/health/live`, `/health/ready` 모두 HTTP 200.

위 수치는 이번 실행 시점의 검증 기록이며 제품 기준정보의 고정 개수가 아니다.

## 검증과 범위

| 검사 | 결과와 근거 |
|---|---|
| 마이그레이션 전체 | 최초 254건 중 217 통과·2 실패·35 PostgreSQL 생략. 실패는 새 head 추가에 따른 테스트의 이전 parent 예상값 2건이며 수정 후 해당 2건 모두 통과. 최초 실패 로그는 그대로 보존. |
| 실패 재검증 + 실행 환경·health 계약 | 30건 통과. 위 실패 2건의 재검증 포함. |
| 원장 활성화·신규 마이그레이션·배포 메타데이터 계약 | 45건 통과. v2 기준 최초 기록·보존·dry-run과 상태 변경 범위를 포함. 실제 배포는 수행하지 않음. |
| 서비스 정합성·승인·새 runtime 계약 | 직접 관련 pytest 묶음 통과. 기존 v1 경고와 v2 차단, 승인 동작 확인. |
| 백업 manifest 계약 | `test_sqlite_backup_publishes_manifest_last_with_exact_evidence` 통과. |
| 프런트 | `npm run typecheck:app`와 `node --test scripts/next-config.test.mjs` 통과. |
| 변경 공백 검사 | `git diff --check` 통과. |
| 독립 리뷰 | runtime과 원장 호환성 영역 읽기 전용 리뷰 완료. 차단 문제 없음. 리뷰에서 제안한 활성화 기준 보존·검증자 사후 조건은 반영하고 관련 테스트 통과. |
| 실제 브라우저 | 3001 로그인 성공, 검색 결과 및 검색 해제, 창고 입출고 방향 선택 화면, 내역의 작업 구성 펼치기, 대시보드 새로고침 후 같은 직원 세션 유지 확인. 마지막 화면은 정상 대시보드. |

테스트 묶음에는 중복 사례가 있으므로 행별 통과 수를 합산한 전수 수치는 사용하지 않는다. 복구 후 브라우저에서 요청 제출·승인·재고 변경을 실행하지 않았다. 이 변경의 PostgreSQL 검사, production build, 전체 프런트 테스트 및 GitHub CI는 아직 실행하지 않았으며 커밋·배포 전에 해당 범위를 확인해야 한다. 실제 30분 대기는 앞선 사용자 결정에 따라 수행하지 않았다.

## 증거와 남은 상태

증거 루트: `C:\ERP\_attic\runtime\dev-recovery-20260911` (ignored).

- `final-receipt.json`: 최종 시각·설치 버전·HTTP 결과·schema 및 테스트 실행 수.
- `final-integrity.json`: 익명화한 최종 정합성 집계.
- `mes-before-0036.db`, `mes-trial-0036.db`, `before-business-fingerprints.json`: 개발 DB 백업·복사본·비교 해시. 실제 데이터가 있어 로컬 ignored 경로에만 보존한다.
- `trial-migration.log`, `development-migration.log`: 정식 마이그레이션 기록.
- `migration-tests.xml`, `runtime-health-tests.xml`, `activation-tests.xml`, 관련 로그: 실패와 후속 통과를 구분한 실행 결과.
- `npm-ci.log`, `frontend-typecheck.log`, `diff-check.log`: 의존성·타입·공백 검사 기록.
- 브라우저 화면과 조작 증거는 이 작업의 인앱 브라우저 도구 결과에 남아 있다. 인증정보를 문서나 원시 trace에 저장하지 않았다.

`frontend/next-env.d.ts`의 `.next/dev` 경로는 Next 16 개발 서버가 생성한 로컬 변경이다. 별도로 존재하던 주간보고 Markdown·텍스트 변경은 수정하지 않았다. 이번 복구에서는 Git ref·index를 변경하거나 커밋·푸시·배포하지 않았다. 정상화한 개발서버는 계속 실행 중이다.
