# DEXCOWIN MES 예약 동기화 결과 인계 오류 복구

**최종 판정: 원인 수정 및 오늘 누락된 동기화 완료.** 2026-09-12 14:23:34 KST에 전체·코드·데이터 exit 0, `COMPLETED / APPLIED`를 확인했다. 직원·개발 서비스 정상과 데이터 일치도 추가 확인했다. 다음 예약은 2026-09-13 04:00 KST이며 매일 같은 시각으로 유지한다.

## 원인과 승인 범위

2026-09-12 04:00 KST 예약 작업 `동기화`에서 코드 래퍼는 exit 0, `SYNC_CHANGES=0`, `AUTO_SYNC_RESULT=NO_CHANGES`로 끝났다. 그런데 예약 에이전트가 결과를 잃었다고 판단해 직원→개발 데이터 단계를 실행하지 않았다. 코드 배포 실패나 직원 서비스 중단으로 판정하지 않는다.

작업 ID: `019f9fcd-dadf-76c3-904f-229a4c968a79`. 해당 turn `01a091d7-bb91-7600-a5ea-d491187599d9`의 실행 출력 ordinal 8278과 마지막 보고를 대조했다. 13:56 KST 직원 8010/3000, 개발 8011/3001은 모두 HTTP 200이었다.

사용자가 앞서 즉시 동기화·자율 복구·재발 방지를 승인한 범위에서 수행한다. 기존 미커밋 변경을 보존하고 commit/push는 하지 않는다.

## 수정 설계

예약은 하나의 진입 스크립트를 호출한다. 그 스크립트가 기존 코드 래퍼를 한 번 실행하고, 실제 exit 0일 때만 기존 데이터 `-Apply`를 한 번 실행한다. `NO_CHANGES`도 정상 코드 결과다. 모델이 두 명령 사이에서 종료 코드를 다시 판단하는 경계를 없앤다.

단계별 stdout/stderr와 시작·종료·종료코드를 ignored runtime의 실행별 폴더에 남긴다. stdout 조회가 누락되어도 스크립트는 이미 승인된 순서를 계속 수행하며, 예약은 해당 실행의 `receipt.json`으로 결과를 확인한다. 실패·실행 중·불확실 상태에서는 재실행하지 않는다. 같은 진입점 중복 실행은 파일 잠금으로 차단한다. 기존 DB 사전 검증·백업·실패 복구 절차는 변경하지 않는다.

## 확인 목록

- [x] 오늘 실패 원인과 현재 서비스 확인 — 코드 정상, 데이터 미실행
- [x] 출력 유실·코드 실패·데이터 실패·중복 호출 재현 테스트 — 새 진입점 11건, 기존 코드 래퍼 7건 PASS. 출력 폐기 상태와 실행 중 기록 실패를 각각 RED→GREEN으로 확인했다.
- [x] 직렬 실행과 영속 결과 기록 구현·독립 리뷰 — 단계 stdout/stderr 직접 저장, atomic receipt, Windows 종료 코드 보존, 자식 종료까지 잠금 유지. 읽기 전용 독립 리뷰의 지적 2건 보완 후 잔여 차단 없음.
- [x] 실제 누락 데이터 동기화 및 네 서비스 확인 — 14:11:51~14:23:34 KST 한 번 실행. 코드 exit 0→데이터 `-Apply` 자동 1회→`COMPLETED`, 네 서비스 정상, 원본 스냅샷·후보·개발 DB 비교 모두 일치.
- [x] 기존 매일 04:00 KST 예약 연결과 문서 정정 — `automation_update`로 기존 `automation` ID·작업·ACTIVE·일정을 보존하고 단일 진입점으로 변경. 실제 TOML과 최신 배포 스킬의 일치도 독립 확인.

완료 5 / 진행 0. 다음 예약 기준은 2026-09-13 04:00 KST다.

## 증거

- 조사·검증: `C:\ERP\_attic\runtime\scheduled-sync-recovery-20260912`.
- 오늘 예약의 정상 코드 출력과 잘못된 최종 보고: `scheduled-turn-evidence.json`.
- 회귀 재현: `red.xml`, `receipt-lock-red.xml`.
- 최종 검증: `entry-tests-final.xml` 11건, `code-wrapper-tests.xml` 7건, Ruff PASS. 실제 DB·서비스를 호출하지 않는 폐기 가능한 자식 스크립트로 시험했다.
- 자동화 원본 보존: `automation-before.toml`, `deploy-skill-before.md`. 새 설정과 소스 해시: `execution-manifest.json`.
- 14:11 KST 실제 복구 실행: `C:\ERP\_attic\runtime\scheduled-sync\20260912-141151-4b9567fbfb354369b5cd66e8a10ecf7a\receipt.json`. 결과는 `COMPLETED`, 전체·코드·데이터 exit 0. 코드 완료는 14:21:18, 데이터 완료는 14:23:34 KST다.

## 실제 반영과 데이터 증명

- 코드 사전 검증: `PREFLIGHT_RESULT=PASS`, `SYNC_PREPARE_RESULT=READY`. 최신 schema `20260911_0036`, SQLite·FK·재고·원장·업무 데이터 보존 계약 및 활성화 dry-run 통과.
- 직원 전환 journal: `C:\ERP-dev\_attic\runtime\frontend-releases\0aae7dfb0a0f44ccb343434c1b09f1ea\journal.json`, 최종 `CONFIRMED`.
- 직원 정지 전 보존 백업: `C:\ERP-dev\_attic\runtime\backups\sqlite\mes_20260912_141827_813532_b1ba80b7465c45c6a434c0a53b8ffdab.db` (구조 전용).
- 직원 활성화용 전체 검증 백업: `C:\ERP-dev\_attic\runtime\backups\sqlite\mes-before-inventory-operation-activation-20260912-142042-2d89bc84.db`.
- 직원 online snapshot: `C:\ERP\_attic\runtime\employee-data-sync\backups\sqlite\mes_20260912_142120_454323_27e4120dd4cb405ea9ae07c67288b57c.db`.
- 검증 후보: `C:\ERP\_attic\runtime\employee-data-sync\backups\sqlite\mes_20260912_142139_621364_b1d3857f45bb4d46ac73f84c5d528057.db`.
- 개발 정지 전 보존 백업: `C:\ERP\_attic\runtime\backups\sqlite\mes_20260912_142145_177000_cf7ea29cf7ed4072aefbc5e372ea9410.db`.
- 개발 교체·복구 기준 백업: `C:\ERP\_attic\runtime\backups\sqlite\mes_20260912_142209_305694_b669d16316e64311a332f80522df6be1.db`.
- 독립 SQL: `snapshot-candidate-comparison.json`, `candidate-development-comparison.json`. 이번 시점의 전체 57개 테이블이 일치했고 `changed_tables={}`다. 값·PIN·인증 토큰은 출력하지 않고 테이블별 내용 해시만 저장했다.
- `employee-final-status.log`, `development-final-status.log`: 서비스별 단일 supervisor/child running, readiness True, restart failures 0, schema READY. `final-health.json`과 `final-listeners.json`에 별도 HTTP 결과와 리스너 확인을 남겼다. 상태 도구의 `last reason`은 정식 교체 때의 과거 종료 이력이며 현재 장애 판정이 아니다.

기존 v1 증빙 경고 4,797건은 과거 비차단 이력으로 남았다. 이번 검증의 차단 오류는 0건이며 검사를 완화하거나 업무 데이터를 수동 보정하지 않았다. 최근 활동 예외는 사용자 사전 승인된 코드 래퍼 내부 경로로만 사용했다: `2026-09-12 13:56:00`, `employee=anonymous`, `source=unknown`, `event=slow_req`.

## 변경 범위와 남는 한계

- 추가: `scripts/dev/sync-employee-environments.ps1`, `backend/tests/ops/test_scheduled_employee_sync.py`, 이 복구 문서.
- 갱신: README 예약 진입점 설명, 전날 준비 문서의 판정 정정, 최신 `deploy-to-employee` 스킬, 기존 자동화 프롬프트.
- 기존 코드/데이터 동기화 내부의 검증·백업·복구 로직 및 직원 업무 기능은 이번에 수정하지 않았다. 부모만 실제 실행과 DB 반영을 수행했다.
- 관련 자동 테스트 18건·실제 전체 동기화·독립 SQL·서비스 검사를 수행했다. 프런트 전체 빌드/전수 UI·PostgreSQL·전체 CI를 새로 수행했다고 주장하지 않는다. 이번 프런트는 기존 검증된 준비 산출물을 최신 해시로 재검증했다.
- 미커밋 준비·복구 변경을 보존했고 HEAD는 `6bd82ac7ffc3bf2f9628493f127351e0cbfd9bee` 그대로다. staging·commit·push는 하지 않았다.
- 다음 실제 예약 실행 자체는 아직 미래다. 동일 진입점의 실제 완료와 저장된 예약 연결까지 확인했으며, 향후 모든 실패가 없어진다는 보장은 아니다. 실패 시 해당 실행의 receipt/로그로 단계와 원인을 구분하고 맹목 재실행하지 않는다.
