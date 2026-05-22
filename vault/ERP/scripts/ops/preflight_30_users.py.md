---
layer: scripts
---

# preflight_30_users.py — 30명 동시 운영 사전 점검

> [!summary] 100점 기준. health / capacity / concurrency. ✅ PASS / ⚠️  WARN / ❌ FAIL

## 1. 역할
--url 지정(기본 http://localhost:8000). /health /production/capacity /api/stock-requests/test-concurrent 엔드포인트. 종료: 0=PASS, 1=FAIL, 2=WARN만.

## 2. 실제 원본 위치
erp/scripts/ops/preflight_30_users.py

## 3. 관련 형제 파일
- [[load_test_30_users.py.md|부하 테스트]]
- [[check_inventory_integrity.py.md|무결성 점검]]
