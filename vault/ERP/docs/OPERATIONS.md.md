---
type: file-explanation
source_path: "docs/OPERATIONS.md"
importance: important
layer: docs
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# OPERATIONS.md — OPERATIONS.md 설명

## 이 파일은 무엇을 책임지나

`OPERATIONS.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.

## 업무 흐름에서의 의미

사람이 합의한 기준을 담지만, 코드가 바뀌었을 수 있으므로 현재 코드와 함께 읽어야 합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `운영 매뉴얼`
- `표준 실행 경로`
- `매일 정상 동작 확인 (1분)`
- `DB 백업`
- `백업 검증 (Phase 5.2)`
- `백업 정리 (Phase 5.2)`
- `DB 복구 (Phase 5.2)`
- `재시작 절차`
- `포트 충돌 대응`
- `1차 장애 대응`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/README.md]] — 이 문서는 DEXCOWIN MES가 무엇인지, 어떻게 실행하는지, 어떤 폴더를 먼저 봐야 하는지 알려주는 공식 입구입니다.
- [[ERP/docs/operations/DAILY_OPERATION_CHECKLIST.md]] — `DAILY_OPERATION_CHECKLIST.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.

## 조심할 점

큰 위험은 낮지만, 연결된 파일과 실행 위치를 확인한 뒤 수정하는 편이 안전합니다.

## 핵심 발췌

```md
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

- DB 파일: `backend/mes.db` (단일 SQLite 파일, WAL 모드)
- **수동 백업**:

```bat
scripts\ops\backup_db.bat
```

→ `backend/_backup/mes_YYYYMMDD_HHMMSS.db` 로 복사된다.

- **백업 안전성**: 스크립트는 SQLite 의 online backup API(`sqlite3 .backup` 또는 Python `sqlite3.backup`)를 사용하므로 백엔드가 가동 중이어도 트랜잭션 일관성이 보장된다. 둘 다 사용 불가한 환경에서는 WAL checkpoint 후 `mes.db / mes....
- **권장 주기**: 입출고가 많은 날 일과 종료 후 1회. 외부 디스크 보관이 필요하면 `backend/_backup/` 폴더를 통째로 복사한다.
- **루트 `mes.db` 와 `backend/mes.db` 가 둘 다 존재**할 수 있다. 운영 DB는 `backend/mes.db` 한 개만 사용한다(루트 파일은 손대지 말고, 정리는 다음 작업에서 별도로 진행 예정).

### 백업 검증 (Phase 5.2)

```bat
scripts\ops\verify_backup.bat
```

가장 최근 정식 백업(`mes_PRE-RESTORE_*` 제외) 1건에 대해:
- `PRAGMA integrity_check` 결과 (`ok` 면 정상)
- `items / inventory / transaction_logs / bom / admin_audit_logs` 행 수

운영 PC 에서 주 1회 정도 수행 권장.
```
