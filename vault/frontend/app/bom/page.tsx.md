---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/bom/page.tsx
status: active
tags:
  - erp
  - frontend
  - route
  - bom
aliases:
  - BOM 페이지 라우트
---

# app/bom/page.tsx

> [!summary] 역할
> `/bom` 경로 접속 시 루트(`/`)로 리다이렉트하는 래퍼 파일.
> BOM 관리는 레거시 UI의 Admin 탭 내 BOM 섹션에서 처리한다.

---

## 쉬운 말로 설명

**`/bom` → `/` 리디렉션**. BOM(제품 하나를 만들 때 필요한 자재 목록) 관리는 관리자 탭 안의 BOM 섹션에서 처리. 독립 페이지 없음.

BOM 실제 사용 흐름:
1. 관리자 탭 진입 → BOM 섹션
2. 상위 품목 선택 (예: `5-FG-0001` DX3000 완성품)
3. 하위 자재 목록 확인/추가 (예: 메인보드 1, 섀시 1, 나사 12)
4. 생산 배치 확정 시 자동 차감에 사용됨

## FAQ

**Q. BOM 트리를 시각적으로?**
현재는 flat 테이블만. 재귀 표시(들여쓰기 트리) 는 `DesktopAdminView` BOM 섹션에서 일부 지원.

**Q. BOM 의 순환 참조?**
백엔드 `explode_bom()` 이 visited set + MAX_DEPTH=10 으로 방지. A→B→A 같은 순환은 저장 시 사전 검증은 없으나 조회 시 중단됨.

---

## 관련 문서

- [[frontend/app/bom/bom]] — 라우트 폴더 인덱스
- [[frontend/app/legacy/_components/DesktopAdminView.tsx.md]] — BOM 섹션 포함
- [[backend/app/services/bom.py.md]] — `explode_bom()` 로직
- 용어 사전 — BOM / 백플러시 용어

Up: [[frontend/app/app]]
