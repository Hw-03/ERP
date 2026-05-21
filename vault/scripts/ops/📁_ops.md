---
type: index
project: DEXCOWIN MES
layer: scripts
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/scripts/ops/
tags: [vault, index, folder-marker]
aliases:
  - "ops"
  - "ops.md"
---

# 📁 ops

> [!summary] 역할
> 운영 환경 정기 실행 스크립트 — DB 백업·복구, 헬스체크, 재고 정합성 점검, 부하 테스트.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/scripts/ops/` 의 vault 미러.

## 어떤 파일들이 있나

백업·복구:
- [[erp/scripts/ops/backup_db.bat|backup_db.bat]] — DB 백업 (WAL-safe). 우선순위: sqlite3 CLI → Python sqlite3.backup → WAL checkpoint+file copy 3단계 폴백
- [[erp/scripts/ops/backup_db.py|backup_db.py]] — Python 백업 스크립트 (backup_db.bat 이 호출하거나 직접 사용)
- [[erp/scripts/ops/restore_db.bat|restore_db.bat]] — DB 복구. **백엔드 중단 후 실행 필수.** 복구 전 현재 DB 스냅샷 자동 생성 (`mes_PRE-RESTORE_TS.db`) → integrity_check → 교체
- [[erp/scripts/ops/restore_db.py|restore_db.py]] — Python 복구 스크립트
- [[erp/scripts/ops/verify_backup.bat|verify_backup.bat]] — 백업 파일 무결성 검증
- [[erp/scripts/ops/_verify_backup.py|_verify_backup.py]] — 백업 검증 Python 구현
- [[erp/scripts/ops/cleanup_backups.bat|cleanup_backups.bat]] — N일 이상 된 백업 삭제 (기본 30일). 인수: `cleanup_backups.bat [days]`

점검:
- [[erp/scripts/ops/healthcheck.bat|healthcheck.bat]] — `GET /health/detailed` (포트 8010) 호출. 응답 그대로 출력
- [[erp/scripts/ops/reconcile_inventory.bat|reconcile_inventory.bat]] — `/health/detailed` 의 `inventory_mismatch_count` 확인. 0 초과 시 자동 백업 후 담당자 안내. **복구 자동화 없음**
- [[erp/scripts/ops/check_inventory_integrity.py|check_inventory_integrity.py]] — 서버 없이 DB 직접 접속해 재고 무결성 점검. 환경변수 `DATABASE_URL` 또는 `--db-url` 지원. 종료 코드 0=PASS, 1=위반

부하·사전점검:
- [[erp/scripts/ops/preflight_30_users.py|preflight_30_users.py]] — 30명 동시 운영 사전 점검 (`--url` 인수)
- [[erp/scripts/ops/load_test_30_users.py|load_test_30_users.py]] — 30명 동시 부하 테스트

## 도메인 컨텍스트

`backup_db.bat` 은 백엔드가 떠 있는 상태에서도 실행 가능 (WAL-safe). `restore_db.bat` 은 반드시 백엔드를 먼저 중단해야 한다.

정합성 위반 발견 시 `reconcile_inventory.bat` 은 자동 복구하지 않는다 — 발견·백업·보고만 자동화하고 수정은 개발자 수동 처리.

## ⚠️ 위험 포인트

- **`restore_db.bat` 은 반드시 백엔드 중단 후 실행.** 운영 중 복구 시 트랜잭션 충돌 및 데이터 손상 가능.
- `cleanup_backups.bat` 은 `backend/_backup/mes_*.db` 패턴만 삭제한다. `mes_PRE-RESTORE_*` 파일도 삭제 대상이므로 중요 복구 파일은 별도 위치에 보관할 것.
- `backup_db.bat` → `restore_db.bat` 순서를 반드시 지킬 것. 역순 또는 검증 없는 복구는 데이터 손실로 이어진다.

## 관련 가이드

- [[erp/_vault/guides/ops-runbook]]
- [[erp/docs/operations/📁_operations|docs/operations/]]
