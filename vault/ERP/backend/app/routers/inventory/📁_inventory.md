---
type: folder-note
source_path: "backend/app/routers/inventory"
importance: important
layer: backend
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 inventory

## 이 폴더는 무엇을 위한 곳인가

재고 조회, 입고, 이동, 불량 격리, 반품, 거래 내역처럼 재고 자체를 다루는 API 묶음입니다.

## 현장 업무와의 관계

회사의 가장 중요한 수량 정보가 들어오고 나가는 입구입니다. 창고 수량, 부서 수량, 불량 수량이 여기서 움직입니다.

## 언제 보면 좋나

- 수량이 맞지 않을 때
- 입고/출고/이동 API를 찾을 때
- 불량 처리나 공급처 반품 흐름을 확인할 때

## 먼저 볼 파일 5개

- [[ERP/backend/app/routers/inventory/defective.py]] — `defective.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.
- [[ERP/backend/app/routers/inventory/receive.py]] — `receive.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.
- [[ERP/backend/app/routers/inventory/supplier.py]] — `supplier.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.
- [[ERP/backend/app/routers/inventory/transactions.py]] — `transactions.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.
- [[ERP/backend/app/routers/inventory/transfer.py]] — `transfer.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

> [!info]- 추가 파일
> - [[ERP/backend/app/routers/inventory/__init__.py]] — __init__.py
> - [[ERP/backend/app/routers/inventory/_shared.py]] — _shared.py
> - [[ERP/backend/app/routers/inventory/query.py]] — query.py
> - [[ERP/backend/app/routers/inventory/weekly_report.py]] — 주간보고 API (**동결 영역** 2026-05-29. 명시 요청 없으면 수정 금지)

## 조심할 점

재고 API는 실수하면 숫자가 틀어집니다. 서비스와 stock_math, 거래 로그까지 같이 확인해야 합니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/backend/app/routers/📁_routers]]
