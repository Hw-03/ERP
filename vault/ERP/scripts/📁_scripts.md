---
type: folder-note
source_path: "scripts"
importance: important
layer: scripts
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 scripts

## 이 폴더는 무엇을 위한 곳인가

개발, 운영, 백업, 복구, 데이터 정리 작업을 돕는 스크립트 모음입니다.

## 현장 업무와의 관계

운영 중 문제가 생겼을 때 백업, 헬스체크, 정합성 점검, DB 덤프 같은 일을 여기서 수행합니다.

## 언제 보면 좋나

- 서버 상태를 점검할 때
- DB를 백업/복구할 때
- 대량 데이터 정리나 검증을 할 때

## 주요 하위 폴더

- [[ERP/scripts/dev/📁_dev]] — 개발자가 검증, 데이터 정리, 임시 변환에 쓰는 보조 스크립트입니다.
- [[ERP/scripts/ops/📁_ops]] — 실제 운영에서 쓰는 백업, 복구, 헬스체크, 정합성 점검 도구입니다.

## 먼저 확인할 흐름

운영 중 서버가 이상하거나 재고 숫자가 의심될 때는 `ops/`를 먼저 봅니다. 여기에는 DB 백업, 복구, 헬스체크, 재고 정합성 확인처럼 실제 운영 안정성과 연결되는 도구가 있습니다.

개발자가 기능을 고치고 나서 “이 정도면 올려도 되는지” 확인할 때는 `dev/verify_local.ps1`을 봅니다. 이 스크립트는 백엔드 테스트, 프론트 타입 검사, 빌드 검증 같은 커밋 전 확인 흐름의 입구입니다.

## 먼저 볼 파일

- [[ERP/scripts/ops/backup_db.py]] — DB 백업을 만드는 핵심 스크립트입니다.
- [[ERP/scripts/ops/restore_db.py]] — 백업 DB를 되돌릴 때 보는 위험도가 높은 스크립트입니다.
- [[ERP/scripts/ops/check_inventory_integrity.py]] — 재고 정합성을 확인하는 운영 점검 도구입니다.
- [[ERP/scripts/ops/healthcheck.bat]] — 서버가 살아 있는지 빠르게 확인하는 배치 파일입니다.
- [[ERP/scripts/dev/verify_local.ps1]] — 변경 후 전체 검증을 돌리는 개발용 입구입니다.

## 조심할 점

운영 스크립트는 실제 DB 파일을 만질 수 있습니다. 실행 전 대상 파일과 백업 위치를 확인해야 합니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/📁_ERP]]
