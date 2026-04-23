---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DesktopHistoryView.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - legacy
  - history
aliases:
  - 거래 이력 화면
---

# DesktopHistoryView.tsx

> [!summary] 역할
> 모든 재고 거래 이력을 조회하는 화면. 입고·출고·조정 등 모든 트랜잭션 로그를 표시한다.

> [!info] 주요 책임
> - 거래 이력 목록 표시 (날짜, 품목, 거래 유형, 수량 변화)
> - 검색 및 거래 유형 필터
> - 엑셀 내보내기 버튼

---

## 쉬운 말로 설명

**거래 이력 탭**. 모든 재고 변동(RECEIVE/SHIP/PRODUCE/BACKFLUSH/ADJUST/SCRAP/LOSS/...)을 시간순 나열.

필터: 거래 유형(드롭다운) + 기간(오늘/이번주/이번달) + 검색어. 페이지당 100개(`PAGE_SIZE`).

행 색상 틴트로 증가/감소 구분:
- 녹색 틴트: RECEIVE, PRODUCE, RETURN (재고 증가)
- 붉은 틴트: SHIP, BACKFLUSH, SCRAP, LOSS (감소)
- 파란 틴트: ADJUST (보정)

---

## 기간 필터 (`getPeriodStart`)

```
TODAY  → 오늘 00:00 부터
WEEK   → 이번 주 일요일 00:00 부터
MONTH  → 이번 달 1일 00:00 부터
ALL    → 필터 없음
```

---

## 유형 필터 옵션

| label | value |
|-------|-------|
| 전체 | ALL |
| 입고 | RECEIVE |
| 출고 | SHIP |
| 조정 | ADJUST |
| 생산입고 | PRODUCE |
| 자동차감 | BACKFLUSH |

나머지 트랜잭션 유형(TRANSFER_*, SCRAP, LOSS, MARK_DEFECTIVE 등)도 표시되지만 필터 메뉴엔 없음(검색으로).

---

## UTC 파싱 주의

```typescript
function parseUtc(iso: string) {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
}
```
백엔드가 시간대 없이 넘길 수 있어 UTC 접미사를 강제. 로컬 시간대(KST+9)로 렌더링.

---

## FAQ

**Q. 거래 메모 수정은?**
행 클릭 → 메모 입력 → `api.updateTransactionNotes(logId, text)`.

**Q. 이력 삭제는?**
불가. 모든 변동은 추적 대상 → 수정만 가능.

**Q. 엑셀 내보내기 어디?**
상단 "내보내기" 버튼 → `/api/inventory/transactions/export.xlsx` 다운로드.

---

## 관련 문서

- [[backend/app/routers/inventory.py.md]] — `/transactions`
- [[backend/app/utils/excel.py.md]]
- [[frontend/lib/api.ts.md]]

Up: [[frontend/app/legacy/_components/_components]]
