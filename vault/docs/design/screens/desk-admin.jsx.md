---
type: code-note
project: ERP
layer: docs
source_path: docs/design/screens/desk-admin.jsx
status: active
tags:
  - erp
  - docs
  - design
  - react
  - prototype
  - admin
aliases:
  - 관리자 화면 시안
---

# screens/desk-admin.jsx

> [!summary] 역할
> ERP 리디자인의 **관리자 화면** React 시안.
> 핀락, 품목 관리, 직원 관리, BOM, 패키지, 설정 탭을 포함한다.

> [!info] 관련 스크린샷
> - `desk_09_admin_pinlock` ~ `desk_16_admin_settings`

---

## 쉬운 말로 설명

**"관리자 화면 시안"**. 들어올 때 PIN 4자리 잠금을 통과해야 하며, 통과 후 5개 섹션 (품목 / 직원 / BOM / 패키지 / 설정) 에 접근 가능. 실제 구현은 `DesktopAdminView.tsx`.

## 섹션별 요약

- **품목**: 신규 품목 등록 / ERP 코드 발급 / 카테고리 조정
- **직원**: 26명 직원 CRUD + 부서 배정
- **BOM**: 완제품 → 자재 구성표 편집 (`explode_bom` 기반)
- **패키지**: 자주 쓰는 품목 묶음 (PKG-001 ~ 020)
- **설정**: 테마, 경고 임계치, 기타 시스템 옵션

## FAQ

**Q. PIN 은 어디에 저장?**
현재는 프론트엔드 측 간단 체크 위주. 실제 권한 관리는 미구현, 프로토타입 수준.

**Q. BOM 편집이 실시간 반영되는가?**
저장 즉시 `bom_edges` 테이블 갱신. 생산 배치 확정 시 이 값을 참조해 백플러시.

---

## 관련 문서

- [[frontend/app/legacy/_components/DesktopAdminView.tsx.md]] — 실제 구현

Up: [[docs/design/design]]
