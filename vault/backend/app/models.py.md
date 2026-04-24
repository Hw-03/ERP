---
type: code-note
project: ERP
layer: backend
source_path: backend/app/models.py
status: active
tags:
  - erp
  - backend
  - model
  - database
aliases:
  - DB 모델
  - 테이블 정의
---

# models.py

> [!summary] 역할
> ERP에서 쓰는 핵심 테이블과 Enum을 정의하는 ORM 모델 파일.
> 품목, 재고, 재고 위치, 거래 로그, 배치, BOM, 모델 슬롯, 코드 규칙 테이블까지 모두 여기서 연결된다.

## 쉬운 말로 설명

이 파일은 "DB 설계도"다.  
어떤 정보가 저장되고, 서로 어떻게 연결되는지 한눈에 보는 기준 파일이라서 인수인계 때 가장 먼저 보는 백엔드 문서 중 하나다.

## 이번 브랜치에서 특히 볼 것

- `Inventory.quantity` 는 `warehouse_qty + 모든 location 합` 이라는 불변식을 전제로 읽어야 한다.
- `ProductSymbol`, `ItemModel`, `ProcessType`, `ProcessFlowRule` 쪽이 제품 모델/ERP 코드 규칙과 직접 연결된다.
- 조립 최종 코드는 `BF` 가 아니라 `AF` 기준으로 이해해야 한다.

## 핵심 책임

- 품목(`Item`)과 재고(`Inventory`, `InventoryLocation`) 구조 정의
- 거래/배치(`TransactionLog`, `QueueBatch`, `QueueLine`) 구조 정의
- BOM, 출하 패키지, 실사/경고/오차 로그 구조 정의
- ERP 코드/모델 규칙용 기준 테이블 정의

## 관련 문서

- [[backend/app/main.py.md]]
- [[backend/app/services/stock_math.py.md]]
- [[docs/ITEM_CODE_RULES.md.md]]

Up: [[backend/app/app]]

