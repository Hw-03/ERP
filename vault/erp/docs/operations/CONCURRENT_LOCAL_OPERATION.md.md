---
type: code-note
project: DEXCOWIN MES
layer: docs
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/docs/operations/CONCURRENT_LOCAL_OPERATION.md
tags: [vault, code-note, b-tier]
---

# CONCURRENT_LOCAL_OPERATION.md — 30명 동시 운영 가이드

> [!summary] 역할
> SQLite 범위(10명 이하) vs PostgreSQL(30명 이상) 비교. 동시 쓰기 안전성/락 방식/충돌 처리 정리.

## 1. 이 파일의 역할
- SQLite: 기본 (WAL + busy_timeout), 10명 초과 시 503 위험
- PostgreSQL: 필수 (row-level FOR UPDATE), 30명 이상 안정
- docker-compose.yml 설정 예시 포함
- DATABASE_URL 변경 방법 (SQLite vs PostgreSQL)

## 2. 실제 원본 위치
`docs/operations/CONCURRENT_LOCAL_OPERATION.md` — 약 80줄 (마크다운)

## 3. 주요 내용
| 항목 | SQLite | PostgreSQL |
| 동시 쓰기 | 10명 이하 | 30명 이상 |
| 재고 락 | WAL + busy_timeout | row-level FOR UPDATE |
| 503 위험 | 높음(10명 초과) | 거의 없음 |
| 설정 난이도 | 없음 | Docker 필수 |

## 4. 어디서 쓰이는지
- 운영 계획 단계: DB 선택 의사결정
- 전환 작업: SQLite → PostgreSQL migration

## 5. ⚠️ 위험 포인트
- **30명 실사용 = PostgreSQL 필수** — SQLite는 개발/테스트용만
- docker-compose.yml 예시만 있고 실제 마이그레이션 스크립트 없음
- 기존 SQLite 데이터 → PostgreSQL 이관 방법 미문서화

## 6. 수정 전 체크
- database.py SQLAlchemy URL 파싱 확인 (PostgreSQL 문법)
- docker-compose up 후 DB 접속 확인
