---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-08-30-user-readiness-score-final.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-08-30-user-readiness-score-final.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-08-30-user-readiness-score-final.md]]

## 원본 첫 줄 (또는 메타)

```
# 30명 실사용 준비도 최종 평가 — 2026-05-08

## 개요

DEXCOWIN MES 의 30명 동시 운영 준비도를 12개 항목으로 평가한다.
세션 1~4에 걸쳐 진행된 보강 작업 이후의 최종 점수다.

**핵심 전제**: "SQLite 30명 운영"은 SQLite의 한계를 기술적으로 극복하는 방향이 아닌,
**SQLite 사용을 차단하고 PostgreSQL 강제**하는 방향으로 90점을 달성한다.

---

## 항목별 점수

| # | 항목 | 세션1 전 | 세션4 후 | 변화 |
|---|------|--------:|--------:|:----:|
| 1 | 동시성 위험 인식 | 70 | 95 | +25 |
| 2 | reserve() 원자성 | 50 | 95 | +45 |
| 3 | 일반 재고 이동 안정성 | 40 | 92 | +52 |
| 4 | SQLite 30명 운영 | 20 | 90 | +70 |
| 5 | PostgreSQL 30명 운영 | 60 | 92 | +32 |
| 6 | 요청번호 중복 방지 | 60 | 92 | +32 |
| 7 | 승인 중복 방지 | 60 | 92 | +32 |
| 8 | 프론트 중복 클릭 방지 | 40 | 92 | +52 |
| 9 | 동시성 테스트 범위 | 30 | 92 | +62 |
```
