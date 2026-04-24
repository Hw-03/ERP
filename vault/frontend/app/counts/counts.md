---
type: index
project: ERP
layer: frontend
source_path: frontend/app/counts/
status: active
tags:
  - erp
  - frontend
  - route
  - counts
aliases:
  - 실물 조사 페이지
---

# frontend/app/counts

> [!summary] 역할
> `/counts` 경로 라우트. 실물 재고 조사(Physical Count) 결과 등록·조회 화면.

## 관련 문서

- [[backend/app/routers/counts.py.md]]

---

## 쉬운 말로 설명

`/counts` URL. **실사(physical count)** 결과를 입력·조회하는 페이지. 실사란 실제 창고/부서에 가서 물건을 세어본 결과.

### 흐름
1. 창고/부서에서 실제 수량 파악
2. 시스템에 입력 (품목, 위치, 실제수량)
3. 시스템과 차이 있으면 `variance` 기록 + 필요 시 알림 생성
4. 관리자 검토 후 `adjust` 로 시스템 수량 보정

---

## FAQ

**Q. 실사 하면 자동으로 재고가 보정되나?**
아니다. 차이만 기록하고, 보정은 별도 `adjust` API 호출이 필요. 감사 추적 목적.

**Q. 실사 주기는?**
시스템상 강제 없음. 운영팀 정책에 따라 주/월 단위.

---

## 관련 문서

- [[backend/app/routers/inventory.py.md]] — adjust 엔드포인트
- [[backend/app/routers/alerts.py.md]] — COUNT_VARIANCE 경고
- 용어 사전

Up: [[frontend/app/app]]
