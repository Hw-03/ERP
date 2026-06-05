---
type: folder-note
source_path: "backend/app/schemas"
importance: critical
layer: backend
graph: hub
updated: 2026-06-05
project: DEXCOWIN MES
---

# 📁 schemas

## 이 폴더는 무엇을 위한 곳인가

백엔드와 프론트엔드가 주고받는 데이터의 "모양(형식)" 을 정의하는 곳입니다. 화면이 어떤 값을 보내야 하고, 서버가 어떤 값을 돌려주는지를 적어 둔 약속서입니다. 입고/이동/불량/요청/인수인계 같은 모든 화면이 이 형식대로 데이터를 주고받습니다.

예전에는 `backend/app/schemas.py` 라는 파일 하나에 모든 약속이 뭉쳐 있었습니다. 너무 커져서 도메인(업무 영역)별로 파일을 쪼갠 것이 지금의 `schemas/` 패키지입니다. `models/` 패키지를 쪼갰던 것과 똑같은 방식이고, 코드가 동작하는 방식은 그대로입니다.

## 현장 업무와의 관계

이 폴더는 API 의 "계약서" 입니다. 여기서 정한 필드명·필수 여부·타입이 화면이 보낼 수 있는 값과 서버가 돌려주는 값의 한계선을 정합니다. 약속에 없는 필드는 화면에서 보내도 무시되거나 거부(422 오류)됩니다.

## 언제 보면 좋나

- 화면에 보이는 어떤 값이 서버 응답의 어느 필드에서 왔는지 확인할 때
- 화면이 보내는 요청에 어떤 항목이 필수인지(빠지면 422) 따질 때
- API 를 고치기 전에 "이 변경이 화면·테스트·OpenAPI 문서에 어떻게 번지는지" 영향 범위를 잡을 때

## 도메인 파일 구성

업무 영역별로 파일이 나뉘어 있습니다.

- [[ERP/backend/app/schemas/common.py]] — 공용 요소(UtcDatetime 날짜 형식, 관리자 PIN, 재고 정합성, 점유 라인)
- [[ERP/backend/app/schemas/item.py]] — 품목 · BOM(부품 구성) · 제품기호 · 생산입고
- [[ERP/backend/app/schemas/inventory.py]] — 재고 · 창고↔부서 이동 · 불량 등록 · 공급사 반품 · 재고대조
- [[ERP/backend/app/schemas/transaction.py]] — 거래 로그 응답 · 메타/수량 수정
- [[ERP/backend/app/schemas/stock_request.py]] — 입출고 결재 요청(작성·제출·승인/반려)
- [[ERP/backend/app/schemas/io.py]] — 입출고 2.0 미리보기 · 임시저장(draft) · 제출 · 배치
- [[ERP/backend/app/schemas/employee.py]] — 직원 · PIN
- [[ERP/backend/app/schemas/department.py]] — 부서 · 제품 모델
- [[ERP/backend/app/schemas/warehouse.py]] — 창고 지도(앵글·박스·내용물)
- [[ERP/backend/app/schemas/notification.py]] — 알림 · 인수인계서
- [[ERP/backend/app/schemas/weekly.py]] — 주간보고 · 공정타입 · MES코드 · BOM체크 · 생산능력
- [[ERP/backend/app/schemas/__init__.py]] — 위 파일들을 한곳으로 모아 재공개(re-export)

## __init__.py 가 하는 일 (중요)

파일을 여러 개로 쪼개도, 다른 코드는 예전처럼 `from app.schemas import ItemResponse` 한 줄로 모든 약속을 그대로 불러올 수 있습니다. `__init__.py` 가 각 파일의 클래스를 한곳으로 다시 내보내(re-export) 주기 때문입니다. 덕분에 "파일만 나누고 호출하는 쪽 코드는 안 바꾼다" 가 가능합니다.

## 먼저 볼 파일

- [[ERP/backend/app/schemas/inventory.py]] — 재고 화면이 쓰는 응답·요청 형식. 수량 칸(창고/생산/불량/예약)이 그대로 드러납니다.
- [[ERP/backend/app/schemas/stock_request.py]] — 결재가 필요한 입출고 흐름의 요청·상태.
- [[ERP/backend/app/schemas/item.py]] — 품목·BOM 형식. 모든 응답이 품목을 가리키므로 출발점.
- [[ERP/backend/app/schemas/common.py]] — 날짜를 항상 UTC 로 내보내는 공통 규칙(UtcDatetime).

## 위험도

🔴 **critical** — 이 폴더는 API 요청/응답 "계약서" 입니다. 필드명이나 필수 여부를 바꾸면 화면, 테스트, OpenAPI 문서가 한꺼번에 영향을 받습니다. 백엔드 스키마를 바꾸면 OpenAPI baseline(`_dev/baselines/openapi.json`) 재생성이 필요하고, 그러지 않으면 CI drift 게이트에 걸립니다. 특히 inventory·stock_request 는 운영 재고·결재 상태와 직결되니 한 필드만 보고 고치면 위험합니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/backend/app/📁_app]]
- 짝이 되는 표 구조: [[ERP/backend/app/models/📁_models]]
