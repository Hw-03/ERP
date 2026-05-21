---
type: index
project: DEXCOWIN MES
layer: scripts
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/scripts/dev/
tags: [vault, index, folder-marker]
aliases:
  - "dev"
  - "dev.md"
---

# 📁 dev

> [!summary] 역할
> 개발·데이터 작업 보조 스크립트 — commit 전 검증, 매칭 알고리즘 적용, 감사 CSV 백필.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/scripts/dev/` 의 vault 미러.

## 어떤 파일들이 있나

필수:
- [[erp/scripts/dev/verify_local.ps1|verify_local.ps1]] — commit/push 전 실행 필수. frontend lint/typecheck, backend 테스트 순차 실행

매칭 알고리즘:
- [[erp/scripts/dev/kwon_match_apply.py|kwon_match_apply.py]] — 권동환 사원 재고 파일에 MES 품명·코드 매칭 결과 반영. L1~L3 자동 채택, L4~L6 추정(노란), 미매칭(회색)
- [[erp/scripts/dev/build_candidate_table.py|build_candidate_table.py]] — 매칭 후보 테이블 생성
- [[erp/scripts/dev/_kwon_match_v3.py|_kwon_match_v3.py]] — 매칭 알고리즘 v3 (kwon_match_apply 의 전신, 참조용)

감사 CSV:
- [[erp/scripts/dev/backfill_audit_csv.py|backfill_audit_csv.py]] — DB `TransactionLog` 기준 월별 CSV 재작성. idempotent. 환경변수 `AUDIT_CSV_DIR` / `DATABASE_URL` 지원
- [[erp/scripts/dev/a_file_mes_code_apply.py|a_file_mes_code_apply.py]] — A 파일 기준으로 MES 코드 적용
- [[erp/scripts/dev/rewrite_output_with_a_as_truth.py|rewrite_output_with_a_as_truth.py]] — A 파일을 정본으로 출력 재작성
- [[erp/scripts/dev/seed_history_cases.py|seed_history_cases.py]] — 히스토리 케이스 시드 데이터 삽입

## 도메인 컨텍스트

`verify_local.ps1` 은 `git rev-parse --show-toplevel` 로 repo 루트를 계산하므로 어느 위치에서 실행해도 경로가 정확하다.

매칭 스크립트들 (`kwon_match_*`, `build_candidate_table`, `rewrite_output_*`) 은 `_attic/data/` 의 실제 재고 파일을 입출력으로 사용한다. 샘플 데이터와 실데이터 혼용 금지.

## ⚠️ 위험 포인트

- **`verify_local.ps1` 미실행 시 GitHub CI 실패** — push 전 반드시 실행할 것:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1
  ```
- 매칭 스크립트는 `_attic/` 원본 파일을 덮어쓰지 않고 새 파일명으로 저장하지만, 경로 확인 후 실행할 것.

## 관련 가이드

- [[erp/_vault/guides/dev-workflow]]

## 자식 폴더

- [[erp/scripts/dev/split_logos/📁_split_logos|split_logos/]]
