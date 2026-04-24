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
> 이 Vault의 첫 화면.
> 처음 읽는 사람, 전체 지도, 코드 허브, 최근 변경 포인트를 한 번에 탐색하기 위한 관제실 문서다.

## Quick Launch

| 목적 | 바로가기 |
|---|---|
| 첫 인수인계 | 처음 읽는 사람 |
| 전체 지도 | ERP MOC |
| 용어 확인 | 용어 사전 |
| 문제 해결 | FAQ 전체 |
| 최신 인계 | `docs/AI_HANDOVER.md.md` |
| 진행 현황 | `docs/CODEX_PROGRESS.md.md` |
| 코드 규칙 | `docs/ITEM_CODE_RULES.md.md` |

## 핵심 허브

| 영역 | 문서 |
|---|---|
| Backend | `backend/backend.md` |
| Frontend | `frontend/frontend.md` |
| Mobile UI | `frontend/app/legacy/_components/mobile/mobile.md` |
| Docker | `docker/docker.md` |
| Data | `data/data.md` |
| Scripts | `scripts/scripts.md` |

## 추천 읽기 경로

| 시간 | 읽을 문서 | 목표 |
|---|---|---|
| 첫 30분 | 처음 읽는 사람 -> ERP MOC -> 용어 사전 | 프로젝트 정체 파악 |
| 첫 2시간 | frontend/frontend -> mobile/mobile -> backend/backend -> api.ts | 화면/서버 연결 이해 |
| 첫 하루 | 시나리오 4종 -> ITEM_CODE_RULES -> CODEX_PROGRESS | 실제 운영 흐름과 최근 변경 파악 |

## 이번 브랜치 체크포인트

- `docker/` 폴더 생김
- 모바일 UI 하위 구조 대폭 추가
- 재고 무결성/재고 계산 서비스 분리
- 모델 관리 라우터 추가
- 오래된 docs 리포트 정리

## Active Notes

```dataview
TABLE layer AS "Layer", type AS "Type", source_path AS "Source"
FROM ""
WHERE project = "ERP" AND status = "active"
SORT layer ASC, file.name ASC
LIMIT 50
```

## Open Work

```dataview
TASK
FROM ""
WHERE !completed AND contains(tags, "erp")
SORT file.name ASC
```

## 운영 원칙

> [!tip]
> 실제 코드와 설명이 다르면 실제 코드가 우선이다.

> [!warning]
> `_vault` 문서는 이해를 돕는 독립 영역이다. 원본 코드 허브와 직접 마구 연결하지 않고, `_vault` 내부 허브를 통해 따라간다.

Up: [[_dashboards]]

