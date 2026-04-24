---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/HistoryTab.tsx
status: active
tags:
  - erp
  - frontend
  - component
  - mobile
  - history
aliases:
  - 이력 탭 (모바일)
---

# HistoryTab.tsx

> [!summary] 역할
> 모바일 화면에서 **자재 입출고 이력**을 조회하는 탭 컴포넌트.
> 거래 유형 및 날짜 범위로 필터링하여 트랜잭션 로그를 표시한다.

> [!info] 필터 옵션
> - **유형 필터**: 전체 / 입고 / 출고 / 조정 / 생산입고 / 자동차감(BACKFLUSH)
> - **날짜 필터**: 전체 / 오늘 / 이번주 / 이번달

> [!info] 이력 항목 표시 내용
> - 거래 유형 + 색상 배지 (입고=초록, 출고=빨강, 조정=노랑 등)
> - 품목명, 수량, 담당자, 날짜
> - 품번 복사 버튼

---

## 쉬운 말로 설명

**모바일 이력 조회 탭**. 최신순으로 재고 거래 기록을 스크롤로 쭉 볼 수 있음. 필터 칩으로 유형/기간 좁힘.

예 표시:
```
[입고 녹색배지]  2026-04-22 14:32
3-AR-0001 메인보드 +10  (홍길동)

[출고 빨강배지]  2026-04-22 14:28
5-FG-0012 완성품  -1   (김철수)

[자동차감 회색]  2026-04-22 14:28
3-AR-0001 메인보드 -1   (BOM)
```

## 날짜 필터 로직

- **오늘**: `YYYY-MM-DD` 00:00:00 ~ 현재 (로컬 타임존)
- **이번주**: 월요일 00:00:00 ~ 현재
- **이번달**: 1일 00:00:00 ~ 현재
- **전체**: 필터 없음 (최대 200건)

백엔드에는 `from`/`to` 쿼리로 ISO UTC 시간 전송. 표시 시 `parseUtc()` 로 로컬 변환.

## FAQ

**Q. 자동차감(BACKFLUSH) 이 뭐야?**
생산 확정 시 BOM 자재를 자동으로 차감한 내역. 사람이 직접 출고한 게 아니라 "PRODUCE 배치 확정"으로 시스템이 생성.

**Q. 데스크톱 이력 뷰와 차이?**
- 데스크톱: 좌측 필터 사이드바 + 중앙 테이블 + 우측 상세
- 모바일: 상단 필터 칩 + 세로 리스트만, 탭하면 간단 상세 확장

**Q. 이력 삭제?**
UI 에선 불가. DB 직접 조작만. 감사 로그 특성상 보존 원칙.

**Q. CSV/엑셀 내보내기?**
모바일은 없음. 데스크톱 `DesktopHistoryView` 에서 가능.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopHistoryView.tsx.md]] — 데스크탑 이력 뷰
- [[frontend/app/legacy/_components/FilterPills.tsx.md]] — 필터 칩 컴포넌트
- [[backend/app/routers/inventory.py.md]] — 이력 조회 API
- [[backend/app/models.py.md]] — `InventoryHistory` 테이블

Up: [[frontend/app/legacy/_components/_components]]
