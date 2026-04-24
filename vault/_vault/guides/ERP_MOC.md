---
type: moc
project: ERP
status: active
tags:
  - erp
  - moc
  - hub
aliases:
  - ERP 메인 허브
  - 프로젝트 시작점
---

# X-Ray ERP 시스템 - 메인 허브

> [!summary] 프로젝트 개요
> 정밀 X-Ray 장비 제조 회사의 자재/재고/생산 흐름을 관리하는 ERP/MES 성격의 내부 운영 시스템.
> FastAPI 백엔드와 Next.js 프론트엔드로 구성되어 있고, 현재 인수인계용 Vault는 `C:\ERP\vault` 아래에 있다.

## 어디부터 읽으면 되나요?

| 목적 | 시작 문서 |
|---|---|
| 처음 인수인계 받기 | 처음 읽는 사람 |
| 전체 구조 파악 | 이 문서 |
| 관제실처럼 보기 | ERP Control Room |
| 용어 확인 | 용어 사전 |
| 자주 막히는 질문 | FAQ 전체 |

## 폴더별 진입 링크

### Backend

- [[backend/backend]]
- [[backend/app/routers/routers]]
- [[backend/app/services/services]]
- [[backend/app/models.py.md]]

### Frontend

- [[frontend/frontend]]
- [[frontend/app/legacy/legacy]]
- [[frontend/app/legacy/_components/mobile/mobile]]
- [[frontend/lib/api.ts.md]]

### Infra / Data / Ops

- [[docker/docker]]
- [[data/data]]
- [[scripts/scripts]]
- [[docs/docs]]

### Vault 전용 문서

- [[_vault/_vault]]
- [[_vault/dashboards/ERP_Control_Room]]
- [[_vault/guides/처음_읽는_사람]]

## 이번 브랜치 핵심 변화

- Docker 설정이 루트에서 `docker/` 폴더로 이동
- `backend/schema.sql` 기준 정리
- `backend/app/routers/models.py` 추가
- `backend/app/services/integrity.py`, `stock_math.py` 추가
- `frontend/app/legacy/_components/mobile/` 대폭 확장
- 예전 모바일 탭 일부 `_archive` 이동
- `docs/ITEM_CODE_RULES.md` 가 코드 규칙 기준 문서로 정리

## 지금 구조를 이해하는 가장 짧은 흐름

```text
사용자 화면
  -> frontend/app/legacy
  -> frontend/lib/api.ts
  -> backend/app/routers
  -> backend/app/services
  -> backend/app/models.py
  -> DB
```

## 특별히 먼저 볼 폴더

| 폴더 | 이유 |
|---|---|
| `frontend/app/legacy/_components/mobile/` | 이번 브랜치에서 가장 크게 늘어난 UI 영역 |
| `backend/app/services/` | 재고 계산/무결성 책임이 더 잘 나뉜 핵심 영역 |
| `docker/` | 실행 설정 위치가 바뀐 부분 |
| `docs/` | 기준 문서가 정리된 부분 |

## 실제 코드는 어디 있나요?

실제 작업 기준 프로젝트 루트는 `C:\ERP` 이다.  
이 Vault는 그 구조를 설명하기 위한 문서 레이어이고, 실제 수정은 원본 코드에서 일어난다.

## 관련 문서

- 처음 읽는 사람
- ERP Control Room
- 용어 사전
- FAQ 전체

Up: [[_guides]]

