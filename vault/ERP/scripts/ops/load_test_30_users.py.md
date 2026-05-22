---
layer: scripts
---

# load_test_30_users.py — 30명 동시 입출고 부하 테스트

> [!summary] --users 30 --rounds N --confirm. 테스트용 품목(TEST-*) + 직원만. 결과 JSON 저장

## 1. 역할
asyncio 다중 사용자 시뮬레이션. --dry-run(실행 X), --confirm(안전 장치). 테스트 품목/직원만. outputs/load_test/YYYYMMDD_HHMMSS_report.json.

## 2. 실제 원본 위치
erp/scripts/ops/load_test_30_users.py

## 3. 관련 형제 파일
- [[preflight_30_users.py.md|사전 점검]]
- [[check_inventory_integrity.py.md|무결성 점검]]
