---
type: code-note
project: ERP
layer: backend
source_path: backend/app/services/inventory.py
status: active
tags:
  - erp
  - backend
  - service
aliases:
  - 재고 서비스
  - inventory.py
---

# inventory.py

> [!summary] 역할
> 입고, 출고, 이동, 예약, 불량, 공급업체 반품까지 재고 변동의 실제 반영 로직을 담는 서비스 파일.
> 이번 브랜치에서는 공통 계산식은 `stock_math.py`, 무결성 검사는 `integrity.py` 로 나누고, 이 파일은 상태 변경에 더 집중한다.

## 쉬운 말로 설명

화면이나 라우터가 "재고를 바꿔야 한다"고 말하면, 실제로 DB 값을 움직이는 손 역할을 하는 파일이다.  
창고 재고, 부서 재고, 불량 재고, pending 예약을 어떻게 바꿀지 여기서 정한다.

## 핵심 책임

- `receive_confirmed`, `transfer_to_production`, `transfer_to_warehouse` 같은 재고 변동 처리
- `reserve`, `release`, `consume_pending` 으로 pending 수량 관리
- 카테고리별 기본 부서 매핑 제공
- 재고 총합 동기화

## 주의점

- 계산식 자체 설명은 `stock_math.py` 에서 보고, 이 파일은 "어떤 순간에 어떤 버킷을 바꾸는가"에 집중해서 읽는 게 좋다.
- 총합 불일치가 의심되면 `integrity.py` 와 함께 확인한다.

## 관련 문서

- [[backend/app/services/stock_math.py.md]]
- [[backend/app/services/integrity.py.md]]
- [[_vault/guides/시나리오_재고입출고]]

Up: [[backend/app/services/services]]

