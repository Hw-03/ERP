---
type: code-note
project: ERP
layer: frontend
source_path: frontend/components/UKAlert.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - alerts
aliases:
  - UK 알림
  - 미분류 품목 알림
---

# UKAlert.tsx

> [!summary] 역할
> 카테고리가 UK(Unknown/미분류)인 품목이 있을 때 사용자에게 알림을 표시하는 컴포넌트.

> [!info] 주요 책임
> - UK 카테고리 품목 수 표시
> - 관리자 탭으로 이동 유도

---

## 쉬운 말로 설명

**"분류 안 된 품목이 있어요" 경고 배너**. 신규로 등록됐지만 카테고리(RM/TA/FG 등)가 확정 안 된 품목이 N개 있다 — 관리자 탭에서 분류해 달라는 안내.

예:
```
⚠ 미분류 품목이 3개 있습니다. 관리자 탭에서 분류해 주세요. →
```

클릭하면 관리자 탭(AdminTab) 으로 이동.

## UK 품목 생기는 경우

- 신규 품목 등록 시 카테고리 미선택
- 엑셀 일괄 업로드 시 카테고리 컬럼 비어있음
- 과거 데이터 마이그레이션 중 매핑 실패

UK 카테고리는 `generate_code()` 에서 `UK` 기호 자체를 붙이진 않고, `raw_material_part` 같은 fallback 공정코드가 들어감.

## FAQ

**Q. UK 를 분류 안 하면 문제가 되나?**
재고 카운트/입출고는 정상 동작. 그러나 리포트/카테고리 필터에서 누락됨. 오래 방치 X.

**Q. UK 품목 일괄 분류?**
현재는 한 건씩만. 일괄 업데이트 API/UI 필요하면 별도 개발.

---

## 관련 문서

- [[frontend/components/components]] — 공용 컴포넌트 목록
- [[frontend/components/CategoryCard.tsx.md]] — 카테고리 카드
- [[frontend/app/legacy/_components/AdminTab.tsx.md]] — 관리자 탭 (이동 대상)

Up: [[frontend/components/components]]
