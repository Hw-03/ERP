---
type: index
project: ERP
layer: scripts
status: active
tags:
  - erp
  - scripts
  - utility
aliases:
  - 스크립트 폴더
---

# scripts

> [!summary] 역할
> 데이터 정리, DB 점검, 이관, 보조 생성 작업을 수동으로 돌리는 스크립트 폴더.
> 서비스 코드와 분리된 운영 보조 도구들이 계속 모이는 곳이다.

## 핵심 스크립트

| 파일 | 역할 |
|---|---|
| [[scripts/erp_integration.py.md]] | 엑셀 원본을 ERP CSV로 통합 |
| [[scripts/import_real_inventory.py.md]] | 실제 재고 양식을 DB 반영 |
| [[scripts/migrate_erp_schema.py.md]] | 스키마 마이그레이션 |
| [[scripts/reapply_erp_codes.py.md]] | ERP 코드 재계산 |
| [[scripts/check_db.py.md]] | DB 상태 점검 |
| [[scripts/fix_legacy_items.py.md]] | 기존 품목 데이터 정리 |
| [[scripts/migrate_bf_to_af.py.md]] | 코드 규칙 변경 보정 |
| [[scripts/generate_devlog.py.md]] | 개발 로그 생성 |
| [[scripts/split_logo.py.md]] | 로고 자산 분할 |

## 이번 브랜치 포인트

- 운영 점검용 `check_db.py` 가 추가됐다.
- 코드 규칙 정리와 관련된 보정 스크립트가 늘었다.
- 이미지 자산 처리용 `split_logo.py` 와 `split_logos/` 폴더가 생겼다.

## 실행 전 주의

- 대상 DB 파일과 경로를 먼저 확인한다.
- dry-run 옵션이 있으면 먼저 미리보기로 확인한다.
- 결과가 실제 운영 데이터에 들어가는지 항상 체크한다.

## 관련 문서

- [[data/data]]
- [[docs/ITEM_CODE_RULES.md.md]]
- [[backend/backend]]

Up: [[ERP]]

