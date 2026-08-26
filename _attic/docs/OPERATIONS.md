# 운영 매뉴얼

내부 MES를 365일 켜두는 PC에서 운영하는 사람을 위한 매뉴얼. 보안/권한·CI/CD·실 서비스 등록은 이 문서의 범위가 아니다.

## 표준 실행 경로

- **표준은 `start.bat`**. 컨테이너 정의는 루트가 아닌 `docker/docker-compose.yml`에 있으며, 정규 운영 경로는 아니다.
- `start.bat`와 운영 batch는 `scripts/dev/resolve-server-profile.ps1`로 현재 checkout의 profile을 결정한다. `C:\ERP`와 그 `.worktrees` 하위는 development (백엔드 8011 / 프론트엔드 3001), `C:\ERP-dev`는 employee (백엔드 8010 / 프론트엔드 3000)다.
- 현재 profile과 URL은 다음 명령으로 확인한다.
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\resolve-server-profile.ps1
  ```
- Python **3.11+**를 지원한다. 처음 실행 시 의존성이 자동 설치되며, `start.bat`에서 자동 설치를 선택하면 Python 3.13을 설치할 수 있다.

```bat
start.bat
```

LAN IP는 자동 감지된다. 같은 사설망의 다른 PC에서는 profile 출력의 `FrontendPort`를 사용해 `http://<LAN IP>:<FrontendPort>`로 접근한다.

`start.bat`는 백엔드와 프론트엔드를 background 프로세스로 시작한다. 종료와 재시작 전 정리는 반드시 루트의 `stop.bat`로 한다.

```bat
stop.bat
```

## 매일 운영 시작 전 확인 (1분)

운영 시작 전 먼저 `scripts\ops\backup_db.bat`로 현재 DB 백업을 만든 뒤, 운영자 PC에서 read-only 게이트를 실행한다. 이 게이트는 DB 파일, 현재 DB보다 뒤처지지 않은 최신 검증 백업, 재고 무결성을 한 번에 확인하며 DB를 변경하지 않는다.

```bat
scripts\ops\operational_readiness.bat
```

마지막 줄이 `PASS operational readiness`이면 입출고 작업을 시작할 수 있다. `FAIL latest backup`이 나오면 먼저 `backup_db.bat`를 실행하고 readiness를 다시 돌린다. 그 외 `FAIL`은 입출고를 시작하지 말고 백업/복구 또는 정합성 점검 절차를 먼저 따른다.

WARN missing transaction effects: N이 함께 나오면 재고 합계는 정상이나, 과거 거래 로그 일부에 자동 역취소용 재고 영향 기록이 없다는 뜻이다. 신규 입출고를 막는 조건은 아니지만, 해당 과거 거래의 자동 취소는 거부된다. 필요하면 히스토리와 현재 재고를 대조한 뒤 별도 보정 거래로 처리한다.

서버가 켜진 뒤에는 다음 중 하나로 화면/서버 상태를 확인한다.

1. 우측 상단 **새로고침** 버튼 → 데이터가 갱신되고 pill이 정상 메시지로 바뀌면 OK.
2. 운영자 PC에서 `scripts/ops/healthcheck.bat` 실행:

```bat
scripts\ops\healthcheck.bat
```

응답의 `status: "ok"`, `db.ok: true`, `rows`의 주요 테이블 행 수, `last_transaction_at`을 함께 확인한다. `inventory_mismatch_count > 0`이면 `status`가 `"degraded"`가 되며 데이터 정합성 점검이 필요하다.

## 30명 동시 운영 사전 점검 및 부하 테스트

두 스크립트 모두 대상 서버 URL을 명시해야 한다. dev profile 예시는 다음과 같다.

```bat
python scripts\ops\preflight_30_users.py --url http://localhost:8011
python scripts\ops\load_test_30_users.py --url http://localhost:8011 --dry-run
```

Preflight의 DB 엔진 결과는 한 점검 항목일 뿐이다. PostgreSQL 확인만으로 준비 완료를 선언하지 않으며, 최종 readiness는 모든 preflight PASS/WARN/FAIL 결과로 판단한다. 실제 부하 테스트는 테스트 데이터를 만들 수 있으므로 `--confirm` 요구 사항을 확인한 뒤 별도 승인된 환경에서 실행한다.

## DB 백업

- DB 파일: `backend/mes.db` (단일 SQLite 파일, WAL 모드)
- 런타임 산출물 기본 루트: `_attic/runtime/`. 테스트·직원 서버에서 전체 루트를 바꿀 때만 `MES_RUNTIME_ROOT`를 사용한다.
- **수동 백업**:

```bat
scripts\ops\backup_db.bat
```

→ `_attic/runtime/backups/sqlite/mes_YYYYMMDD_HHMMSS.db` 로 생성되고 즉시 검증된다. 성공할 때마다 정식 백업 최신 10개만 유지하며 `mes_PRE-*` 스냅샷은 이 개수에 포함하지 않는다.

- **백업 안전성**: Python `sqlite3.backup` 온라인 백업 API를 사용하고 `_verify_backup.py`가 통과해야만 성공으로 종료한다. 검증 실패 파일은 삭제하고 실패 코드를 반환한다.
- **권장 주기**: 입출고가 많은 날 일과 종료 후 1회. 외부 디스크 보관이 필요하면 `_attic/runtime/backups/sqlite/`를 복사한다.
- 기존 `backend/_backup/` 파일은 자동 이동·삭제하지 않으며 필요하면 복구 입력으로 직접 지정한다.
- 운영 DB는 `backend/mes.db` 한 개만 사용한다. 루트나 하위 폴더에 생긴 0바이트 `mes.db`·`erp.db`는 활성 DB가 아니며 생성 원인을 확인한 뒤 제거한다.

### 백업 검증 (Phase 5.2)

```bat
scripts\ops\verify_backup.bat
```

가장 최근 정식 백업(`mes_PRE-*` 제외) 1건에 대해:
- `PRAGMA integrity_check` 결과 (`ok` 면 정상)
- `PRAGMA foreign_key_check` 결과
- `items / inventory / inventory_locations / stock_requests / stock_request_lines / transaction_logs / bom / admin_audit_logs / warehouse_angles / warehouse_boxes / warehouse_box_items` 존재 및 행 수 조회
- `io_batches / io_bundles / io_lines` 입출고 테이블과 `shipping_requests / shipping_request_bom_lines / shipping_request_companion_lines / shipping_allocations / shipping_request_checklist_lines / shipping_request_events` 출하 테이블 존재 및 행 수 조회

운영 PC 에서 주 1회 정도 수행 권장.

### 백업 정리 (Phase 5.2)

```bat
scripts\ops\cleanup_backups.bat        rem 정식 백업 최신 10개 유지
scripts\ops\cleanup_backups.bat 20     rem 정식 백업 최신 20개 유지
```

`_attic/runtime/backups/sqlite/`의 정식 `mes_YYYYMMDD_HHMMSS.db` 중 지정 개수를 넘는 오래된 파일을 제거한다. `mes_PRE-*` 스냅샷과 기존 `backend/_backup/`은 건드리지 않는다.

## DB 복구 (Phase 5.2)

운영 중에는 절대 DB 파일을 수동으로 덮어쓰지 말고, 반드시 다음 절차를 따른다.

1. **백엔드·프론트 정지** — 루트에서 `stop.bat` 실행
2. 복구 명령 실행 (백업 파일명만 인자로 전달):
   ```bat
   scripts\ops\restore_db.bat mes_20260426_101530.db
   ```
   스크립트가 자동으로 수행:
   - 현재 `mes.db` 를 `mes_PRE-RESTORE_TS.db` 로 보존
   - 복구 대상 파일에 `PRAGMA integrity_check` (실패 시 중단)
   - `mes.db` 교체 + 잔여 `mes.db-wal / .db-shm` 제거
3. **백엔드 재기동** — `start.bat`
4. `scripts\ops\operational_readiness.bat` 로 DB/백업/재고 무결성 확인
5. `scripts\ops\healthcheck.bat` 로 서버 정상성 확인

복구 후에도 PRE-RESTORE 스냅샷이 `_attic/runtime/backups/sqlite/`에 남아 있어 되돌릴 수 있다.

## 직원 서버 코드 동기화

`scripts/dev/sync-to-employee.ps1`은 다음 순서를 고정한다.

1. 접속자 활동과 스키마 변경 가드
2. 백엔드·프론트 정지 명령의 종료 코드와 8010/3000 포트 해제를 확인
3. `C:\ERP-dev\_attic\runtime\backups\sqlite`에 `sqlite3.backup` 백업 생성·검증(최신 10개 유지)
4. 코드 동기화 후 `bootstrap_db.py --migrate`로 Alembic upgrade 또는 승인된 레거시 기준선 등록
5. 실제 직원 DB의 SQLite/필수 테이블 검증과 재고 무결성 검증
6. 취소 원장 정합성 읽기 전용 진단
7. 진단 통과 시 취소 원장은 즉시, 새 주간보고 기준은 다음 KST 월요일 00:00부터 활성화
8. 서버 시작과 백엔드·프론트 헬스체크

백업 실패 시 아직 코드가 바뀌지 않은 기존 서버를 재기동하고 배포를 중단한다. 마이그레이션, 사후 검증, 취소 원장 진단 또는 활성화가 실패하면 서버와 DB를 자동 복원하지 않고 기존 설정을 유지한다. 콘솔에는 검증된 백업 절대 경로와 `restore_db.py --sqlite ... --target ... --check` 수동 명령을 출력한다.

주중 동기화가 끝난 주간보고에는 아래 안내가 표시되고, 새 7열 검산 기준은 다음 KST 월요일부터 공개된다.

> 주간보고 계산 기준을 개선 중입니다. 이번 주 수치는 실제 재고와 다를 수 있으며, 다음 주부터 새 기준으로 정확한 정보가 표시됩니다.

미버전 SQLite DB는 검토·고정된 개발/직원 스키마 지문과 정확히 일치할 때만 등록한다. 등록 전 검증 백업을 만들고 업무 데이터 지문을 전후 비교하며, 알 수 없는 구조·데이터 변경·Alembic revision과 상태표 불일치는 모두 서버 시작 전에 중단한다. 임의의 `alembic stamp`로 이 검사를 우회하지 않는다.

## 재시작 절차

1. **재시작**: 루트에서 `stop.bat`가 성공한 것을 확인한 뒤 `start.bat` 실행
2. **정지 실패 또는 무응답**: `stop.bat`의 오류와 `status.bat` 출력을 보관하고 운영 담당자에게 전달한다. background 프로세스를 작업 관리자에서 임의 종료하지 않는다.
3. PC 재부팅 후에는 `start.bat`만 다시 실행하면 된다(자동 시작 등록은 미적용).

## 포트 충돌 대응

증상: `start.bat` 실행 후 백엔드/프론트가 안 뜸 또는 "EADDRINUSE"

```bat
rem 사용 중인 프로세스 확인 (PID 추출) — dev 포트 기준
netstat -ano | findstr :8011
netstat -ano | findstr :3001

rem 해당 PID 종료
taskkill /PID <PID> /F
```

종료 후 `start.bat` 재실행.

## 1차 장애 대응

| 증상 | 원인 후보 | 1차 조치 |
|---|---|---|
| 화면이 안 뜬다 | 백엔드/프론트가 죽음 | `start.bat` 재실행 |
| pill이 빨강 "데이터를 불러오지 못했습니다" | 백엔드 미기동 / 네트워크 / 포트 점유 | `scripts\ops\healthcheck.bat` → 포트 충돌 절차 |
| pill이 노랑 "부족 N · 품절 M" | 안전재고 미달 — 정상 알림 | 대시보드 "조치 필요" 확인 |
| 입출고 일부만 처리됨 | 단건 처리 중 일부 실패 (재고 부족, 음수 등) | 결과 모달에서 "실패 항목만 다시 시도" |
| 결과 모달이 닫히지 않음 | submit 진행 중 (의도된 잠금) | "처리 중..." 표시가 사라질 때까지 대기 |
| `/health/detailed` 가 `inventory_mismatch_count > 0` | Inventory 합계와 위치별 합계 불일치 | DB 백업 후 운영 담당에게 보고 (수정은 별도 절차) |
| `operational_readiness.bat` 가 `FAIL` | 백업 없음/오래됨/DB보다 오래됨, 백업 검증 실패, 재고 정합성 실패 | 입출고 시작 금지. `backup_db.bat`, `verify_backup.bat`, `check_inventory_integrity.py` 결과를 확인 |
| WARN missing transaction effects 표시 | 과거 거래 로그에 자동 역취소용 재고 영향 기록 없음 | 신규 작업은 가능. 해당 과거 거래 자동 취소는 거부되며, 히스토리/현재 재고 대조 후 별도 보정 거래로 처리 |
| 다른 PC에서 접속 안 됨 | LAN IP 변경 / 방화벽 | start.bat 콘솔에 표시된 새 IP 확인, Windows 방화벽에서 8011·3001 (dev) 또는 8010·3000 (prod) 인바운드 허용 |

## 데이터 정합성 점검(수동)

현재 checkout의 server profile(개발 `C:\ERP` 계열 또는 직원 서버 `C:\ERP-dev`)에 맞는 backend URL은 표준 헬스체크가 자동으로 선택한다.

```bat
scripts\ops\healthcheck.bat
```

응답 필드:

- `status`: `"ok"`는 정합성까지 정상, `"degraded"`는 DB 또는 재고 정합성 점검 필요
- `db.ok`: `true`면 DB 연결 정상
- `rows`: `items` / `employees` / `inventory` / `transaction_logs` 행 수
- `inventory_mismatch_count`: Inventory 합계와 InventoryLocation 합계 불일치 건수 — `0` 이 정상
- `last_transaction_at`: 최근 거래 시각

### 자동 1차 진단 (Phase 4 추가)

`scripts/ops/reconcile_inventory.bat` 한 번 실행하면:

1. `/health/detailed` 호출
2. `inventory_mismatch_count > 0` 발견 시 **자동으로 backup_db.bat 호출**
3. 응답 JSON 전체를 콘솔에 출력 → 운영 담당자에게 그대로 전달

자동 수정은 하지 않는다. 백업 + 보고까지만. 실제 수정은 개발자가 수동 절차로.

## 로그 확인

### 실행·관제 로그
- `start.bat`는 백엔드와 프론트를 background 프로세스로 시작하며 서버별 콘솔 창을 열지 않는다.
- 실행 중 로그는 `watch.bat`로 연 관제 창에서 확인한다. 관제 창을 닫아도 서버는 계속 실행된다.
- 중지·재시작 전 정리는 루트의 `stop.bat`를 사용한다.
- 브라우저: F12 → Console / Network 탭

### 파일 로그 (Phase 4 추가)
- 위치: `_attic/runtime/logs/backend/mes.log`
- 런타임 stdout/stderr 및 상태 파일: `_attic/runtime/logs/backend/`, `_attic/runtime/logs/frontend/`
- 프런트 개발 서버 종료 원인 추적 로그: `_attic/runtime/logs/frontend/dev-server.log` — `NEXT_SIGNAL_RECEIVED`가 기록되면 `watch-service.ps1 -Service frontend`가 `[FRONTEND ERROR]`로 강조하며, `NEXT_SIGNAL_PROBE_READY`, `NEXT_WORKER_CHILD_EXIT`, `NEXT_PROCESS_EXIT`는 프로세스 수명과 워커 원시 종료 결과 연결에 사용한다.
- 회전: `ConcurrentRotatingFileHandler` 기반 다중 프로세스 안전 회전, 5MiB × 기본 5 backup (`mes.log.1` ~ `mes.log.5`)
- 환경 변수: `LOG_LEVEL` (기본 INFO), `LOG_BACKUP_COUNT` (1 이상의 정수, 기본 5; 잘못된 값은 기본값 사용), `MES_RUNTIME_ROOT` (전체 런타임 루트 재정의)
- 내용: 전역 예외 핸들러가 잡은 ValueError/IntegrityError/Exception + INFO 레벨 메시지

### 프런트 개발 서버 종료 원인 추적

프런트 개발 서버가 예기치 않게 종료되면 먼저 `_attic/runtime/logs/frontend/dev-server.log`의 수명 기록을 확인한다. preload는 `NODE_OPTIONS`를 상속받은 일반 Node 자식에는 기록기나 신호 처리기를 붙이지 않고, 정확한 Next CLI 엔트리(`next/dist/bin/next`)와 `NEXT_PRIVATE_WORKER=1`인 Next worker 엔트리(`next/dist/server/lib/start-server.js`)만 기록한다. `NEXT_SIGNAL_RECEIVED`는 해당 Node 프로세스의 JavaScript 런타임이 `SIGINT` 또는 `SIGTERM`을 실제로 받은 신호 증거다. 부모 Next CLI는 정확한 `start-server.js` 자식의 `exit` 이벤트만 읽기 전용으로 관찰하고 `NEXT_WORKER_CHILD_EXIT`에 워커 PID·부모 PID·원시 `exitCode`·`signal`을 기록한다. 자식의 종료·재시작·종료 코드는 변경하지 않는다.

정확한 private worker에는 Node 진단 보고서도 켠다. 보고서는 `_attic/runtime/logs/frontend/node-reports/`에 최대 3개만 남기며, `reportOnFatalError`와 `reportOnUncaughtException`으로 OOM·미처리 JavaScript 예외 후보를 남긴다. 환경 변수와 네트워크 정보는 제외한다. `NEXT_NODE_REPORT_READY`가 있어야 수집 설정이 완료된 것이며, `NEXT_NODE_REPORT_SETUP_FAILED`는 서버 시작·종료 동작을 바꾸지 않고 설정 실패만 기록한다. CLI·직원 프로필·일반 Node 자식에는 이 설정을 적용하지 않는다.

Windows에서 Next private worker가 JavaScript 신호 처리 없이 종료되면 worker 자신의 `NEXT_PROCESS_EXIT`가 남지 않을 수 있지만, 부모 CLI의 `NEXT_WORKER_CHILD_EXIT`는 이 경우에도 원시 자식 종료 결과를 보존한다. 조회 도구는 PID와 PPID가 모두 같은 부모 Next CLI 수명 안에서 이 기록을 연결해 `workerExitObservedUtc`, `workerExitCode`, `workerSignal`로 출력하고, 해당 관찰 시각을 Sysmon·덤프 조회 기준점으로 사용한다. 이전 로그처럼 관찰 기록이 없으면 CLI의 `NEXT_PROCESS_EXIT` 시각을 `worker_exit_without_signal` 기준점으로 계속 사용하며 세 필드는 `null`이다. 해당 CLI나 매핑된 worker의 같은 수명 신호 기록이 하나라도 있으면 신호 결과만 표시하고 fallback은 만들지 않는다. fallback의 `cliUptimeMs`는 CLI 종료 시점의 가동 시간이고, `workerReadyUptimeMs`는 worker가 probe를 붙인 시점의 가동 시간이며 worker의 전체 가동 시간이 아니다. 원시 종료 코드는 충돌 유형을 좁히는 직접 증거지만, 단독으로 오류 모듈이나 외부 발신 프로세스를 확정하지는 않으므로 WER 덤프·Node 진단 보고서·Sysmon 후보를 함께 대조한다. `nodeReportStatus=node_report_captured`면 `nodeReportPath`, `nodeReportCapturedUtc`, `nodeReportEvent`, `nodeReportTrigger`, `nodeReportJavaScriptMessage`, 최대 10개 `nodeReportNativeStack`을 함께 확인한다. WER 덤프와 Node 보고서가 같은 worker 수명에 함께 있으면 둘 다 보존하며, 두 증거가 모두 없다는 사실만으로 외부 종료를 단정하지 않는다. Sysmon 수집기를 설치한 뒤에는 저장소 루트에서 다음처럼 추적 도구를 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\get-frontend-stop-attribution.ps1
```

Sysmon Event 10(Process access)은 종료 시각에 접근한 프로세스를 좁히는 **후보 접근 증거**일 뿐이며, 그 이벤트만으로 종료 신호의 발신자를 확정할 수 없다. 특히 `worker_exit_without_signal`은 신호 없이 사라진 worker와 부모 CLI 종료의 시간 관계를 보완하는 후보 증거이지, worker가 강제 종료되었다거나 Sysmon 발신 프로세스가 종료시켰음을 단독으로 증명하지 않는다. 개발 서버 로그의 신호·종료 시각, 프로세스 수명, Sysmon 후보를 함께 대조한다.

Windows Error Reporting(WER) 미니덤프 수집은 개발 PC에서만 관리자 PowerShell로 명시적으로 켠다. 기존 `node.exe` LocalDumps 설정 또는 DEXCOWIN MES 관리 표식이 있으면 덮어쓰지 않고 중단한다. 실제 적용 전에 `-WhatIf`로 대상을 확인하고, 확인 프롬프트에서 `Y`를 선택한다. 재부팅은 필요 없다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\enable-frontend-crash-dumps.ps1 -WhatIf
powershell -ExecutionPolicy Bypass -File .\scripts\dev\enable-frontend-crash-dumps.ps1
```

설정은 `HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\node.exe`에 `DumpType=1`, `DumpCount=3`, `DumpFolder=C:\ERP\_attic\runtime\logs\frontend\crashdumps`를 기록한다. WER 미니덤프는 Windows 네이티브 미처리 충돌의 후보 증거다. 이 Windows 설정은 실행 파일 이름이 `node.exe`인 프로세스 전체에 적용되므로, 다른 Node 프로세스가 실제로 충돌해도 최대 3개의 덤프가 만들어질 수 있다. 조회 도구는 덤프 파일명의 PID와 종료 기준점 전후 시간창을 모두 맞춰 Next worker 증거로 다시 좁힌다. 출력의 `dumpStatus=process_crash_dump_captured`이면 `dumpPath`, `dumpCapturedUtc`, `dumpSizeBytes`를 함께 확인한다. `dumpStatus=dump_not_captured`는 해당 PID·시간창에서 덤프를 찾지 못했다는 뜻일 뿐이며, 외부 강제 종료 또는 비충돌 종료를 확정하는 증거가 아니다. 현재 Node 24.15/Windows 환경에서 `process.abort()`는 WER 덤프와 Node 보고서의 수집 검증 수단이 아니므로, 이 결과를 외부 종료 증거로 해석하지 않는다.

덤프와 Node 보고서는 비밀번호·토큰·업무 데이터가 들어 있을 수 있으므로 `_attic/runtime` 밖으로 복사하거나 커밋·업로드하지 않는다. 공식 WinDbg 설치 후 승인된 crashdumps 디렉터리의 `.dmp`만 다음 도구로 분석한다. 분석기는 GUI를 열지 않고 공식 `Microsoft.WinDbg` 패키지의 `amd64\cdb.exe`를 사용하며, 분석 보고서는 같은 런타임 디렉터리에 `*.analysis.txt`로 남는다.

```powershell
winget install --id Microsoft.WinDbg -e --source winget
powershell -ExecutionPolicy Bypass -File .\scripts\dev\analyze-frontend-crash-dump.ps1
# 또는 특정 덤프
powershell -ExecutionPolicy Bypass -File .\scripts\dev\analyze-frontend-crash-dump.ps1 -DumpPath 'C:\ERP\_attic\runtime\logs\frontend\crashdumps\node.exe.<PID>.dmp'
```

분석 보고서에서는 `ExceptionCode`, `PROCESS_NAME`, `MODULE_NAME`/`IMAGE_NAME`, `FAILURE_BUCKET_ID`, `STACK_TEXT`를 먼저 확인하고 같은 시각의 `dev-server.log`와 Sysmon 후보를 대조한다. 수집을 끌 때는 다음 명령을 사용한다. 제거 도구는 자체 표식과 정확히 일치하는 레지스트리 설정만 제거하며, 이미 수집한 덤프와 분석 보고서는 보존한다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\disable-frontend-crash-dumps.ps1 -WhatIf
powershell -ExecutionPolicy Bypass -File .\scripts\dev\disable-frontend-crash-dumps.ps1
```

기본 조회 범위는 최근 2시간과 신호 또는 fallback 기준점 시각 전후 5초이며, `-Since`, `-WindowSeconds`(1~60), `-AsJson`을 선택할 수 있다. Sysmon 이벤트는 이벤트 뷰어의 `Applications and Services Logs > Microsoft > Windows > Sysmon > Operational` (`Microsoft-Windows-Sysmon/Operational`)에서 확인한다. 조회 도구는 각 기준점의 대상 PID와 시간창을 XPath에 넣어 Event ID 10만 읽으며, 전역 ProcessCreate/발신 명령줄 수집은 사용하지 않는다. Sysmon 자체 서비스·구성 변화(Event ID 4·16)는 필터할 수 없어 채널에 남을 수 있지만, 후보 분석에는 사용하지 않는다.

이벤트 접근량이 많으면 Operational 채널의 과거 레코드가 빠르게 덮어써질 수 있다. 예기치 않은 종료를 발견하면 즉시 관리자 PowerShell에서 조회하고, 필요한 `-AsJson` 결과를 `_attic/runtime/logs/frontend/`에 보존한다.

현재 Windows 11 개발 호스트에는 Microsoft의 **내장 Sysmon**을 사용한다. standalone `Sysmon64.exe` v15.21이 이 호스트에서 `0xC0000409`로 중단되어, Microsoft가 지원하는 내장 기능으로 전환했다. 내장 Sysmon과 standalone Sysmon은 함께 설치할 수 없다.

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName Sysmon -All -NoRestart
C:\Windows\System32\sysmon.exe -accepteula -i C:\ERP\scripts\dev\sysmon-dev-frontend.xml
```

현재 Operational 채널은 관리자만 읽을 수 있으므로, 후보 조회도 관리자 PowerShell에서 실행한다. `scripts/dev/install-sysmon-dev-frontend-monitor.ps1`와 대응 제거 도구는 **standalone 전용** 대안이며 기존 `Sysmon` 또는 `Sysmon64` 서비스가 있으면 의도적으로 중단한다. 현재 내장 Sysmon이 실행 중인 호스트에서는 이 스크립트를 실행하지 않는다.

### 관리자 감사로그 (Phase 5.2)

마스터·설정 변경(품목·직원·BOM·관리자 PIN·코드 마스터 등)이 일어나면 `admin_audit_logs` 테이블에 자동 기록된다. 재고 거래는 기존 `transaction_logs` 가 본질적 audit 이므로 여기에는 기록하지 않는다.

조회 API:
```
GET /api/admin/audit-logs                              # 최근 100건
GET /api/admin/audit-logs?limit=50&action=bom.update   # 정확 일치
GET /api/admin/audit-logs?action=bom.                  # prefix 매칭
GET /api/admin/audit-logs?target_type=item             # 대상 종류 필터
GET /api/admin/audit-logs?since=2026-04-26T00:00:00    # 시각 이후
```

각 행 필드:
- `action` (예: `item.create`, `item.update`, `bom.update`, `settings.pin_change`)
- `target_type` / `target_id` (예: `bom` / UUID)
- `payload_summary` — 변경 핵심 1줄 (예: `qty 11→12`, `name, role`)
- `request_id` — `X-Request-Id` 미들웨어가 발급한 ID 와 매칭 (서버 로그 추적용)
- `created_at`

보존 정책: 현재 무한 보관. 향후 정리 정책이 필요하면 별도 작업.

## 자동 실행 등록 (선택 — Windows Task Scheduler)

운영 PC 에 일과 종료 백업과 주 1회 백업 검증을 등록할 수 있다.

```powershell
# 저장소 루트에서 실행: 현재 checkout 경로를 자동으로 사용한다.
$repoRoot = (Resolve-Path .).Path
$ops = Join-Path $repoRoot "scripts\ops"

# 매일 18:00 백업
schtasks /Create /TN "MES Backup Daily" /TR "cmd /d /c `"$(Join-Path $ops 'backup_db.bat')`"" /SC DAILY /ST 18:00 /F

# 매주 월요일 09:00 백업 검증
schtasks /Create /TN "MES Verify Weekly" /TR "cmd /d /c `"$(Join-Path $ops 'verify_backup.bat')`"" /SC WEEKLY /D MON /ST 09:00 /F

# 매월 1일 03:00 정식 백업 최신 10개 유지 확인
schtasks /Create /TN "MES Cleanup Monthly" /TR "cmd /d /c `"$(Join-Path $ops 'cleanup_backups.bat')`"" /SC MONTHLY /D 1 /ST 03:00 /F
```

등록 후 작업 스케줄러 GUI 에서 "가장 높은 권한으로 실행" 옵션 체크 권장. 1회 등록하고 그대로 두면 365일 자동 운영.

### NAS 이중 백업 (매일 22:00 KST)

로컬 백업은 PC 장애에 대비할 수 없으므로, 검증이 끝난 SQLite 백업을 NAS에도 보관한다. NAS의 기존 `mes.db`는 건드리지 않으며 자동 백업은 아래 `scheduled` 폴더에만 날짜·UUID 파일명으로 저장한다.

```powershell
# 운영 체크아웃 C:\ERP 에 코드가 통합된 뒤 실행한다. .worktrees 경로를 예약 작업에 등록하지 않는다.
$repoRoot = "C:\ERP"
$batch = Join-Path $repoRoot "scripts\ops\backup_to_nas.bat"
$nasDir = "\\192.168.0.45\Nas 문서\03. 생산부\20. 조립공정\4. 김현우\MES\Data Base Beckup\scheduled"
$taskName = "DEXCOWIN MES DB Backup to NAS"
$argument = "/d /c call `"$batch`" --nas-dir `"$nasDir`" --keep 30"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $argument
$trigger = New-ScheduledTaskTrigger -Daily -At 10:00PM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$credential = Get-Credential -UserName "$env:USERDOMAIN\$env:USERNAME" -Message "Windows 로그인 계정 암호 입력"
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -User $credential.UserName -Password $credential.GetNetworkCredential().Password -Force
```

- 등록 계정은 NAS 쓰기 권한을 가진 Windows 계정이어야 한다. NAS 계정이 별도라면 작업 등록 전 해당 계정의 Windows 자격 증명 관리자에 `NAS` 접근 자격 증명을 저장한다. 암호를 저장소·스크립트·로그에 기록하지 않는다.
- 백업은 사용자 쓰기 권한만 사용하므로 관리자 권한으로 실행하지 않는다. 일반 사용자로 등록하면 UAC 승격 없이도 매일 실행된다.
- 작업 트리에서 검증한 변경은 운영 체크아웃 `C:\ERP`에 통합한 뒤에만 이 작업을 등록한다. 예약 작업이 `.worktrees`를 가리키면 작업 트리 정리 뒤 백업이 중단될 수 있다.
- 예약 작업은 비대화형 세션에서 `NAS` 이름 해석이 실패하지 않도록 NAS의 고정 IP `192.168.0.45`를 사용한다. 공유 폴더와 NAS 접근 자격 증명은 기존과 같다.
- 이 설정은 로그아웃 상태와 절전 상태에서도 실행한다. PC가 꺼져 있던 경우에는 다음 부팅 뒤 지연 실행하며, NAS 연결·복사·검증 실패 시 30분 간격으로 최대 3회 재시도한다.
- 로컬 검증 뒤 NAS 임시 파일에 복사하고 SHA-256 및 DB 검증을 통과할 때만 최종 파일명으로 바꾼다. NAS에는 자동 생성 백업 30개만 남기며 기존 `mes.db`와 수동 파일은 정리하지 않는다.

등록 직후에는 작업을 한 번 즉시 실행하고 결과를 확인한다.

```powershell
Start-ScheduledTask -TaskName "DEXCOWIN MES DB Backup to NAS"
Get-ScheduledTaskInfo -TaskName "DEXCOWIN MES DB Backup to NAS"
Get-Content "_attic\runtime\logs\ops\backup-to-nas.log" -Tail 50
```

NAS 백업으로 복구할 때는 백엔드·프론트를 먼저 정지한 뒤 NAS 파일을 직접 입력으로 사용한다.

```powershell
py scripts\ops\restore_db.py --sqlite "\\NAS\Nas 문서\03. 생산부\20. 조립공정\4. 김현우\MES\Data Base Beckup\scheduled\mes_YYYYMMDD_HHMMSS_ffffff_UUID.db" --target "backend\mes.db" --check
```

복구가 끝나면 백엔드를 다시 시작하고 `operational_readiness.bat`와 `healthcheck.bat`를 실행한다.

## 보안·권한·CI 관련

이 범위는 본 매뉴얼에서 다루지 않는다. 다음 단계 작업의 별도 문서에서 다룰 예정.

## 변경되지 않은 운영 항목 (이번 단계)

다음은 의도적으로 손대지 않았으며, 다음 작업에서 별도로 다룬다.

- `start.bat` 기본 동작 (옵션 추가도 보류)
- `docker-compose.yml` 포트 정렬·내용 변경 (현재 docker는 실험용으로만 둠)
- 루트 `mes.db` 정리
- `backend/seed*.py`·`bootstrap_db.py` 등 운영 보조 스크립트 위치 이동

자세한 배경은 `_attic/docs/BACKEND_REFACTOR_PLAN.md` 참고.

## 운영 안전장치: missing transaction effects 추적

`operational_readiness.bat`에서 `WARN missing transaction effects: N`이 나오면 신규 입출고를 막는 FAIL은 아니다. 다만 과거 거래 중 자동 취소와 감사 추적에 필요한 `inventory_effect`가 비어 있는 로그가 있다는 뜻이므로, 해당 과거 거래는 자동 취소하지 말고 히스토리와 현재 재고를 대조한 뒤 별도 보정 거래로 처리한다.

상세 확인은 다음 명령으로 한다.

```bat
python scripts\ops\check_inventory_integrity.py
```

직접 실행하면 거래 유형별 `count`, `sample_log_id`, `sample_mes_code`가 함께 출력된다. 운영자는 `sample_log_id`를 기준으로 히스토리/DB 로그를 확인하고, 같은 유형의 과거 로그가 현재 재고에 영향을 줄 수 있는지 판단한다. `operational_readiness.bat`는 아침 점검용 요약만 보여주므로 샘플 ID가 필요하면 직접 진단 스크립트를 실행한다.

## 취소 역전 원장 진단·활성화·복구

취소 정합성 도구는 저장소 루트에서 실행한다. `diagnose`는 읽기 전용이며 물리 불량재고와 불량 이동 원장, 부분·중복 취소, 연결 업무 상태, 출하배정과 주간 미분류 효과를 검사한다.

```bat
python scripts\ops\inventory_operation_admin.py diagnose
```

관리자 화면의 `정합성` 탭도 같은 진단 결과만 보여주며 복구 버튼은 제공하지 않는다. 문제 ID, 원인 거래, 현재값, 기대값과 자동 복구 가능 여부를 확인한다.

복구는 한 번에 문제 ID 하나만 선택한다. 기본 명령은 dry-run이고 DB를 변경하지 않는다.

```bat
python scripts\ops\inventory_operation_admin.py repair --problem-id <문제_ID> --approved-by <승인자>
```

실제 적용에는 검증된 백업, 승인자와 `--apply`가 모두 필요하다. 도구가 안전하게 결정할 수 있는 업무 상태·출하배정 불일치에만 적용되며 불량 수량처럼 원인을 추정해야 하는 문제는 거부한다.

```bat
python scripts\ops\inventory_operation_admin.py repair --problem-id <문제_ID> --approved-by <승인자> --validated-backup <백업_절대경로> --apply
```

활성화도 기본은 dry-run이다. 진단이 0건일 때만 취소 원장 기준 시각과 주간보고 시작 시각을 한 트랜잭션으로 저장한다. `--weekly-start`를 생략하면 다음 KST 월요일 00:00을 사용한다.

```bat
python scripts\ops\inventory_operation_admin.py activate --approved-by <승인자>
python scripts\ops\inventory_operation_admin.py activate --approved-by <승인자> --validated-backup <백업_절대경로> --apply
```

취소 원장 활성화 뒤 신규 작업은 `InventoryOperation`을 필수로 사용한다. 활성화 전에 생성된 같은 주 미취소 거래는 취소 요청 시 전체 재고 효과와 연결 업무를 확정할 수 있는 경우에만 원 작업으로 편입하고 별도 역전 작업을 생성한다. 불량 계보·효과·묶음 범위를 확정할 수 없는 거래는 아무 값도 바꾸지 않고 차단한다. 이미 기존 방식으로 취소된 거래와 과거 주간 스냅샷은 자동 변환하거나 재계산하지 않는다. 활성화와 복구의 전후 값·승인자는 관리자 감사로그에 남는다.

## Inventory Cutover

엑셀 운영을 중단하고 DEXCOWIN MES 기준 재고로 전환할 때는 전용 런북을 따른다.

- Runbook: `_attic/docs/operations/INVENTORY_CUTOVER_RUNBOOK.md`
- Script: `scripts/ops/inventory_cutover.py`

기본 실행은 dry-run이며 DB를 바꾸지 않는다.

```bat
python scripts\ops\inventory_cutover.py C:\path\real_inventory.csv
```

실제 적용은 다음처럼 확인 문구를 함께 넣어야 한다. SQLite 적용 전에는 스크립트가 백업을 먼저 만든다.

```bat
python scripts\ops\inventory_cutover.py C:\path\real_inventory.csv --apply --confirm START-OVER
```

적용 후에는 반드시 아래 두 검사를 통과해야 한다.

```bat
python scripts\ops\check_inventory_integrity.py
scripts\ops\operational_readiness.bat
```
