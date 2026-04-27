---
type: dashboard
project: ERP
status: active
updated: 2026-04-27
tags:
  - erp
  - dashboard
  - control-room
aliases:
  - ERP Control Room
  - ERP 관제실
---

# ERP Control Room


> [!summary] 역할
> ERP Vault의 첫 화면이다. 현재 코드 구조, 최근 변경 포인트, 읽기 순서를 한 번에 잡는다.

## Quick Launch

| 목적 | 바로가기 |
|---|---|
| 처음 인수인계 | [[_vault/guides/처음_읽는_사람|처음 읽는 사람]] |
| 전체 지도 | [[_vault/guides/ERP_MOC|ERP MOC]] |
| 용어 확인 | [[_vault/guides/용어사전|용어사전]] |
| 자주 막히는 질문 | [[_vault/guides/FAQ_전체|FAQ 전체]] |
| 최신 인수인계 원본 | [[docs/AI_HANDOVER.md.md|docs/AI_HANDOVER.md]] |
| 진행 기록 원본 | [[docs/CODEX_PROGRESS.md.md|docs/CODEX_PROGRESS.md]] |
| 코드 규칙 | [[docs/ITEM_CODE_RULES.md.md|docs/ITEM_CODE_RULES.md]] |

## 현재 운영 구조 핵심

- 백엔드: FastAPI, SQLAlchemy, SQLite, router/service/schema/model 분리.
- 프론트엔드: Next.js 14, 현재 실제 UI는 `frontend/app/legacy`.
- 재고 API: `backend/app/routers/inventory/` 패키지로 기능별 분리.
- 데스크톱 UI: inventory/history/admin/warehouse 섹션과 hook으로 분리.
- 운영: `scripts/ops`에 백업, 복구, 헬스체크, 정합성 점검 스크립트가 있다.
- CI: `.github/workflows/ci.yml`로 백엔드/프론트 검증을 돌린다.

## 추천 읽기 경로

| 시간 | 문서 | 목표 |
|---|---|---|
| 첫 30분 | [[_vault/guides/처음_읽는_사람]] -> [[_vault/guides/ERP_MOC]] -> [[_vault/guides/용어사전]] | 전체 방향 잡기 |
| 첫 2시간 | [[frontend/frontend]] -> [[frontend/app/legacy/legacy]] -> [[backend/backend]] -> [[frontend/lib/api.ts.md]] | 화면과 API 연결 이해 |
| 첫날 | [[backend/app/models.py.md]] -> [[backend/app/routers/routers]] -> [[backend/app/services/services]] -> [[scripts/ops/ops]] | 수정 전 위험 지점 파악 |

## Active Notes

```dataview
TABLE layer AS "Layer", type AS "Type", source_path AS "Source"
FROM ""
WHERE project = "ERP" AND status = "active"
SORT layer ASC, file.name ASC
LIMIT 80
```

## 브랜치 정책

> [!warning]
> `main`은 항상 vault-free다. `vault-sync`만 `vault/`를 포함한다. 코드와 노트가 다르면 실제 코드가 우선이다.

Up: [[_vault/dashboards/_dashboards]]
