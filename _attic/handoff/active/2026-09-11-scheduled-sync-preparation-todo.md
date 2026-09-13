# DEXCOWIN MES 예약 동기화 사전 준비

> **2026-09-12 후속 정정:** 아래 9월 11일 수동 실행 결과는 유효하지만, 9월 12일 예약 에이전트가 정상 코드 결과를 놓쳐 데이터 단계를 건너뛰었다. 예약 전체 완료의 근거로 확대하지 않는다. [결과 인계 오류 복구](2026-09-12-scheduled-sync-result-recovery-todo.md)에서 단일 진입점과 실행별 영속 기록으로 보완한다.

## 2026-09-11 후속 복구 및 실제 동기화

**현재 판정: 직원 코드 반영·직원→개발 데이터 동기화 완료, 예약 경로 확인 완료.** 2026-09-11 23시대 KST 기준. 네 서비스가 정상이며 기존 매일 04:00 KST 예약은 유지한다. 다음 예약은 **2026-09-12 04:00 KST**다.

사용자가 즉시 동기화와 자율 복구·재발 방지 수정을 승인했다. 직원 서버는 전체 백업 검증, 원장 활성화, 사후 검사와 정식 기동으로 복구했다. 실제 재실행에서 드러난 기동 경로의 짧은 readiness 제한도 수정했다. 최종 코드 래퍼는 `NO_CHANGES / exit 0`, 데이터 단계는 `APPLIED / exit 0`이며 새 release journal도 `CONFIRMED`다. commit/push는 수행하지 않았다.

복구 증거 루트: `C:\ERP\_attic\runtime\sync-recovery-20260911-221600` (실제 DB·로컬 로그 포함, 외부 공유 금지).

- [x] 직원 서비스 복구: 전체 검증 백업 `mes-before-post-migration-activation-20260911-221602-99580627.db` → `_verify_backup.py` PASS → 정식 활성화 → 재고 차단 오류 0 → 서비스 HTTP 200 → journal 확정. `activation-backup-verify.log`, `activation.log`, `employee-health.json`, `employee-status.log`, `confirm-release.log`.
- [x] 백업 계약 재발 방지: 구조 전용 백업과 활성화용 전체 백업을 분리했다. 자동 생성 백업도 활성화 전에 재검증한다. 정지 전 복사본 검사에 전체 백업·활성화 dry-run을 추가했다. `recovery-tests.xml` 115건 통과, 실제 구형 schema 복사본 `old-schema-preflight.log` 통과.
- [x] 데이터 교체·헬스 오류 수정: 정지 전 백업은 보존하고 정지 후 전체 백업을 교체·복구 기준으로 사용한다. 이후 실제 변경 감지와 writer fence는 유지했다. 백엔드 readiness는 재고 진단 시간을 고려해 10초·6회로 조정했고 프런트는 `/mes`를 확인한다. `sync-final-tests.xml` 73건, 최종 변경의 `sync-final-boundary-tests.xml` 4건 통과. 검사 묶음은 중복되므로 합산하지 않는다.
- [x] 수정본 코드 반영 및 최종 journal 확정: `code-fixed-apply.log`에서 마이그레이션·전체 백업·활성화는 성공했지만 이전 기동 helper의 2초 제한으로 exit 6이 났다. 원인을 확인한 뒤 검증된 기동 스크립트를 백업·해시 확인과 함께 반영하고 정식 stop/start로 복구했다. `startup-repair/receipt.json`, `startup-recovery.log`, `employee-final-health.json`, `confirm-final-release.log`. 최종 journal: `C:\ERP-dev\_attic\runtime\frontend-releases\d32f36e10d0f486292bbb910b9557c3a\journal.json`, `CONFIRMED`.
- [x] 직원→개발 DB 실제 적용·정합성·최종 서비스 확인: `data-final-apply.log` exit 0 / `APPLIED`. schema `20260911_0036`, SQLite/FK PASS, 재고·예약·출하·불량·v2 원장 차단 오류 0. 직원 스냅샷→검증 후보→개발 DB의 57개 테이블 내용이 모두 일치했다(`snapshot-candidate-comparison.json`, `candidate-development-comparison.json`).
- [x] 매일 04:00 KST 예약 경로와 최종 보고 확정: 기존 `automation` ACTIVE 유지, 일정·프롬프트 수정 없음. `scheduled-path-final.log`은 `SYNC_CHANGES=0`, `AUTO_SYNC_RESULT=NO_CHANGES`, exit 0으로 종료했고 추가 직원 재시작은 없었다. `final-health.json`의 8010/3000/8011/3001 모두 HTTP 200. 양쪽 `*-final-status.log`에서 작업·감독자·서비스 running, readiness True, 재시작 실패 0, schema READY. 포트별 리스너도 하나씩이다(`final-listeners.json`).

후속 복구 확인 목록: **완료 6 / 진행 0**. 실패했던 실행은 성공으로 덮어쓰지 않고 아래 이력과 로그에 보존한다.

### 최종 반영 내용과 추가 검증

- 정지 전 준비의 전체 백업·활성화 dry-run과 실제 활성화 직전 전체 백업 재검증을 연결했다. 구조 전용 원본 백업의 검증 등급을 바꾸지 않았다.
- 개발 DB는 정지 전 보존 백업과 정지 후 복구 백업을 구분한다. 정지 후 백업 실패 시 설치하지 않고 재기동하며, 그 백업 이후 쓰기 감지·writer fence는 그대로 유지한다. `SYNC_DATA_BACKUP`에는 정지 후 복구 기준만 출력한다.
- 기동용 `Wait-RuntimeHttp200`에는 timeout 인자를 추가했다. backend supervisor는 readiness 10초 1회, 외부 기동 caller·frontend 선행 readiness는 10초 6회다. liveness 및 `/mes` 기본 2초 정책은 유지했다. 실제 이전 재시도 누적은 372,327ms까지 지연됐고 수정 후 기동 시 진단은 약 1.4~2.9초로 종료됐다(`startup-readiness-durations.json`, 기존 과거 표본을 포함한 이력 중 해당 시점 비교).
- frontend 변경 비교에서 `next-env.d.ts`, 캐시·환경 설정 등을 실제 release source와 동일하게 제외했다. 폐기 가능한 폴더와 실제 robocopy로 자동 생성 파일만 다른 경우를 재현했고, 수정 전 변경 감지→수정 후 exit 0 / 변경 없음으로 확인했다(`frontend-compare-red.log`, `frontend-compare-green.log`).
- 추가 직접 영향 검사: `runtime-final-tests.xml` 13건, `runtime-entrypoint-tests.xml` 9건, `runtime-batch-contract-final.log` 통과. 기동 경계와 Windows 검사에 남아 있던 이전 배포 경로 기대값을 현재의 정지 전 준비·전체 release 복구 계약으로 갱신했다. 관련 보호 검사는 삭제하지 않았다. 백엔드 Ruff baseline과 최종 공백 검사도 통과했다. 테스트 묶음은 중복되므로 합산하지 않는다.
- 독립 읽기 전용 리뷰에서 백업·원본 보호·복구 기준·기동 대기·변경 비교의 차단 문제 없음. 다른 백업 경로를 같은 출력 키로 표시하던 문제도 리뷰 의견대로 바로잡았다.

### 검증된 실제 데이터 백업

- 직원 online snapshot: `C:\ERP\_attic\runtime\employee-data-sync\backups\sqlite\mes_20260911_230146_207485_8a8d8220ddc34dd3bdb217f0f85eda47.db`.
- 최신 schema 검증 후보: `C:\ERP\_attic\runtime\employee-data-sync\backups\sqlite\mes_20260911_230209_243501_9ca1d641a1414189acaf97c64a729146.db`.
- 개발 정지 전 보존 백업: `C:\ERP\_attic\runtime\backups\sqlite\mes_20260911_230215_735358_4106204a9cfb41198b7b5cf2988204e1.db`.
- 실제 교체·복구 기준: `C:\ERP\_attic\runtime\backups\sqlite\mes_20260911_230241_562885_a71186dc0f6a44648df2fafd6a49077e.db`.
- 직원 활성화용 전체 백업: `C:\ERP-dev\_attic\runtime\backups\sqlite\mes-before-inventory-operation-activation-20260911-225203-a0d722ab.db`.
- 최종 코드 원본은 `final-source-manifest.log`가 가리키는 `code-*.json`의 backend/scripts/root 파일 해시 목록이다. 기동 스크립트·검사 파일의 직원 복구 반영은 `startup-repair/receipt.json`, `test-contract-repair/receipt.json`에 이전·이후 해시를 보존했다. 프런트는 기존 검증 release `eb1b119485d04f3e34dbc7455d701436976f5c57a5c25534e5c269771b6ea2a2` 그대로이며 Node 20 / Next 16 / React 19 환경이다.

최근 활동은 사용자 사전 승인에 따라 기존 래퍼 내부에서 무시하고 진행했다. 마지막 확인 증적은 `2026-09-11 23:05:49`, `employee=anonymous`, `source=unknown`, `event=slow_req`이며 `scheduled-path-final.log`에 기록했다. 이 확인은 변경 없음으로 종료됐다. 원본 DB 수동 덮어쓰기·임의 과거 DB 복원·검사 우회는 수행하지 않았다. 누적 요청을 보내던 이번 실행의 이전 기동 caller만 신원을 확인해 종료했고(`cancelled-stale-start-caller.json`), 서비스는 정식 stop/start로 정리했다.

남는 범위: PostgreSQL·실제 30분 대기·전체 브라우저 재순회·GitHub CI는 이번 SQLite 운영 복구에서 수행하지 않았다. 과거 v1 증빙 경고 4,797건은 실제 실행 시점의 비차단 이력으로 남기며 v2/재고 차단 검사를 완화하지 않았다. 미커밋 준비·복구 변경은 보존했고 Git 제출은 하지 않았다. 다음 예약도 현재 코드와 새 직원 스냅샷으로 검증하며 실패 시 후속 데이터 단계를 차단한다. 알 수 없는 POST_STOP DB 문제를 자동으로 과거 데이터로 덮어쓰는 동작은 추가하지 않았다.

데이터 Apply 첫 시도는 `TARGET_CHANGED_AFTER_BACKUP`으로 DB 교체 전에 중단됐고 개발 서비스를 재기동했다. 정지 시 SQLite WAL 물리 세대가 바뀐 것이 원인으로 판단된다. 독립 SQL에서는 이전 개발 백업과 현 DB의 57개 테이블 내용이 모두 같았다(`development-content-after-guard.json`). 별도의 HTTP 재현은 1초 제한의 백엔드 readiness 실패와 2초 이상 응답 성공을 확인했다. 취소된 서버 진단이 남아 짧은 재시도 후 응답이 6.7초까지 지연됐다. `data-apply.log` 실패를 수정 전 증거로 보존하며 성공으로 재분류하지 않는다.

## 최초 실제 실행 실패 이력 (19:21 기준)

> **준비 판정 정정:** 2026-09-11 19:21 사용자의 즉시 동기화 승인으로 실행했으나, 마이그레이션 후 원장 활성화가 구조 전용 백업을 거부해 `POST_STOP / post-verify`, exit 8로 중단됐다. 아래 17:33 준비 완료 기록은 실제 배포 성공을 보장하지 못했다. 당시 직원 서버는 정지 상태였고 데이터 Apply는 미실행이었다. 현재 상태는 위 후속 복구 절을 따른다.

실행 증거: `C:\ERP\_attic\runtime\manual-sync-20260911-192122\code.log`, `code-exit.txt`.

- `scripts/dev/sync-to-employee.ps1:499`: `--integrity-only`로 생성한 백업은 `STRUCTURAL_ONLY`다.
- `scripts/ops/inventory_operation_admin.py:96`: 활성화는 `_verify_backup.py` exit 0을 요구해 해당 백업을 거부한다. 검사 자체를 완화하지 않는다.
- 실제 직원 schema는 `20260911_0036`, 사후 schema/재고/업무 원장 진단의 차단 오류 0. v1 경고 4,797건 유지.
- 보존 백업: `C:\ERP-dev\_attic\runtime\backups\sqlite\mes_20260911_192841_340204_7b8e2e893b964367aa801a915009da68.db`. **구조 전용** 증빙이므로 전체 검증 백업으로 오인하지 않는다.
- 전환 journal: `C:\ERP-dev\_attic\runtime\frontend-releases\1be3e4ca5c0e4460a6f3e68548acd336\journal.json`, phase `MIGRATING`. 이전 코드·프런트 복구 자료 보존.
- 직원 8010/3000 응답 없음. 개발 8011 `/health/live` 및 3001 HTTP 200. 직원→개발 데이터 적용 미실행.
- 활동 우회 증적: `2026-09-11 17:24:37`, `employee=anonymous`, `source=unknown`, `event=req_ok`. 사용자의 즉시 실행 지시로 기존 래퍼를 실행했으며 해당 익명 UI 활동 가드는 내부 정책에 따라 우회했다.
- 재시도나 DB 복원은 하지 않았다. 후속 복구는 현재 마이그레이션 결과를 보존하고 전체 백업 검증과 활성화 계약을 맞춘 뒤, 사후 검사·재기동·헬스 확인·journal 확정 순으로 검토한다. 다음 예약도 미완료 journal 때문에 차단되므로 복구가 먼저 필요하다.

## 초기 준비 기록 (17:33 기준, 후속 실제 실행과 구분)

당시 판정: **예약 동기화 준비 완료 — 실제 반영 미실행**. 2026-09-11 17:33 KST 기준.

최신 소스의 Node 20·Next 16·React 19 설치/빌드/실행, 직원 DB 복사본 마이그레이션과 정합성, 정지 전 차단·전환 실패 복구 검사를 마쳤다. 기존 예약은 2026-09-12 04:00 KST에 실행하도록 그대로 유지한다. 실제 코드·데이터 동기화, 양쪽 서비스 정지·재시작, 직원 파일 교체, 원본 DB 마이그레이션, commit/push는 이 준비에서 수행하지 않았다.

## 승인된 범위

- 매일 04:00 KST 기존 예약 `automation` 유지. 다음 실행 기준: 2026-09-12 04:00 KST.
- 시작 시 main `bfede9d899c11aa276642ca8cad68f1f86adf523`와 미커밋 개발 복구 변경을 기준으로 준비했다. 작업 도중 별도 주간보고 문서 커밋으로 HEAD가 `6bd82ac7ffc3bf2f9628493f127351e0cbfd9bee`로 이동했다. 이 작업에서 Git 변경은 수행하지 않았으며 해당 문서 변경도 보존한다.
- 직원 DB는 읽기 전용 온라인 스냅샷을 만들고 복사본에만 최신 마이그레이션을 적용한다.
- 실제 30분 대기·전체 화면 재순회·새 PostgreSQL 서버 설치는 생략한다.
- 증거: `C:\ERP\_attic\runtime\sync-preparation` (ignored, 실제 데이터 복사본 포함, 외부 공유 금지).

## 확인 목록

- [x] Node 20 프로필 분리와 의존성·빌드 묶음 준비, 다른 경로 실행 확인 — 2026-09-11, `preflight-latest.log`, `relocation-latest-smoke.json` 통과
- [x] PreflightOnly의 정지 전 차단 및 전환 실패 복구 테스트 — 2026-09-11, `backend-full.xml`, `release-final.xml`, `final-boundary-tests.xml`
- [x] 직원 DB 복사본의 최신 마이그레이션·데이터 보존·정합성 검사 — 2026-09-11, `preflight-latest.log`, `independent-data-comparison.json`
- [x] 직원→개발 데이터 DryRun 후보 생성 및 원본 미적용 — 2026-09-11, `data-dry-run.log`
- [x] 전체 로컬 검증과 읽기 전용 독립 리뷰 — 2026-09-11, 전체 gate 1회 후 실패 영역 분리 재검증. PostgreSQL은 아래와 같이 명시적 미검증 유지
- [x] 예약 설정·실행 권한·직원 코드와 서비스·개발 DB 보존 최종 확인 — 2026-09-11, `final-audit.json` 통과. 개발 DB 파일 해시의 한계는 아래에 명시

완료 6 / 진행 0. PostgreSQL 등 아래 명시한 생략 범위는 검증 완료로 바꾸지 않는다. 아래 수치는 실행 시점의 증거 집계이며 제품 기준정보의 고정 개수가 아니다.

## 구현한 배포 계약

- `scripts/dev/runtime-control.ps1:432`: 각 프로필의 ignored runtime 설정에서 절대 경로 Node 20을 선택한다. 설치 도구도 같은 배포본의 npm을 사용한다. 공용 PATH와 직원 설정은 준비 중 변경하지 않는다.
- `scripts/ops/employee_frontend_release.py:138`: 현재 실제 프런트 파일과 잠금 파일을 격리 복사해 `npm ci → production build → 번들 검사`를 실행한다. 소스·Node 배포본·빌드 환경·준비 도구·산출물 해시가 일치해야 캐시를 재사용한다. 개발 `.env`, DB, 기존 의존성·빌드 결과는 소스 복사에서 제외한다. 복사 대상의 링크·reparse point는 차단한다.
- `scripts/dev/sync-to-employee.ps1:373`: `-PreflightOnly`는 소스 고정, 프런트 준비, 직원 DB 온라인 복사본 검증, 예약 실행 경로와 직원 전환 전제 확인까지만 수행한다. `READY` 이후 458행에서 직원 정지 전에 반환한다. 준비 도중 코드 변경도 정지 전에 차단한다.
- `scripts/ops/employee_frontend_release.py:257`: 향후 실제 예약 실행은 코드·잠금 파일·의존성·빌드·Node 설정을 한 묶음으로 전환한다. 이전 프런트·백엔드·scripts·루트 실행기와 설정을 최종 확인까지 보관한다.
- `scripts/ops/employee_frontend_release.py:327`: 마이그레이션 전 실패만 이전 구성을 복원하고 해시를 확인한다. 복원 자료가 없거나 손상됐으면 성공으로 처리하지 않는다. `MIGRATING` 이후에는 기존 `POST_STOP` 수동 복구 계약을 유지하며 임의 DB 복원·맹목 재시도를 하지 않는다.
- `scripts/ops/employee_schema_preflight.py`: 복사본 검증의 DB URL·runtime·dotenv 환경을 명시한다. 상위 개발/직원 환경 설정이 복사본 검증을 다른 DB로 유도하지 못하게 한다.
- `backend/alembic/versions/20260911_0036_legacy_ledger_boundary.py`: 기존 복구 마이그레이션에 실제 변경 전후 조건을 추가했다. 신규 v2 기준값과 허용한 실패 요청 행 상태 외의 설정·행·필드 변경을 차단한다. 원본 DB에는 이번 준비에서 적용하지 않았다.

## 실행 환경과 정확한 준비 원본

| 항목 | 결과 |
|---|---|
| 준비 위치 | `C:\ERP\_attic\runtime\sync-preparation` (ignored) |
| Node | `C:\ERP\_attic\runtime\tools\node-v20.20.2-win-x64\node.exe`, 20.20.2 |
| 설치 대상 | 잠금 파일 기준 Next.js 16.3.4 / React 19.2.8 / React DOM 19.2.8 |
| 빌드 환경 | employee, 내부 백엔드 `http://localhost:8010`, 공개 API URL 비움. 개발 `.env` 미복사 |
| backend/scripts/루트 실행기 해시 목록 | `code-dc184e4f9c63f9dd54b225f839d6eda84cd8c80fb39938b25214f769eb283179.json` |
| 프런트 최종 소스·잠금 파일·Node·산출물 해시 | `frontend/eb1b119485d04f3e34dbc7455d701436976f5c57a5c25534e5c269771b6ea2a2/receipt.json` (증거 루트 아래) |
| 최종 receipt SHA-256 | `a0f11b40d8a5924e25af7dfe7d420e665cd62c371154cb88b9427e551b4b2697` |
| 최종 package-lock SHA-256 | `ef0a193a23f3ece145ab9f05831f9f486c71ad36d9387e85e65a5d83aa1f8874` |
| 최종 사전 준비 | `preflight-latest.log`: exit 0, `SYNC_PREPARE_RESULT=READY`, `SYNC_PREPARE_EMPLOYEE_MUTATION=NONE` |
| 최종 다른 경로 실행 | `relocation-latest-smoke.json`: 산출물 해시 일치, `/mes` 및 정적 리소스 15요청 모두 HTTP 200, 업무 API 요청 0. 시험 소유 PID 41672 종료 확인 |
| 이전 준비/이전 경로 실행 | `preflight-ready.log`, `relocation-smoke.json`: 소스 갱신 전 준비 통과. 최신 최종 증거와 구분해 보존 |

빌드·HTTP 실행 확인은 준비한 임시 폴더에서 수행한다. `/mes` HTML과 참조된 정적 JS/CSS/폰트만 조회하며 직원 API 요청은 보내지 않는다. 실제 화면 업무 재순회와 실제 배포 후 헬스 확인은 이번 범위가 아니다.

## DB 복사본 결과

- 정식 온라인 읽기 전용 백업 → 복사본 schema `20260903_0032` → `20260911_0036` 적용 성공. SQLite integrity `ok`, 외래키 위반 0, 재고·예약·출하·불량·취소·원장 차단 오류 0.
- 최종 17:26 온라인 스냅샷의 과거 v1 증빙 경고 4,797건은 그대로 남긴다. 앞선 스냅샷의 4,791건과 시점을 구분한다. v2 차단 검사나 재고 검사를 완화하지 않았다.
- 16:47 DryRun 스냅샷의 독립 SQL 비교는 신규 schema 열을 분리하고 기존 열/행을 대조했다. 49개 테이블의 기존 값이 일치하며, 의도한 schema 메타데이터·신규 기준 설정·실패 요청 하위 행 46건만 변경됐다. 모든 다른 하위 행 필드와 기존 설정값은 보존됐다. 최종 17:26 스냅샷도 정식 사전 검증의 데이터 보존 계약을 별도로 통과했다.
- `data-dry-run.log`: `SYNC_DATA_RESULT=VERIFIED`, `SYNC_DATA_SOURCE_MUTATION=NONE`. 검증된 후보만 생성했고 개발 DB에 적용하지 않았다.
- 원본 복사본: `C:\ERP\_attic\runtime\employee-data-sync\backups\sqlite\mes_20260911_164735_514379_dc6be2ab349b4f3dbc6c692330ad2d3e.db`.
- 검증 후보: `C:\ERP\_attic\runtime\employee-data-sync\backups\sqlite\mes_20260911_164803_092755_fa8c7d6dfa9f43a9af09877cf72c71a1.db`.
- 정량 근거: `independent-data-comparison.json`. DB에는 실제 데이터가 있으므로 로컬 ignored 영역에만 보관한다.

## 검사 결과와 실패의 처리

| 검사 | 결과 / 증거 |
|---|---|
| 전체 로컬 gate 1회 | `full-gate.log`, `full-gate-timing.json`. 전체 명령 자체는 PASS 아님. PostgreSQL URL 미설정과 실행 중인 개발 Next의 lock 충돌로 중단된 영역을 아래에서 분리 검증했다. |
| 백엔드 전체 pytest | 3,131건 중 2,972 통과, 159 생략, 실패/오류 0. `backend-full.xml`. PostgreSQL 미설정 등 생략 사유는 로그에 유지한다. |
| 새 준비/복구 계약 | 최종 준비 도구 14건 통과(`release-final.xml`), 준비/마이그레이션 경계 묶음 22건 통과(`final-boundary-tests.xml`). 전환·복원은 폐기 가능한 테스트 폴더에서만 실행했다. |
| 백엔드 정적/OpenAPI | Ruff·mypy baseline 통과(`full-gate-timing.json`), OpenAPI drift 없음(`openapi.log`). |
| 프런트 린트·앱 타입 | 기존 진단 baseline 안에서 통과(`full-gate-timing.json`). |
| 프런트 검증 도구·테스트 타입·e2e 타입 | 격리 복사본에서 계약 57건 통과, tracked test manifest 298파일 통과, 테스트 타입 baseline 통과(기존 390개 진단 유지), e2e 타입 통과. `frontend-isolated-final.log`, `frontend-manifest.log`, `frontend-remaining-final.log`. |
| 프런트 전체 테스트·커버리지 | 최종 291파일·2,846건 전부 통과. 지정 측정 모듈 기준 statements/lines 93.33%, branches 91.52%, functions 90%, 각 75% 기준 통과(`frontend-coverage-recheck.log`). 첫 실행의 3건 실패는 Node 실행 경로 기대값 1건과 임시 로그 경로를 덮어쓴 테스트 실행 환경 2건이었다. 관련 25건 재검사와 변경 테스트 린트도 통과했다. 앱 동작 변경으로 테스트를 우회하지 않았다. |
| 설치·production build·번들 | 최종 release의 `install.log`, `build.log`, `bundle.log` 통과. 번들 2.686 MiB, 기준 2.860 MiB 이내. 소스 변경 시 별도 준비 결과를 만들었다. |
| 문서·공백 | `docs-final.log` 통과. 최종 보고서의 추가 링크·공백 확인은 `final-links.log`, `final-diff-check.log`에 기록한다. |
| 독립 리뷰 | 읽기 전용 최종 리뷰 완료, 차단 문제 없음. 원본 보존 범위, 설치 전 전제, 마이그레이션 경계, 복원 재시도·설정 누락·해시 검사를 검토했다. |

준비 도중 소스 변경을 감지한 이전 실행 두 건은 `BLOCKED`로 종료됐다. 직원 정지 이전에 차단됐으며, 검사를 느슨하게 바꾸지 않고 수정 완료 후 새 원본으로 다시 준비했다. 격리 테스트의 누락 fixture와 실제 서버가 보유한 Next lock은 시험 환경 문제로 구분하고 로그를 보존한다. 검사 묶음에는 중복이 있어 통과 수를 합산하지 않는다.

## 예약과 원본 보존

- 기존 `automation` 예약 **직원 서버 매일 코드·데이터 동기화**: ACTIVE, 매일 **04:00 KST**, 다음 실행 기준 **2026-09-12 04:00 KST**. 새 예약 생성이나 일정·프롬프트 수정 없음.
- 기존 순서 유지: 코드 래퍼 최종 exit 0일 때만 데이터 적용. 코드 실패 시 데이터 단계 차단, 정상 `NO_CHANGES`일 때 데이터 단계 진행 계약을 테스트했다. 실제 자동 동기화 래퍼는 이번 작업에서 실행하지 않았다.
- 호스트 `Korea Standard Time`(UTC+09), 실행 계정 `GJCHOPC\user`와 예약 런타임의 user/Interactive/제한 권한, 경로 및 ACL을 읽기 확인했다. 직원 경로에 시험 파일을 쓰는 권한 검사는 하지 않았다. 근거: `automation-readonly.json`, `access-readonly.json`, preflight의 runtime-task 확인.
- 직원 frontend/backend/scripts 소스 및 설치 패키지 메타데이터·Node 설정 해시가 전후 일치한다. 개발/직원 frontend/backend 4개 서비스의 PID·시작 시각·실행 경로도 일치한다. 직원 원본 schema는 `20260903_0032` 그대로다. `employee-before.json`, `employee-final.json`, `preservation-final.json`, `final-audit.json` 확인.
- 개발 DB 파일 해시는 서비스가 실행 중인 동안 달라졌다. 따라서 파일의 byte 단위 불변을 주장하지 않는다. 이 준비에서 데이터 Apply·원본 migration·DB 교체를 실행하지 않았으며, 이전 15:09 복구 시험 복사본과의 읽기 전용 비교에서 52개 테이블은 같고 설정/schema/revision·접속 기록·세션 테이블만 다르다. 이 비교 기준은 준비 시작 시점의 snapshot이 아니므로 모든 차이의 원인을 이번 작업으로 단정하지 않는다. `development-readonly-comparison.json` 참조.
- HEAD/index도 위 별도 문서 커밋으로 변경됐다. 이 작업의 미커밋 변경, 기존 개발 복구 변경, 사용자 문서 커밋을 모두 보존했다.

## 남기는 범위와 예약 실행 직전 조건

- PostgreSQL 경합은 `TEST_POSTGRES_URL` 미설정으로 **NOT_VERIFIED**. 사용자 결정대로 새 서버를 설치하지 않았으며 SQLite 통과로 대체하지 않는다. 향후 commit/CI에서 별도 확인한다.
- 실제 30분 경과, 전 화면 브라우저 재순회, GitHub CI, 실제 직원 전환/장애 복구는 실행하지 않았다. 이번 완료 판정은 SQLite 직원 환경의 **예약 준비**에 한정한다.
- 직원 데이터는 계속 변하므로 예약 실행 시 **새 온라인 스냅샷**으로 사전 DB 검증을 다시 수행한다. 소스·잠금 파일·도구·Node·환경·산출물 해시가 달라지면 직원 정지 전에 다시 준비하며 실패 시 기존 서비스를 유지한다.
- 커밋·푸시·직원 파일 및 의존성 교체·원본 DB migration·개발 DB 적용은 이번 준비에서 수행하지 않는다.

종료 상태: 준비 결과와 로그·DB 복사본은 ignored runtime에 보존하고, 이번 시험의 전용 임시 프런트 프로세스는 종료했다. 기존 개발·직원 서버와 예약은 유지한다. 후속 실제 반영 여부는 예약 실행의 새 사전 검증과 최종 헬스 결과로 판단한다.
