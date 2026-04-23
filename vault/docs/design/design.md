---
type: index
project: ERP
layer: docs
status: active
tags:
  - erp
  - docs
  - design
aliases:
  - 디자인 파일
---

# docs/design

> [!summary] 역할
> ERP UI 재설계(Redesign) 관련 디자인 파일과 스크린샷이 있는 폴더.

## 하위 파일

- `ERP Redesign.html` — 리디자인 프로토타입 HTML
- `ERP_Redesign.pptx` — 리디자인 발표 자료
- [[docs/design/data.jsx.md]] — 시안용 가상 데이터
- [[docs/design/ui.jsx.md]] — UI 컴포넌트 시안
- [[docs/design/design-canvas.jsx.md]] — 전체 디자인 캔버스
- `screens/` — 화면별 JSX 시안:
  - [[docs/design/screens/desk-dashboard.jsx.md]] — 대시보드
  - [[docs/design/screens/desk-warehouse.jsx.md]] — 창고
  - [[docs/design/screens/desk-history.jsx.md]] — 이력
  - [[docs/design/screens/desk-admin.jsx.md]] — 관리자
  - [[docs/design/screens/mobile.jsx.md]] — 모바일
- `screenshots/` — 라이트/다크 모드 비교 스크린샷
- `uploads/` — 상세 UI 스크린샷 16장 (desk_01 ~ desk_16)

## 스크린샷 목록 (uploads/)

| 파일 | 내용 |
|------|------|
| desk_01_dashboard | 대시보드 기본 화면 |
| desk_02_dashboard_kpi_shortage | KPI + 부족 현황 |
| desk_03_dashboard_model_filter | 모델 필터 |
| desk_04_dashboard_detail_panel | 상세 패널 |
| desk_05_warehouse_io | 창고 입출고 |
| desk_06_warehouse_search | 창고 검색 |
| desk_07_history | 이력 화면 |
| desk_08_history_filtered | 필터된 이력 |
| desk_09_admin_pinlock | 관리자 핀락 |
| desk_10_admin_pin_typing | 핀 입력 중 |
| desk_11_admin_items | 관리자 품목 탭 |
| desk_12_admin_item_selected | 품목 선택 상태 |
| desk_13_admin_employees | 직원 관리 |
| desk_14_admin_bom | BOM 관리 |
| desk_15_admin_packages | 패키지 관리 |
| desk_16_admin_settings | 시스템 설정 |

---

## 쉬운 말로 설명

이 폴더는 **"ERP 화면을 새로 꾸미려고 그려본 그림 모음"** 이다. 실제 프로덕션 코드는 `frontend/app/legacy/` 아래에 있고, 여기 있는 `.jsx` 시안과 스크린샷은 "이렇게 바꿔 보면 어떨까?" 를 확인하기 위한 **참고용 리소스**다.

- `.jsx` 파일 = 디자이너가 React 로 그린 화면 스케치 (실행은 가능하지만 운영은 X)
- `screenshots/` = 라이트/다크 모드 비교 캡처
- `uploads/` = 실제 화면 구성요소별 상세 캡처 (데스크탑 16장, 모바일 12장)
- `ERP Redesign.html` / `.pptx` = 발표·리뷰용 자료

## 이 폴더가 만들어진 이유

1. 리디자인 검토 초기에 화면마다 **어떤 컴포넌트가 어디 놓일지**를 빠르게 스케치.
2. 스크린샷으로 **전/후 비교** 가능.
3. 확정된 디자인은 실제 코드 (`frontend/app/legacy/`) 로 옮겨져 프로덕션에 반영됨.

## FAQ

**Q. 이 `.jsx` 파일들은 실제로 돌아가는가?**
일부는 단독 실행 가능하지만, 운영 코드가 아니다. 의존성(`data.jsx`)만 연결하면 스토리북처럼 본다.

**Q. 디자인 수정이 생기면 이 파일도 같이 고쳐야 하는가?**
필수는 아니다. 실제 반영은 `frontend/` 코드에서 한다. 단, 시안 문서로 남겨둘 때는 같이 업데이트.

**Q. 스크린샷은 언제 찍은 건가?**
리디자인 기획 시점 캡처. 현재 UI 와 다를 수 있으므로 최신 확인은 실제 앱 실행이 우선.

## 관련 문서

- [[docs/design/data.jsx.md]] — 시안용 가상 데이터
- [[docs/design/ui.jsx.md]] — UI 컴포넌트 시안
- [[docs/design/design-canvas.jsx.md]] — 전체 디자인 캔버스
- [[frontend/app/legacy/legacy]] — 실제 구현된 레거시 컴포넌트

Up: [[docs/docs]]
