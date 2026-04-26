# 운영 매뉴얼

내부 ERP를 365일 켜두는 PC에서 운영하는 사람을 위한 매뉴얼. 보안/권한·CI/CD·실 서비스 등록은 이 문서의 범위가 아니다.

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
