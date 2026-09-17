# 직원 동기화 사전검증 데이터 보존 수정 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**GOAL:** 직원 원본과 서비스를 변경하지 않고 SQLite 직원 동기화 사전검증이 기존 요청·라인·참조 데이터를 보존하며 통과할 준비를 완료한다.

**Goal:** `20260915_0034` 마이그레이션이 실제 `bootstrap_db.py --migrate` 경로에서도 `stock_requests`의 자식 데이터를 보존하도록 수정한다.

**Architecture:** SQLite에서는 새 외래키 생성을 위해 부모 테이블을 재생성하지 않고 additive column 변경만 수행한다. PostgreSQL 등 ALTER TABLE 외래키를 안전하게 지원하는 엔진에는 기존 FK를 생성한다. 실제 배포 경로 회귀와 폐기 가능한 DB 사전검증으로 증명한다.

**Tech Stack:** Python, Alembic, SQLAlchemy, SQLite, pytest, PowerShell

---

## Execution Strategy

**추천 모델: GPT-5.6 Terra** — 국소 마이그레이션 수정이지만 운영 데이터 보존 회귀를 실제 배포 경로에서 검증해야 한다.

**추천 추론 수준: High** — SQLite 트랜잭션·FK cascade와 Alembic batch 재생성의 결합 회귀를 놓치지 않아야 한다.

**팀 구성: 불필요** — 테스트 RED, 최소 수정, 사전검증이 순차 의존하므로 단독 작업이 효율적이다.

---

### Task 1: SQLite 자식 데이터 보존 회귀 `[GPT-5.6 Terra] [순차]`

**Files:**
- Modify: `backend/tests/migrations/test_as_research_approval.py`
- Modify: `backend/alembic/versions/20260915_0034_as_research_approval.py`

- [x] 기존 revision DB에 요청 라인과 `SET NULL` 참조를 만들고 `ensure_schema()`로 올린 뒤 값이 그대로인지 확인하는 테스트를 추가한다.
- [x] 새 테스트만 실행해 기존 코드에서 자식 행 유실로 실패하는 RED를 확인한다.
- [x] SQLite의 FK 추가용 `batch_alter_table` 전후에 실제 legacy 자식 행과 참조를 보존·복원하도록 최소 수정한다.
- [x] 새 테스트와 해당 마이그레이션 테스트 파일 전체를 실행해 GREEN을 확인한다.

### Task 2: 실제 사전검증 준비 증명 `[GPT-5.6 Terra] [순차]`

**Files:**
- Create: `_attic/handoff/active/2026-09-16-employee-sync-preflight-ready-todo.md`

- [x] 관련 마이그레이션·사전검증 테스트를 실행한다.
- [x] 직원 원본을 읽기 전용 온라인 스냅샷으로 복사해 `employee_schema_preflight.py` 전체를 실행한다.
- [x] 원본 DB에 마이그레이션이 적용되지 않았고 서비스가 정상이며, 복사본의 기존 테이블 행 해시와 FK·재고 검증이 통과했는지 확인한다.
- [x] 실제 동기화는 실행하지 않은 채 증거 경로와 다음 실행 조건을 활성 인계 문서에 기록한다.
