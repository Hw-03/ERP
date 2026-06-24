---
type: folder-note
source_path: "backend/app/routers"
importance: important
layer: backend
graph: hub
updated: 2026-06-24
project: DEXCOWIN MES
---

# 📁 routers

## 이 폴더는 무엇을 위한 곳인가

프론트엔드가 호출하는 API 문입니다. URL별로 요청을 받아 서비스 로직으로 넘깁니다.

## 현장 업무와의 관계

사용자가 화면에서 누르는 조회, 저장, 승인, 취소 버튼이 이곳의 엔드포인트로 들어옵니다.

## 언제 보면 좋나

- 브라우저에서 특정 API가 실패할 때
- 화면 버튼이 백엔드 어디로 연결되는지 찾을 때
- 요청/응답 형식을 확인할 때

## 주요 하위 폴더

- [[ERP/backend/app/routers/inventory/📁_inventory]] — 재고 조회, 입고, 이동, 불량 격리, 반품, 거래 내역처럼 재고 자체를 다루는 API 묶음입니다.

## 먼저 볼 파일 5개

- [[ERP/backend/app/routers/settings.py]] — `settings.py`는 `settings` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/routers/stock_requests.py]] — 프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.
- [[ERP/backend/app/routers/__init__.py]] — `__init__.py`는 `__init__` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/routers/_errors.py]] — `_errors.py`는 `_errors` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/routers/admin_audit.py]] — `admin_audit.py`는 `admin_audit` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

> [!info]- 추가 파일 (전체 15개 도메인 라우터)
> - [[ERP/backend/app/routers/admin_audit_csv.py]] — admin_audit_csv.py
> - [[ERP/backend/app/routers/bom.py]] — bom.py
> - [[ERP/backend/app/routers/codes.py]] — codes.py
> - [[ERP/backend/app/routers/defects.py]] — defects.py
> - [[ERP/backend/app/routers/departments.py]] — departments.py
> - [[ERP/backend/app/routers/dept_adjustment.py]] — dept_adjustment.py
> - [[ERP/backend/app/routers/employees.py]] — employees.py
> - [[ERP/backend/app/routers/handover.py]] — 인수인계서 (작성·제출·인수확인). 받는 부서(고압/진공)만 인수 가능
> - [[ERP/backend/app/routers/io.py]] — io.py
> - [[ERP/backend/app/routers/items.py]] — items.py
> - [[ERP/backend/app/routers/models.py]] — models.py (ProductSymbol 라우터 — DB 모델 아님)
> - [[ERP/backend/app/routers/production.py]] — production.py
> - [[ERP/backend/app/routers/variance.py]] — variance.py
> - [[ERP/backend/app/routers/warehouse_map/]] — 창고 지도·앵글·박스 API

## 조심할 점

라우터의 URL, 응답 모양, 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 깨질 수 있습니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/backend/app/📁_app]]
