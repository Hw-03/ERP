---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/research/2026-05-08-30-user-readiness-score.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# 2026-05-08-30-user-readiness-score.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/research/2026-05-08-30-user-readiness-score.md]]

## 원본 첫 줄 (또는 메타)

```
# 30명 실사용 준비도 점수표
**작성일**: 2026-05-08 | **커밋 기준**: 174387e (1차) → 2차 보강 후

---

## 개선 전 점수 (174387e, 1차 보강 완료 시점)

| 항목 | 점수 | 판단 |
|------|---:|---|
| 동시성 위험 인식 | 90 | 위험 지점 잘 파악 |
| reserve() 원자성 | 95 | 조건부 UPDATE 적용 |
| 일반 재고 이동 안정성 | 75 | PostgreSQL 괜찮음, SQLite 위험 |
| SQLite 30명 운영 | 35 | 다음주 실사용 기준 부적합 |
| PostgreSQL 30명 운영 | 82 | 가능권, 부하테스트 필요 |
| 요청번호 중복 방지 | 85 | 랜덤+재시도 구조 |
| 승인 중복 방지 | 82 | FOR UPDATE 기준 |
| 프론트 중복 클릭 방지 | 55 | 일부만 적용 |
| 동시성 테스트 범위 | 65 | 3종 (reserve/approve/코드) |
| 실제 30명 부하 테스트 | 40 | 스크립트만 있음 |
| 마이그레이션/운영 준비 | 65 | 절차 보강 필요 |
| 장애 대응/복구 | 60 | 문서화 부족 |
| **총점** | **68** | 실운영 투입 전 보강 필요 |

---

```
