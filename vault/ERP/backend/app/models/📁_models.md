---
type: folder-note
source_path: "backend/app/models"
importance: critical
layer: backend
graph: hub
updated: 2026-06-05
project: DEXCOWIN MES
---

# 📁 models

## 이 폴더는 무엇을 위한 곳인가

DEXCOWIN MES 가 DB 에 저장하는 모든 데이터의 "표 구조(테이블)" 를 정의하는 곳입니다. 품목, 재고, 직원, 입출고 결재, 거래 로그, 창고 지도, 인수인계서, 알림 같은 회사 데이터의 뼈대가 전부 여기서 결정됩니다.

예전에는 `backend/app/models.py` 라는 파일 하나(700줄 넘는 큰 파일)에 모든 표가 뭉쳐 있었습니다. 너무 커져서 도메인(업무 영역)별로 파일을 쪼갠 것이 지금의 `models/` 패키지입니다. 코드가 동작하는 방식은 그대로이고, 파일만 보기 좋게 나눈 것입니다.

## 현장 업무와의 관계

현장에서 입고를 찍든, 부서로 자재를 옮기든, 불량을 격리하든, 그 결과는 결국 이 폴더가 정의한 표의 한 행(row)으로 저장됩니다. 즉 "어떤 정보를 남길 수 있는가"의 한계선이 이 폴더입니다. 표에 없는 칸은 화면에서도 저장할 수 없습니다.

## 언제 보면 좋나

- 어떤 데이터가 DB 어디에, 어떤 칸으로 저장되는지 확인할 때
- 화면/API 를 고치기 전에 영향 받는 표 구조를 먼저 파악할 때
- 재고 수량이 안 맞을 때 "수량 칸이 어떻게 나뉘어 있는지"(창고/생산/큐예약) 따져볼 때
- 새 기능을 위해 표를 추가하거나 칸을 늘려야 할지 판단할 때

## 도메인 파일 구성

업무 영역별로 파일이 나뉘어 있습니다.

- [[ERP/backend/app/models/item.py]] — 품목(Item) · 부품 구성(BOM)
- [[ERP/backend/app/models/inventory.py]] — 재고(Inventory) · 부서×상태별 위치 재고(InventoryLocation)
- [[ERP/backend/app/models/stock_request.py]] — 입출고 결재 요청(StockRequest) · 요청 라인
- [[ERP/backend/app/models/transaction.py]] — 재고 거래 로그(TransactionLog) · 수정 감사
- [[ERP/backend/app/models/io_batch.py]] — 입출고 2.0 작업 묶음(배치/번들/라인)
- [[ERP/backend/app/models/warehouse.py]] — 창고 지도(앵글·박스·박스 내용물)
- [[ERP/backend/app/models/handover.py]] — 튜브→고압/진공 인수인계서
- [[ERP/backend/app/models/notification.py]] — 결재·인수인계 알림
- [[ERP/backend/app/models/employee.py]] — 직원 · 부서 · 담당 모델 배정
- [[ERP/backend/app/models/code.py]] — 제품기호·공정코드 마스터
- [[ERP/backend/app/models/base.py]] — 공통 베이스 · 공통 타입(수량/UUID/Bool) · 공통 Enum
- [[ERP/backend/app/models/audit.py]] — 관리자 액션 감사 로그
- [[ERP/backend/app/models/system.py]] — 시스템 설정 키-값
- [[ERP/backend/app/models/__init__.py]] — 위 파일들의 표를 한곳으로 모아 재공개(re-export)

## __init__.py 가 하는 일 (중요)

파일을 여러 개로 쪼개도, 다른 코드는 예전처럼 `from app.models import Item` 한 줄로 모든 표를 그대로 불러올 수 있습니다. `__init__.py` 가 각 파일의 표·Enum 을 한곳으로 다시 내보내(re-export) 주기 때문입니다. 덕분에 "파일만 나누고 호출하는 쪽 코드는 안 바꾼다" 가 가능합니다.

## 먼저 볼 파일

- [[ERP/backend/app/models/item.py]] — 품목 코드(mes_code) 규칙과 BOM 구조. 모든 표가 품목을 가리키므로 출발점.
- [[ERP/backend/app/models/inventory.py]] — 재고 수량이 창고/생산/큐예약으로 어떻게 나뉘는지.
- [[ERP/backend/app/models/stock_request.py]] — 결재가 필요한 입출고 흐름의 상태(대기/예약/완료/반려 등).
- [[ERP/backend/app/models/base.py]] — 수량은 정수만, UUID 저장 규칙 같은 공통 약속.

## 조심할 점

이 폴더는 운영 DB 구조의 기준입니다. 표나 칸을 바꾸면 실제 운영 데이터, 화면, API 가 모두 영향을 받습니다. 변경 전에는 반드시 백업·마이그레이션·스키마 테스트가 필요하며, 서버를 켜는 것만으로 DB 가 바뀌어선 안 됩니다. 특히 수량 칸(quantity / warehouse_qty / pending_quantity)은 서로 합이 맞아야 하는 관계라 한 칸만 보고 고치면 위험합니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/backend/app/📁_app]]
