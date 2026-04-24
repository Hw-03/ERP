---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/counts/page.tsx
status: active
tags:
  - erp
  - frontend
  - route
  - counts
aliases:
  - 실사 페이지 라우트
---

# app/counts/page.tsx

> [!summary] 역할
> `/counts` 경로 접속 시 루트(`/`)로 리다이렉트하는 래퍼 파일.
> 재고 실사 기능은 레거시 UI 내부에서 처리한다.

---

## 쉬운 말로 설명

**`/counts` → `/` 리디렉션**. 재고 실사(Count) 는 독립 UI 없이 레거시 내부 기능으로 포함 — 작업자가 각 부서/창고 버킷별 실제 수량을 입력하면 시스템 수량과 비교해서 `VarianceLog` 생성.

실사 흐름(실제 운영):
1. 관리자가 "실사 시작" 지시
2. 담당자가 각 품목 실제 재고 카운트 → API 로 입력
3. 시스템 수량과 차이 발생 시 `VarianceLog` 자동 기록
4. 관리자 검토 후 조정(ADJUST) 실행

## FAQ

**Q. 실사 전용 UI 가 없음?**
현재 프로토타입 단계라 관리자 탭 내 간단 폼만. 추후 전용 실사 모드 페이지 개발 예정.

**Q. 실사 중 재고 변동 처리?**
"실사 시작/종료" 시점 스냅샷 개념은 없음. 실시간 카운트 기반. 실사 중 입출고 발생하면 차이가 사후에 누적.

---

## 관련 문서

- [[frontend/app/counts/counts]] — 라우트 폴더 인덱스
- [[backend/app/routers/counts.py.md]] — 실사 API
- [[backend/app/models.py.md]] — `CountSession`, `VarianceLog` 테이블

Up: [[frontend/app/app]]
