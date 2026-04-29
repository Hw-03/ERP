# 운영 매뉴얼

내부 MES를 365일 켜두는 PC에서 운영하는 사람을 위한 매뉴얼. 보안/권한·CI/CD·실 서비스 등록은 이 문서의 범위가 아니다.

## 표준 실행 경로

- **표준은 `start.bat`**. `docker-compose.yml`은 실험 용도로만 두며 정규 운영에 사용하지 않는다(포트 정렬 등은 다음 단계 작업으로 미뤄둔 상태).
- 백엔드 포트: **8010** (uvicorn 직접 실행)
- 프론트엔드 포트: **3000** (Next.js dev)
- 처음 실행 시 의존성이 자동 설치된다.

```bat
start.bat
```

LAN IP는 자동 감지된다. 같은 사설망의 다른 PC에서도 `http://<LAN IP>:3000` 으로 접근 가능.

## 매일 정상 동작 확인 (1분)

1. 우측 상단 **새로고침** 버튼 → 데이터가 갱신되고 pill이 정상 메시지로 바뀌면 OK.
2. 또는 운영자 PC에서 `scripts/ops/healthcheck.bat` 실행:

```bat
scripts\ops\healthcheck.bat
```

응답에 `status: "ok"`, `database: "ok"`, 최근 거래 시각이 정상이면 OK. `inventory_mismatch_count > 0` 이면 데이터 정합성 점검 필요.

## DB 백업

- DB 파일: `backend/erp.db` (단일 SQLite 파일, WAL 모드)
- **수동 백업**:

```bat
scripts\ops\backup_db.bat
```

→ `backend/_backup/erp_YYYYMMDD_HHMMSS.db` 로 복사된다.

- **백업 안전성**: 스크립트는 SQLite 의 online backup API(`sqlite3 .backup` 또는 Python `sqlite3.backup`)를 사용하므로 백엔드가 가동 중이어도 트랜잭션 일관성이 보장된다. 둘 다 사용 불가한 환경에서는 WAL checkpoint 후 `erp.db / erp.db-wal / erp.db-shm` 3종을 함께 복사하는 폴백 경로로 진입한다.
- **권장 주기**: 입출고가 많은 날 일과 종료 후 1회. 외부 디스크 보관이 필요하면 `backend/_backup/` 폴더를 통째로 복사한다.
- **루트 `erp.db` 와 `backend/erp.db` 가 둘 다 존재**할 수 있다. 운영 DB는 `backend/erp.db` 한 개만 사용한다(루트 파일은 손대지 말고, 정리는 다음 작업에서 별도로 진행 예정).

### 백업 검증 (Phase 5.2)

```bat
scripts\ops\verify_backup.bat
```

가장 최근 정식 백업(`erp_PRE-RESTORE_*` 제외) 1건에 대해:
- `PRAGMA integrity_check` 결과 (`ok` 면 정상)
- `items / inventory / transaction_logs / bom / admin_audit_logs` 행 수

운영 PC 에서 주 1회 정도 수행 권장.

### 백업 정리 (Phase 5.2)

```bat
scripts\ops\cleanup_backups.bat        rem 기본 30일 이상 자동 삭제
scripts\ops\cleanup_backups.bat 60     rem 60일로 변경
```

`backend/_backup/erp_*.db` 중 N일 이상된 파일을 제거. 디스크 무한 증가 방지.

## DB 복구 (Phase 5.2)

운영 중에는 절대 DB 파일을 수동으로 덮어쓰지 말고, 반드시 다음 절차를 따른다.

1. **백엔드 정지** — `start.bat` 가 띄운 Backend 콘솔 창 닫기
2. 복구 명령 실행 (백업 파일명만 인자로 전달):
   ```bat
   scripts\ops\restore_db.bat erp_20260426_101530.db
   ```
   스크립트가 자동으로 수행:
   - 현재 `erp.db` 를 `erp_PRE-RESTORE_TS.db` 로 보존
   - 복구 대상 파일에 `PRAGMA integrity_check` (실패 시 중단)
   - `erp.db` 교체 + 잔여 `erp.db-wal / .db-shm` 제거
3. **백엔드 재기동** — `start.bat`
4. `scripts\ops\healthcheck.bat` 로 정상성 확인

복구 후에도 안전하게 PRE-RESTORE 스냅샷이 `_backup/` 에 남아있어 되돌릴 수 있다.

## 재시작 절차

1. **부드러운 재시작**: `start.bat` 가 띄운 두 검은 창(Backend / Frontend) 을 각각 닫고 다시 `start.bat` 실행
2. **강제 재시작**(잘 응답 안 할 때): 작업 관리자에서 `node`, `python`(uvicorn) 프로세스 종료 → `start.bat`
3. PC 재부팅 후에는 `start.bat` 만 다시 실행하면 된다(자동 시작 등록은 미적용)

## 포트 충돌 대응

증상: `start.bat` 실행 후 백엔드/프론트가 안 뜸 또는 "EADDRINUSE"

```bat
rem 사용 중인 프로세스 확인 (PID 추출)
netstat -ano | findstr :8010
netstat -ano | findstr :3000

rem 해당 PID 종료
taskkill /PID <PID> /F
```

종료 후 `start.bat` 재실행.

## 1차 장애 대응

| 증상 | 원인 후보 | 1차 조치 |
|---|---|---|
| 화면이 안 뜬다 | 백엔드/프론트가 죽음 | `start.bat` 재실행 |
| pill이 빨강 "데이터를 불러오지 못했습니다" | 백엔드 미기동 / 네트워크 / 포트 점유 | `scripts\healthcheck.bat` → 포트 충돌 절차 |
| pill이 노랑 "부족 N · 품절 M" | 안전재고 미달 — 정상 알림 | 대시보드 "조치 필요" 확인 |
| 입출고 일부만 처리됨 | 단건 처리 중 일부 실패 (재고 부족, 음수 등) | 결과 모달에서 "실패 항목만 다시 시도" |
| 결과 모달이 닫히지 않음 | submit 진행 중 (의도된 잠금) | "처리 중..." 표시가 사라질 때까지 대기 |
| `/health/detailed` 가 `inventory_mismatch_count > 0` | Inventory 합계와 위치별 합계 불일치 | DB 백업 후 운영 담당에게 보고 (수정은 별도 절차) |
| 다른 PC에서 접속 안 됨 | LAN IP 변경 / 방화벽 | start.bat 콘솔에 표시된 새 IP 확인, Windows 방화벽에서 8010·3000 인바운드 허용 |

## 데이터 정합성 점검(수동)

```bash
curl http://127.0.0.1:8010/health/detailed
```

응답 필드:

- `database`: `"ok"` 면 DB 연결 정상
- `tables`: 주요 테이블 행 수
- `open_queue_count`: 미처리 큐 건 수
- `inventory_mismatch_count`: Inventory 합계와 InventoryLocation 합계 불일치 건수 — `0` 이 정상
- `latest_transaction_at`: 최근 거래 시각

### 자동 1차 진단 (Phase 4 추가)

`scripts/ops/reconcile_inventory.bat` 한 번 실행하면:

1. `/health/detailed` 호출
2. `inventory_mismatch_count > 0` 발견 시 **자동으로 backup_db.bat 호출**
3. 응답 JSON 전체를 콘솔에 출력 → 운영 담당자에게 그대로 전달

자동 수정은 하지 않는다. 백업 + 보고까지만. 실제 수정은 개발자가 수동 절차로.

## 로그 확인

### 콘솔 로그
- 백엔드: `start.bat` 가 띄운 **Backend** 콘솔 창
- 프론트: **Frontend** 콘솔 창
- 브라우저: F12 → Console / Network 탭

### 파일 로그 (Phase 4 추가)
- 위치: `backend/logs/erp.log`
- 회전: `RotatingFileHandler` 5MB × 5 backup (`erp.log.1` ~ `erp.log.5`)
- 환경 변수: `LOG_LEVEL` (기본 INFO), `LOG_DIR` (기본 backend/logs)
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
- `target_type` / `target_id` (예: `bom` / UUID)
- `payload_summary` — 변경 핵심 1줄 (예: `qty 11→12`, `name, role`)
- `request_id` — `X-Request-Id` 미들웨어가 발급한 ID 와 매칭 (서버 로그 추적용)
- `created_at`

보존 정책: 현재 무한 보관. 향후 정리 정책이 필요하면 별도 작업.

## 자동 실행 등록 (선택 — Windows Task Scheduler)

운영 PC 에 일과 종료 백업과 주 1회 백업 검증을 등록할 수 있다.

```bat
rem 매일 18:00 백업
schtasks /Create /TN "MES Backup Daily" /TR "C:\Users\HW\Documents\GitHub\ERP\scripts\ops\backup_db.bat" /SC DAILY /ST 18:00 /F

rem 매주 월요일 09:00 백업 검증
schtasks /Create /TN "MES Verify Weekly" /TR "C:\Users\HW\Documents\GitHub\ERP\scripts\ops\verify_backup.bat" /SC WEEKLY /D MON /ST 09:00 /F

rem 매월 1일 03:00 30일 이상 백업 정리
schtasks /Create /TN "MES Cleanup Monthly" /TR "C:\Users\HW\Documents\GitHub\ERP\scripts\ops\cleanup_backups.bat" /SC MONTHLY /D 1 /ST 03:00 /F
```

등록 후 작업 스케줄러 GUI 에서 "가장 높은 권한으로 실행" 옵션 체크 권장. 1회 등록하고 그대로 두면 365일 자동 운영.

## 보안·권한·CI 관련

이 범위는 본 매뉴얼에서 다루지 않는다. 다음 단계 작업의 별도 문서에서 다룰 예정.

## 변경되지 않은 운영 항목 (이번 단계)

다음은 의도적으로 손대지 않았으며, 다음 작업에서 별도로 다룬다.

- `start.bat` 기본 동작 (옵션 추가도 보류)
- `docker-compose.yml` 포트 정렬·내용 변경 (현재 docker는 실험용으로만 둠)
- 루트 `erp.db` 정리
- `backend/seed*.py`·`bootstrap_db.py` 등 운영 보조 스크립트 위치 이동
- Alembic 마이그레이션 활성화

자세한 배경은 `docs/BACKEND_REFACTOR_PLAN.md` 참고.
