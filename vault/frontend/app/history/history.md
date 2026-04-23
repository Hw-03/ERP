---
type: index
project: ERP
layer: frontend
source_path: frontend/app/history/
status: active
tags:
  - erp
  - frontend
  - route
  - history
aliases:
  - 거래 이력 페이지
---

# frontend/app/history

> [!summary] 역할
> `/history` 경로 라우트. 모든 재고 거래 이력 조회 화면.

## 관련 문서

- [[backend/app/routers/inventory.py.md]]
- [[frontend/app/legacy/_components/DesktopHistoryView.tsx.md]]

---

## 쉬운 말로 설명

`/history` URL. **모든 재고 이동 이력**을 조회. DB의 `transaction_logs` 테이블을 필터링해서 보여준다.

### 볼 수 있는 이력 종류 (거래 타입 14가지)
RECEIVE(입고), SHIP(출하), PRODUCE(생산), BACKFLUSH(BOM 자재 차감), SCRAP(폐기), LOSS(손실), TRANSFER_TO_PROD/TO_WH/DEPT(이관), ADJUST(조정), MARK_DEFECTIVE(불량 등록), SUPPLIER_RETURN(공급자 반품), RESERVE(예약), RESERVE_RELEASE(예약 해제), DISASSEMBLE(분해), RETURN(반품)

### 필터
- 품목별
- 거래 타입별
- 부서별
- 날짜 범위
- 배치 ID

---

## FAQ

**Q. 이력 삭제 가능한가?**
불가. 비고만 수정 가능(`PUT /api/inventory/transactions/{logId}`). 감사 목적상 변경 금지.

**Q. 엑셀 내보내기 되나?**
해당 엔드포인트에서 내보내기 지원 여부는 `backend/app/routers/inventory.py` 확인.

---

## 관련 문서

- [[backend/app/models.py.md]] — transaction_logs 테이블
- 재고 입출고 시나리오
- 용어 사전

Up: [[frontend/app/app]]
