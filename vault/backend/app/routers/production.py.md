---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/production.py
status: active
tags:
  - erp
  - backend
  - router
aliases:
  - 생산 라우터
  - production.py
---

# production.py

> [!summary] 역할
> 생산 입고와 BOM 기반 백플러시를 처리하는 라우터.
> 재고 차감 가능 여부를 먼저 계산하고, 통과하면 자재 차감과 완제품 적재를 한 번에 처리한다.

## 쉬운 말로 설명

완제품 하나를 만들 때 "어떤 자재가 얼마나 빠져야 하는지" 확인하고 실제 반영하는 입구다.  
빠른 생산 처리 쪽 API라서, 큐 배치보다 즉시성은 높고 검토 단계는 적다.

## 핵심 책임

- 생산 입고 요청 수신
- BOM 전개 결과를 합쳐 필요 자재 수량 계산
- `warehouse_available` 기준으로 사전 부족 수량 점검
- 자재 BACKFLUSH와 완제품 PRODUCE 로그 기록

## 주의점

- 사전 점검과 실제 차감 기준이 `stock_math` 와 같아야 화면/서버가 어긋나지 않는다.
- 더 세밀한 검토형 흐름은 `queue.py` 쪽 배치 로직과 같이 비교해서 봐야 한다.

## 관련 문서

- [[backend/app/routers/queue.py.md]]
- [[backend/app/services/stock_math.py.md]]
- [[_vault/guides/시나리오_생산배치]]

Up: [[backend/app/routers/routers]]

