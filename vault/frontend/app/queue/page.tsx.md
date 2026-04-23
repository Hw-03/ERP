---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/queue/page.tsx
status: active
tags:
  - erp
  - frontend
  - route
  - queue
aliases:
  - 큐 페이지 라우트
---

# app/queue/page.tsx

> [!summary] 역할
> `/queue` 경로 접속 시 루트(`/`)로 리다이렉트하는 래퍼 파일.
> 생산 큐 배치 기능은 레거시 UI 내부에서 처리한다.

---

## 쉬운 말로 설명

**`/queue` → `/` 리디렉션**. "큐(Queue)" 는 생산 지시 대기열 개념. PRODUCE/DISASSEMBLE/RETURN 3가지 배치 유형이 OPEN 상태로 대기 → 관리자가 confirm → 재고 실제 반영.

## 큐 생명주기

```
OPEN (생성 직후)
  │
  ├── confirm() → CONFIRMED
  │    │
  │    ├── BOM 자동 차감
  │    ├── VarianceLog 자동 기록
  │    └── 해당 품목 pending_quantity 해제
  │
  └── cancel() → CANCELLED
       └── pending 만 해제, 재고 무변동
```

## FAQ

**Q. 큐 전용 UI 는?**
현재 독립 페이지 없음. 관리자 탭 내부에 추가 예정.

**Q. 큐 여러 개 동시 실행?**
DB 레벨에서는 동시 가능하나 UI 상 순차 처리. 멀티유저 동시성은 검증 부족.

**Q. 확정 후 취소?**
역방향 큐(RETURN 등) 생성해서 수동 반영. 확정된 큐 자체는 되돌릴 수 없음.

---

## 관련 문서

- [[backend/app/routers/queue.py.md]] — 큐 배치 API
- [[backend/app/services/queue.py.md]] — `confirm_batch()` 로직
- [[frontend/app/queue/queue]] — 라우트 폴더 인덱스
- 생산 배치 시나리오 — PRODUCE 흐름
- 분해 반품 시나리오 — DISASSEMBLE/RETURN 흐름

Up: [[frontend/app/app]]
