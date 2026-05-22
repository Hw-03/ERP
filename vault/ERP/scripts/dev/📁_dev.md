---
type: folder-note
source_path: "scripts/dev"
importance: important
layer: scripts
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 dev

## 이 폴더는 무엇을 위한 곳인가

개발자가 검증, 데이터 정리, 임시 변환에 쓰는 보조 스크립트입니다.

## 현장 업무와의 관계

운영자가 평소 실행하는 곳은 아니지만, 코드 변경 전후 검증에 중요합니다.

## 언제 보면 좋나

- 커밋 전 검증을 돌릴 때
- 데이터 정제 실험을 다시 확인할 때

## 먼저 볼 파일 5개

- [[ERP/scripts/dev/verify_local.ps1]] — `verify_local.ps1`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.
- [[ERP/scripts/dev/_kwon_match_v3.py]] — `_kwon_match_v3.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.
- [[ERP/scripts/dev/a_file_mes_code_apply.py]] — `a_file_mes_code_apply.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.
- [[ERP/scripts/dev/backfill_audit_csv.py]] — `backfill_audit_csv.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.
- [[ERP/scripts/dev/build_candidate_table.py]] — `build_candidate_table.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.

> [!info]- 추가 파일
> - [[ERP/scripts/dev/dump_db_to_excel.py]] — dump_db_to_excel.py
> - [[ERP/scripts/dev/expand_green_split_rows.py]] — expand_green_split_rows.py
> - [[ERP/scripts/dev/kwon_match_apply.py]] — kwon_match_apply.py
> - [[ERP/scripts/dev/register_blue_items.py]] — register_blue_items.py
> - [[ERP/scripts/dev/rename_db_dump_sheets.py]] — rename_db_dump_sheets.py
> - [[ERP/scripts/dev/rewrite_output_with_a_as_truth.py]] — rewrite_output_with_a_as_truth.py
> - [[ERP/scripts/dev/seed_history_cases.py]] — seed_history_cases.py
> - [[ERP/scripts/dev/update_excel_blue_after_db.py]] — update_excel_blue_after_db.py

## 조심할 점

일부 스크립트는 과거 데이터 작업용입니다. 이름만 보고 운영 DB에 바로 실행하면 안 됩니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/scripts/📁_scripts]]
