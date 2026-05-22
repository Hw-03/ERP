---
type: folder-note
source_path: "scripts/ops"
importance: important
layer: scripts
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 ops

## 이 폴더는 무엇을 위한 곳인가

실제 운영에서 쓰는 백업, 복구, 헬스체크, 정합성 점검 도구입니다.

## 현장 업무와의 관계

장애 대응이나 하루 운영 점검 때 직접 손이 가는 폴더입니다.

## 언제 보면 좋나

- DB 백업이 필요할 때
- 서버가 살아 있는지 확인할 때
- 재고 숫자가 의심될 때

## 먼저 볼 파일 5개

- [[ERP/scripts/ops/backup_db.py]] — `backup_db.py`는 운영자가 백업, 복구, 헬스체크, 정합성 확인에 쓰는 운영 스크립트입니다.
- [[ERP/scripts/ops/check_inventory_integrity.py]] — `check_inventory_integrity.py`는 운영자가 백업, 복구, 헬스체크, 정합성 확인에 쓰는 운영 스크립트입니다.
- [[ERP/scripts/ops/reconcile_inventory.bat]] — `reconcile_inventory.bat`는 운영자가 백업, 복구, 헬스체크, 정합성 확인에 쓰는 운영 스크립트입니다.
- [[ERP/scripts/ops/restore_db.py]] — `restore_db.py`는 운영자가 백업, 복구, 헬스체크, 정합성 확인에 쓰는 운영 스크립트입니다.
- [[ERP/scripts/ops/_verify_backup.py]] — `_verify_backup.py`는 운영자가 백업, 복구, 헬스체크, 정합성 확인에 쓰는 운영 스크립트입니다.

> [!info]- 추가 파일
> - [[ERP/scripts/ops/backup_db.bat]] — backup_db.bat
> - [[ERP/scripts/ops/cleanup_backups.bat]] — cleanup_backups.bat
> - [[ERP/scripts/ops/healthcheck.bat]] — healthcheck.bat
> - [[ERP/scripts/ops/load_test_30_users.py]] — load_test_30_users.py
> - [[ERP/scripts/ops/preflight_30_users.py]] — preflight_30_users.py
> - [[ERP/scripts/ops/restore_db.bat]] — restore_db.bat
> - [[ERP/scripts/ops/verify_backup.bat]] — verify_backup.bat

## 조심할 점

restore 계열은 DB를 되돌릴 수 있으므로 실행 전 백업 파일과 현재 DB를 반드시 확인해야 합니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/scripts/📁_scripts]]
