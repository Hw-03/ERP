---
type: index
project: DEXCOWIN MES
layer: docs
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/docs/operations/
tags: [vault, index, folder-marker]
aliases:
  - "operations"
  - "operations.md"
---

# 📁 operations

> [!summary] 역할
> DEXCOWIN MES 운영 상세 문서 4종 — 일일 체크리스트·장애 대응·동시 운영·PostgreSQL 전환.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/docs/operations/` 의 vault 미러.

## 어떤 파일들이 있나

- [[erp/docs/operations/DAILY_OPERATION_CHECKLIST.md|DAILY_OPERATION_CHECKLIST.md]] — 30명 동시 운영 기준. 아침 시작·운영 전·운영 중·종료 점검 항목. FAIL 1건 이상 시 INCIDENT_RESPONSE 참조
- [[erp/docs/operations/INCIDENT_RESPONSE.md|INCIDENT_RESPONSE.md]] — 장애 유형별 즉시 조치 절차 (재고 음수·서버 다운·백업 실패 등). 즉시 연락처 기재 필요
- [[erp/docs/operations/CONCURRENT_LOCAL_OPERATION.md|CONCURRENT_LOCAL_OPERATION.md]] — SQLite (10명 이하) vs PostgreSQL (30명 이상) 안전 범위 비교. 30명 실사용 기준 PostgreSQL 필수
- [[erp/docs/operations/POSTGRES_LOCAL_SERVER_RUNBOOK.md|POSTGRES_LOCAL_SERVER_RUNBOOK.md]] — PostgreSQL 로컬 서버 설치·설정·운영 절차 (Docker 기반)

## 도메인 컨텍스트

`DAILY_OPERATION_CHECKLIST.md` 는 `scripts/ops/` 스크립트를 구체적인 실행 명령으로 참조한다. 스크립트 경로나 옵션이 바뀌면 이 문서도 함께 갱신해야 한다.

`CONCURRENT_LOCAL_OPERATION.md` 는 DB 엔진 선택 근거 문서다 — SQLite 와 PostgreSQL 의 락 방식 차이(row-level FOR UPDATE vs WAL 직렬화)가 정리돼 있다.

## ⚠️ 위험 포인트

- `INCIDENT_RESPONSE.md` 의 즉시 연락처 항목이 비어 있다. 운영 투입 전 기재 필수.
- 체크리스트와 실제 스크립트 경로가 불일치하면 장애 대응이 느려진다. 스크립트 이동·이름 변경 시 문서 동기화 필수.

## 관련 가이드

- [[erp/_vault/guides/ops-runbook]]
- [[erp/scripts/ops/📁_ops|scripts/ops/]]
