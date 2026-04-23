---
type: dashboard
project: ERP
status: active
cssclasses:
  - erp-dashboard
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
> 이 문서는 ERP Vault의 **첫 화면**이다. 전체 구조, 업무 시나리오, 코드 노트, 진행 현황을 한 곳에서 빠르게 탐색한다.

## Quick Launch

| 목적 | 바로가기 |
|---|---|
| 처음 인수인계 | 처음 읽는 사람 ⭐ |
| 전체 지도 | ERP MOC |
| 용어 확인 | 용어 사전 |
| 자주 묻는 질문 | FAQ 전체 |
| AI 인계 | `docs/AI_HANDOVER.md.md` |
| 개발 진행 | `docs/CODEX_PROGRESS.md.md` |
| 통합 리포트 | `docs/ERP_Integration_Report.md.md` |

## Operations Map

| 흐름 | 설명 |
|---|---|
| 품목 등록 시나리오 | 새 품목 추가 시 화면, API, DB 흐름 |
| 재고 입출고 시나리오 | 입고, 출고, 이동, 불량 등록 |
| 생산 배치 시나리오 | 생산 배치와 BOM 백플러시 |
| 분해 반품 시나리오 | 분해, 반품, 재고 복귀 흐름 |

## Handover Path

| 시간 | 읽을 문서 | 목표 |
|---|---|---|
| 첫 30분 | 처음 읽는 사람 → ERP MOC → 용어 사전 | 프로젝트가 무엇인지 말할 수 있게 되기 |
| 첫 2시간 | `frontend/lib/api.ts.md` → `backend/app/routers/routers.md` → `backend/app/models.py.md` | 화면, API, DB 연결 이해하기 |
| 첫 하루 | 시나리오 4종 → `docs/CODEX_PROGRESS.md.md` → ERP System Map.canvas | 실제 업무 흐름과 개발 현황 파악하기 |

## System Entry Points

| 영역 | 핵심 노트 |
|---|---|
| Backend | `backend/backend.md` |
| Backend API | `backend/app/routers/routers.md` |
| Backend Services | `backend/app/services/services.md` |
| Frontend | `frontend/frontend.md` |
| Active UI | `frontend/app/legacy/legacy.md` |
| API Client | `frontend/lib/api.ts.md` |
| Database | `backend/app/models.py.md` |
| Migration Plan | `schema.sql.md` |

## Active Notes

```dataview
TABLE layer AS "Layer", type AS "Type", source_path AS "Source"
FROM ""
WHERE project = "ERP" AND status = "active"
SORT layer ASC, file.name ASC
LIMIT 40
```

## By Layer

```dataview
TABLE rows.file.link AS "Notes"
FROM ""
WHERE project = "ERP" AND layer
GROUP BY layer
SORT layer ASC
```

## Open Work

```dataview
TASK
FROM ""
WHERE !completed AND contains(tags, "erp")
SORT file.name ASC
```

## Suggested Canvases

- ERP System Map.canvas
- `ERP 시스템 전체 흐름.canvas`
- `Frontend 화면 - API - DB 모델.canvas`
- `입고 - 이동 - 생산 - 출하.canvas`
- `BOM 백플러시 흐름.canvas`

## Vault Rules

> [!tip] 운영 원칙
> 문서는 읽기 쉬운 한국어 설명을 먼저 두고, 실제 코드/경로는 그 뒤에 둔다. 새 코드 노트는 `_vault/templates/Code Note Template.md`에서 시작한다.

> [!warning] 주의
> `_archive`, `_backup`, `frontend/_archive`는 보존 영역이다. 명시 요청 없이 수정하지 않는다.

Up: [[_dashboards]]
