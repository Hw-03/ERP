---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/history/page.tsx
status: active
tags:
  - erp
  - frontend
  - route
  - history
aliases:
  - 이력 페이지 라우트
---

# app/history/page.tsx

> [!summary] 역할
> `/history` 경로 접속 시 루트(`/`)로 리다이렉트하는 래퍼 파일.
> 거래 이력은 레거시 UI의 `DesktopHistoryView` 탭에서 확인한다.

---

## 쉬운 말로 설명

**`/history` → `/` 리디렉션**. 거래 이력(입/출고, 조정, 이동, 불량등록 등) 은 레거시 "이력" 탭 안에서 조회.

## 이력에 기록되는 것들

- `RECEIVE` — 외부 입고 (공급사로부터)
- `SHIP` — 외부 출고 (고객/출하)
- `ADJUST` — 수동 조정 (±)
- `TRANSFER` — 창고↔부서 이동
- `BACKFLUSH` — 생산 확정 시 자동 차감
- `SCRAP` — 폐기
- `LOSS` — 분실
- `VARIANCE` — 실사 차이
- `DEFECTIVE_REGISTER` — 불량 등록
- `SUPPLIER_RETURN` — 공급사 반품

## FAQ

**Q. 이력 영구 보관?**
DB 삭제 정책 없음. 계속 누적. 향후 로그 아카이브 고려 시 주의.

**Q. 내가 한 작업만 필터?**
"담당자" 필터는 있지만 자동 "내 것만" 필터링은 없음. 수동 선택.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopHistoryView.tsx.md]] — 실제 이력 뷰
- [[frontend/app/legacy/_components/HistoryTab.tsx.md]] — 모바일 버전
- [[frontend/app/history/history]] — 라우트 폴더 인덱스
- [[backend/app/models.py.md]] — `InventoryHistory` 테이블

Up: [[frontend/app/app]]
