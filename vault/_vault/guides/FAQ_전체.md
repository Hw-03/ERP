---
type: guide
project: ERP
status: active
updated: 2026-04-27
tags:
  - erp
  - guide
  - faq
aliases:
  - FAQ
  - 자주 묻는 질문
---

# FAQ 전체


## Q. 실제 최신 기준은 어디인가요?

실제 코드가 최종 기준이다. Vault 노트는 인수인계를 돕는 설명이고, 코드와 다르면 코드를 우선한다.

## Q. main과 vault-sync는 왜 나뉘나요?

`main`은 코드만 유지한다. Obsidian 인수인계 문서인 `vault/`는 `vault-sync` 브랜치에만 둔다. 두 브랜치의 코드 부분은 같아야 한다.

## Q. 현재 실제 UI는 어디인가요?

`frontend/app/legacy`다. 이름 때문에 오래된 화면처럼 보이지만 현재 메인 UI다.

## Q. inventory 라우터 파일이 안 보입니다.

최신 구조에서는 `backend/app/routers/inventory.py` 단일 파일이 아니라 `backend/app/routers/inventory/` 패키지로 나뉘었다.

## Q. 관리자/재고/입출고 화면은 어디를 봐야 하나요?

- 재고 화면: [[frontend/app/legacy/_components/_inventory_sections/_inventory_sections]]
- 입출고 wizard: [[frontend/app/legacy/_components/_warehouse_steps/_warehouse_steps]]
- 관리자: [[frontend/app/legacy/_components/_admin_sections/_admin_sections]]
- 이력: [[frontend/app/legacy/_components/_history_sections/_history_sections]]

## Q. 운영 백업/복구는 어디인가요?

[[scripts/ops/ops]]에서 시작한다. DB를 건드리는 작업은 백업과 복구 절차를 먼저 확인한다.

## Q. 품목코드 규칙은 어디가 기준인가요?

[[docs/ITEM_CODE_RULES.md.md]]가 기준이다. 특히 조립 F 타입은 `AF`이고 `BF`는 사용하지 않는다.

Up: [[_vault/guides/_guides]]
