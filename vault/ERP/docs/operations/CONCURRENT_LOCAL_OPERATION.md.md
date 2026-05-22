---
layer: docs
---

# CONCURRENT_LOCAL_OPERATION.md — 30명 동시 운영 가이드

> [!summary] SQLite: 10명 이하 / PostgreSQL: 30명 이상. 안전 범위 및 전환 방법

## 1. 역할
동시성 비교표(SQLite WAL vs PG row lock). 10명 초과 시 503 위험. PostgreSQL 필수 결정. docker-compose 전환 단계.

## 2. 실제 원본 위치
erp/docs/operations/CONCURRENT_LOCAL_OPERATION.md

## 3. 관련 형제 파일
- [[POSTGRES_LOCAL_SERVER_RUNBOOK.md|PostgreSQL 로컬 운영]]
- [[../OPERATIONS.md|운영 매뉴얼]]
