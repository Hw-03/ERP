---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/queue.py
status: active
tags:
  - erp
  - backend
  - router
aliases:
  - 큐 라우터
  - queue.py
---

# queue.py

> [!summary] 역할
> 생산/분해/반품 배치를 OPEN -> CONFIRMED/CANCELLED 흐름으로 관리하는 라우터.
> BOM 자동 적재, 라인 조정, 배치 확정/취소를 다루는 검토형 작업 입구다.

## 쉬운 말로 설명

이 파일은 "바로 반영하지 말고, 한 번 검토한 뒤 확정하자" 쪽 작업을 맡는다.  
사용자가 배치를 만들고, 라인을 조정하고, 마지막에 확정하면 그때 실제 재고가 반영된다.

## 핵심 책임

- 배치 생성/목록/상세 조회
- OPEN 배치의 라인 수량 수정, 포함/제외, 수동 라인 추가/삭제
- 배치 확정과 취소
- 배치 응답 DTO 조립 시 부모 품목/라인 품목 사전 로딩

## 주의점

- queue 흐름은 mobile wizard, desktop warehouse/admin, backend queue service가 동시에 엮인다.
- pending 예약과 실제 차감은 시점이 다르므로 `inventory.py`, `stock_math.py` 와 함께 읽어야 한다.

## 관련 문서

- [[backend/app/services/queue.py.md]]
- [[backend/app/services/inventory.py.md]]
- [[frontend/lib/api.ts.md]]

Up: [[backend/app/routers/routers]]

