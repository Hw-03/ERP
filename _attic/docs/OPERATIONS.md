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
6. 서버 시작과 백엔드·프론트 헬스체크

백업 실패 시 아직 코드가 바뀌지 않은 기존 서버를 재기동하고 배포를 중단한다. 마이그레이션 또는 사후 검증 실패 시 서버와 DB를 자동 복원하지 않으며, 콘솔에 검증된 백업 절대 경로와 `restore_db.py --sqlite ... --target ... --check` 수동 명령을 출력한다.

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
- 회전: `ConcurrentRotatingFileHandler` 기반 다중 프로세스 안전 회전, 5MiB × 기본 5 backup (`mes.log.1` ~ `mes.log.5`)
- 환경 변수: `LOG_LEVEL` (기본 INFO), `LOG_BACKUP_COUNT` (1 이상의 정수, 기본 5; 잘못된 값은 기본값 사용), `MES_RUNTIME_ROOT` (전체 런타임 루트 재정의)
- 내용: 전역 예외 핸들러가 잡은 ValueError/IntegrityError/Exception + INFO 레벨 메시지

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
- `actor_employee_code` — 서버가 검증한 작업자 사번. 최초 PIN 설정은 비워 둔다.
- `bootstrap_employee_id` — 공개 초기 PIN challenge로 최초 PIN을 설정한 대상 직원 ID. 일반 작업에서는 비워 둔다.
- `target_type` / `target_id` (예: `bom` / UUID)
- `payload_summary` — 변경 핵심 1줄 (예: `qty 11→12`, `name, role`)
- `request_id` — `X-Request-Id` 미들웨어가 발급한 ID 와 매칭 (서버 로그 추적용)
- `created_at`

보존 정책: 현재 무한 보관. 향후 정리 정책이 필요하면 별도 작업.

## 작업자 PIN·서버 세션 운영 (CP3)

### 최초 PIN 설정

- 신규 직원과 관리자 초기화 직원의 PIN은 `0000`이며, 이 상태에서는 조회용 challenge 외의 업무 mutation을 실행할 수 없다.
- `0000`은 공개 초기값이므로 본인 확인 수단이 아니다. 관리자가 직원과 대면한 상태에서 로그인 화면의 최초 PIN 변경을 즉시 완료하게 한다.
- 새 PIN은 4자리 숫자이고 `0000`과 달라야 한다. 최초 변경이 끝난 뒤 새 PIN으로 다시 로그인해야 작업자 세션이 생긴다.
- 최초 변경 감사 행은 verified actor가 아니라 `bootstrap_employee_id`와 `request_id`로 추적한다.

### 세션 계약

- 브라우저에는 원문 opaque token을 `dexcowin_operator_session` HttpOnly·SameSite=Lax·Path=/ 쿠키로만 저장한다. DB에는 SHA-256 digest만 저장하고, 로그에는 원문 token·digest·전체 session UUID·PIN을 모두 남기지 않는다.
- 작업자 세션은 발급 시각부터 12시간의 절대 만료이며 sliding 연장은 없다. 화면 새로고침은 남은 세션을 복원할 뿐 만료 시각을 바꾸지 않는다.
- 새 operator 행 발급은 직원과 검증된 실제 client IP별 5분/10회로 제한하며 성공해도 예산을 초기화하지 않는다. 현재 boot에서 한 직원의 미폐기·미소비·미만료 operator 행은 Employee 잠금 아래 최대 32개다. 같은 유효 cookie 재로그인은 기존 행을 재사용하므로 이 발급 예산과 hard cap을 소비하지 않는다. 초과 시 `429 TOO_MANY_REQUESTS`, auth `Set-Cookie` 0, DB 변경 0이다.
- 일반 로그아웃은 유효한 operator와 같은 직원의 PIN-change capability만 직원 행 잠금 뒤 폐기하며, foreign challenge와 같은 직원의 다른 브라우저 세션은 보존한다. operator 없이 유효 challenge만 남은 일반 DELETE는 `X-MES-Employee-Code`가 잠금 뒤 다시 확인한 challenge 직원 코드와 같아야 하며, claim 누락·불일치는 `403 ACTOR_MISMATCH`이고 session·AdminAudit·ActivityAudit 변경은 없다. 공통 HTTP DB 감사는 서버가 검증한 actor가 있는 일반 write만 기록하고, 미검증 bootstrap 실패는 bounded access log에만 남는다. claim 없는 익명 DELETE는 유효 capability가 없을 때만 204 idempotent다. 최초 PIN 화면의 취소는 예상 직원 query claim으로 그 challenge만 폐기하고 `bootstrap_employee_id`가 든 별도 AdminAudit 행을 남긴다. 같은 cookie로 겹친 재로그인은 새 세션을 만들지 않고 잠금 뒤 재검증한 기존 capability를 재사용한다. 본인 PIN 변경, 관리자 PIN 초기화, 직원 비활성화·삭제는 대상 직원의 기존 세션을 모두 즉시 폐기한다. hard delete된 직원의 세션 행은 FK cascade로 함께 삭제된다. 지연된 응답이 그 사이 발급된 다른 탭의 cookie를 지우지 않도록 로그아웃·PIN 변경 응답은 auth cookie 만료 `Set-Cookie`를 보내지 않는다. 브라우저에 남은 token은 이미 DB에서 권한이 없고 다음 성공 login/challenge가 덮어쓰거나 절대 만료 때 제거된다.
- backend 재시작은 새 `boot_id`를 만들므로 재시작 전 세션은 즉시 무효다. 현재 배포는 backend worker 1개만 허용한다. process-local `boot_id` 상태에서 worker를 여러 개 띄우면 요청마다 세션 판정이 달라질 수 있으므로 shared boot identity 설계 전에는 multi-worker를 사용하지 않는다.
- `401 AUTH_REQUIRED`는 로그인 쿠키가 없거나 해석할 수 없다는 뜻이다. `401 SESSION_EXPIRED`는 만료·폐기·이전 boot 세션이다. `403 ACTOR_MISMATCH`는 body/header의 직원 주장이 로그인 작업자와 다르다는 뜻이며 요청값을 고쳐 재전송하기 전에 실제 로그인 작업자를 확인한다.
- PIN 실패가 반복되어 `429 TOO_MANY_REQUESTS`가 나오면 자동 재시도하지 않고 잠시 기다린 뒤 직원 선택과 PIN을 확인한다.
- 존재 직원의 로그인 실패 예산은 서버가 조회한 직원 ID와 검증된 실제 client IP별로 분리한다. 미존재 직원 ID의 dummy PIN 검증은 별도 bounded client-IP 예산을 공유하므로 random ID flood가 존재 직원의 로그인 예산을 소진하지 않는다. 이 둘과 별개로 known/unknown 및 성공/실패를 가리지 않은 실제 로그인 KDF는 client IP당 5분/60회 총예산을 공유하며 성공해도 초기화하지 않는다.
- 모든 canonical frontend 실행은 `scripts/next-server.js`에서 실제 `socket.remoteAddress`를 읽는다. 이 경계는 외부 요청의 `Forwarded`, `X-Forwarded-For`, `X-Real-IP`와 내부 assertion 헤더를 먼저 폐기한 뒤 실제 peer로 assertion을 다시 만든다. backend는 loopback Next hop 또는 60초 이내 유효한 HMAC assertion만 인정하고, 실패·누락·backend 직접 요청은 TCP peer로 fail-closed한다. backend launcher의 `--no-proxy-headers`를 유지하며 `FORWARDED_ALLOW_IPS`와 wildcard proxy 신뢰를 사용하지 않는다.
- Docker 실행 전 32-byte 이상의 무작위 `MES_PROXY_SHARED_SECRET`을 shell 환경에 설정한다. compose는 동일 값을 frontend와 backend에만 주입하며 값이 없으면 기동을 거부한다. 실제 값을 저장소·문서·로그에 기록하지 않는다.

  ```powershell
  $env:MES_PROXY_SHARED_SECRET = py -3 -c "import secrets; print(secrets.token_hex(32))"
  docker compose -f docker/docker-compose.yml up -d
  ```

### 운영 점검

아래 조회는 read-only다. `:current_boot_id`에는 `GET /api/app-session` 응답의 현재 `boot_id`를 사용한다. 직원 수·세션 수는 고정값을 기대하지 말고 추세와 비정상 잔존 여부를 판단한다.

```sql
-- 만료됐지만 아직 보존 중인 세션
SELECT COUNT(*) AS expired_retained
FROM operator_sessions
WHERE expires_at <= CURRENT_TIMESTAMP;

-- 활성 직원별 현재 boot의 미폐기·미소비·미만료 작업자 세션
SELECT e.employee_code, COUNT(*) AS active_sessions
FROM operator_sessions s
JOIN employees e ON e.employee_id = s.employee_id
WHERE s.purpose = 'operator'
  AND s.revoked_at IS NULL
  AND s.consumed_at IS NULL
  AND s.expires_at > CURRENT_TIMESTAMP
  AND s.boot_id = :current_boot_id
GROUP BY e.employee_code
ORDER BY e.employee_code;

-- 다른 boot에서 활성처럼 보이는 잔존 행. 인증에는 성공하지 않아야 한다.
SELECT COUNT(*) AS previous_boot_unrevoked
FROM operator_sessions
WHERE revoked_at IS NULL
  AND consumed_at IS NULL
  AND expires_at > CURRENT_TIMESTAMP
  AND boot_id <> :current_boot_id;

-- 최초 PIN 변경이 필요한 활성 직원
SELECT COUNT(*) AS active_pin_change_required
FROM employees
WHERE pin_requires_change = TRUE
  AND LOWER(CAST(is_active AS VARCHAR)) IN ('true', '1');
```

인증 실패와 rate-limit 발생은 `_attic/runtime/logs/backend/mes.log`에서 `/api/operator-session`의 `status=401`, `status=403`, `status=409`, `status=429`를 request ID와 함께 확인한다. session UUID 전체, cookie 값, PIN은 로그나 장애 보고서에 복사하지 않는다.

로그아웃과 PIN 변경 성공 후에도 브라우저 저장소에 opaque auth cookie가 잠시 보일 수 있다. 이는 늦은 응답이 더 최근 로그인 cookie를 삭제하는 교차 탭 경합을 막기 위한 정상 동작이다. 권한 정본은 `operator_sessions.revoked_at`/`consumed_at`이며, 잔존 cookie로 `GET /api/operator-session`과 mutation이 성공하면 안 된다. 새 login/challenge가 같은 이름을 덮어쓰거나 cookie 절대 만료 시 자연 제거된다.

로그아웃 DB 반영이 실패하면 로그인 카드에 `로그아웃 재시도`가 표시되고 업무 UI와 새 로그인은 차단된다. 브라우저의 비민감 pending-revoke 표식에는 상태와 원래 표시 사번만 들어가며 직원 UUID·이름·역할·PIN·token은 들어가지 않는다. 새로고침해도 그 사번 claim으로 서버 `DELETE`를 먼저 재시도하며, 204를 받은 뒤에만 세션 복원 확인과 새 로그인을 진행한다. 그 사이 origin cookie가 다른 작업자로 바뀌면 `403 ACTOR_MISMATCH`로 다른 작업자 세션은 보존된다. 이 상태에서 저장소 표식을 임의 삭제하지 말고 DB 연결을 복구한 뒤 화면의 재시도를 사용한다.

필수 PostgreSQL 경합 runner는 직원 lifecycle 요청도 실제 route decorator와 `VerifiedActor`의 actor/target 정렬 잠금, route의 잠긴 target 소비 경계로 검증한다. 전용 `TEST_POSTGRES_URL`이 없으면 이 항목은 통과가 아니라 `NOT_VERIFIED`로 기록한다.

### 세션 행 보존·정리

만료·폐기·소비 세션 행은 원인 조사와 감사 상관관계를 위해 기준 시각 이후 최소 90일 보존한다. 자동 정리 작업은 아직 등록하지 않으며, 승인된 유지보수 시간에 백업과 위 read-only 건수 확인을 마친 뒤 500행 이하 batch로 삭제한다. 정리 실패는 로그인이나 mutation transaction과 분리해 롤백하고 업무를 계속한다.

SQLite 예시:

```sql
DELETE FROM operator_sessions
WHERE session_id IN (
  SELECT session_id
  FROM operator_sessions
  WHERE COALESCE(consumed_at, revoked_at, expires_at) < datetime('now', '-90 days')
  LIMIT 500
);
```

PostgreSQL 예시:

```sql
WITH expired AS (
  SELECT session_id
  FROM operator_sessions
  WHERE COALESCE(consumed_at, revoked_at, expires_at)
        < CURRENT_TIMESTAMP - INTERVAL '90 days'
  LIMIT 500
)
DELETE FROM operator_sessions s
USING expired
WHERE s.session_id = expired.session_id;
```

### HTTP 전송 위험과 후속 경계

현재 HTTP LAN에서는 cookie의 `Secure` 속성을 사용할 수 없으므로 PIN·session challenge·operator token이 전송 구간에서 탈취될 위험이 남는다. 신뢰할 수 없는 네트워크나 인터넷에 공개할 수 있는 상태로 판정하지 않는다. HTTPS 적용 전에는 `SESSION_COOKIE_SECURE=1`을 켜지 않는다. HTTP에서 이 값을 켜면 브라우저가 cookie를 다시 보내지 않아 로그인 복원이 실패한다.

HTTPS, 인증서, HTTP→HTTPS redirect, 운영 환경 `Secure` cookie fail-closed는 후속 `SEC-01` 범위다. 이번 CP3는 해당 인프라를 변경하지 않는다.

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

## 보안 후속 경계

CP3의 작업자 session·actor 운영은 위 절차를 따른다. 부서별 권한 matrix 재설계, 계정 잠금 정책, SSO/외부 IdP, HTTPS·인증서는 별도 승인 설계와 후속 카드에서 다룬다.

## 변경되지 않은 운영 항목 (이번 단계)

다음은 의도적으로 손대지 않았으며, 다음 작업에서 별도로 다룬다.

- `start.bat` 기본 동작 (옵션 추가도 보류)
- `docker-compose.yml` 포트·DB 배치 (client-IP assertion 공유 비밀 계약만 추가)
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
