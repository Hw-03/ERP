---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_weekly_report.py — 주간보고 매트릭스

> [!summary] /weekly-report. Item.model_symbol 단일 글자만 노출, ProductSymbol 순서 동적

## 1. 역할
production_matrix 집계 검증(2026-05-20~). 매칭: model_symbol 1글자만, 다중/None 비노출. ProductSymbol DB로 라벨/순서 결정.

## 2. 실제 원본 위치
`erp/backend/tests/routers/test_weekly_report.py`

## 3. 관련 형제 파일
- [[test_transactions_summary.py.md|입출고 KPI]]
- [[../conftest.py.md|공용 픽스처]]
