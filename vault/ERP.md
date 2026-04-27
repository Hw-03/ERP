---
type: index
project: ERP
layer: root
status: active
updated: 2026-04-27
tags:
  - erp
  - root
  - hub
aliases:
  - ERP
  - ERP Root
  - ERP 프로젝트
---

# ERP

> [!summary] 역할
> `vault-sync` 브랜치에서만 존재하는 Obsidian 인수인계 루트 허브다. 현재 코드는 `main`과 같고, 차이는 `vault/` 문서뿐이다.

## 브랜치 정책

- `main`: 코드만 유지한다. `vault/`를 커밋하지 않는다.
- `vault-sync`: `main`과 같은 코드 + Obsidian `vault/` 문서를 보존한다.
- 최신 코드 구조를 보려면 이 노트에서 각 폴더 허브로 이동한다.

## 최상위 허브

- [[.github/.github|.github]]
- [[backend/backend|backend]]
- [[data/data|data]]
- [[docker/docker|docker]]
- [[docs/docs|docs]]
- [[frontend/frontend|frontend]]
- [[scripts/scripts|scripts]]
- [[_vault/dashboards/ERP_Control_Room|ERP Control Room]]
- [[_vault/guides/ERP_MOC|ERP MOC]]
- [[_vault/guides/처음_읽는_사람|처음 읽는 사람]]

## 루트 파일

- [[.gitignore|.gitignore]]
- [[CLAUDE.md|CLAUDE.md]]
- [[README.md|README.md]]
- [[start.bat|start.bat]]

## 현재 구조에서 특히 볼 곳

- [[backend/app/routers/inventory/inventory|inventory 라우터 패키지]]
- [[frontend/app/legacy/_components/_inventory_sections/_inventory_sections|재고 화면 섹션]]
- [[frontend/app/legacy/_components/_warehouse_steps/_warehouse_steps|입출고 wizard 단계]]
- [[frontend/app/legacy/_components/_admin_sections/_admin_sections|관리자 섹션]]
- [[scripts/ops/ops|운영 스크립트]]
- [[.github/workflows/workflows|CI workflow]]

## 원칙

> [!warning]
> 설명과 실제 코드가 다르면 실제 코드가 우선이다. Vault는 인수인계와 탐색을 돕는 레이어다.
