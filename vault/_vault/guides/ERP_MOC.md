---
type: moc
project: ERP
status: active
updated: 2026-04-27
tags:
  - erp
  - moc
  - hub
aliases:
  - ERP 메인 허브
  - 프로젝트 시작점
---

# ERP MOC


> [!summary] 프로젝트 개요
> DEXCOWIN 내부 ERP/MES 성격의 재고, 입출고, 생산, BOM, 운영 보조 시스템이다. 이 Vault는 실제 코드 구조를 Obsidian에서 따라가기 쉽게 만든 인수인계 레이어다.

## 시스템 흐름

```text
사용자 화면
  -> frontend/app/legacy
  -> frontend/lib/api.ts
  -> backend/app/routers
  -> backend/app/services
  -> backend/app/models.py
  -> SQLite DB
```

## 주요 허브

### Backend

- [[backend/backend]]
- [[backend/app/routers/routers]]
- [[backend/app/routers/inventory/inventory]]
- [[backend/app/services/services]]
- [[backend/app/models.py.md]]

### Frontend

- [[frontend/frontend]]
- [[frontend/app/legacy/legacy]]
- [[frontend/app/legacy/_components/_components]]
- [[frontend/app/legacy/_components/_inventory_sections/_inventory_sections]]
- [[frontend/app/legacy/_components/_warehouse_steps/_warehouse_steps]]
- [[frontend/app/legacy/_components/_admin_sections/_admin_sections]]
- [[frontend/lib/api.ts.md]]

### Ops / Docs / Data

- [[scripts/ops/ops]]
- [[scripts/migrations/migrations]]
- [[docs/docs]]
- [[data/data]]
- [[docker/docker]]
- [[.github/workflows/workflows]]

## 최신 구조 변화

- `backend/app/routers/inventory.py` 단일 파일은 사라지고 `backend/app/routers/inventory/` 패키지로 분리됐다.
- 백엔드에는 `_errors`, `_logging`, audit, export helper, transaction helper, 테스트/CI가 추가됐다.
- 프론트엔드는 데스크톱 inventory/history/admin/warehouse 영역이 섹션과 hook 단위로 쪼개졌다.
- 모바일 admin/dept wizard도 하위 step/section 파일로 분리됐다.
- `scripts/`는 `dev`, `migrations`, `ops`로 역할이 분리됐다.
- `main`은 코드만, `vault-sync`는 같은 코드에 Vault 문서를 더하는 정책이다.

## 읽는 원칙

1. 실제 수정은 원본 코드에서 한다.
2. Vault 노트는 인수인계와 탐색용 설명이다.
3. 품목코드 기준은 [[docs/ITEM_CODE_RULES.md.md]]를 우선한다.
4. 재고 수량 규칙은 백엔드 서비스와 프론트 표시가 같은 계산을 써야 한다.
5. 운영 작업은 `scripts/ops`와 백업 절차를 먼저 확인한다.

Up: [[_vault/guides/_guides]]
