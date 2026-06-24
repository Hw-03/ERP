# 📁 warehouse_map

## 이 폴더는 뭐예요?
창고 지도 기능의 백엔드 라우터 패키지. 창고 앵글(선반 구획) 구조 편집, 박스 배치 및 위치 배정, 지도 조회/재고 대조 등 창고 지도 화면에 필요한 모든 API 엔드포인트를 담당한다.

## 언제 여기를 보나요?
- 창고 지도 화면(`/warehouse-map`)의 API 동작을 파악하거나 수정할 때
- 앵글·박스 CRUD 흐름, 인증 방식(창고 관리자/admin PIN)을 확인할 때
- 박스 자동 차감 활성화 여부나 배치 수량 vs 창고 재고 불일치 문제를 추적할 때

## 주요 파일
- `__init__.py` — 패키지 진입점. 세 서브 라우터를 하나의 `router`로 조립
- `query.py` — 공개 GET 엔드포인트: `/box-tracking`, `/structure`, `/map`, `/reconcile`, `/jari`
- `angles.py` — 앵글 CRUD (창고 정/부 관리자 인증 필요). 구조 편집 담당
- `boxes.py` — 박스 CRUD (admin PIN + 창고 관리자). 위치 배정 및 자리 용량 검증 포함

## 관련 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/warehouse_map.py]] — 지도 페이로드 조립·재고 대조·박스 차감 활성화 등 핵심 비즈니스 로직
- [[ERP/backend/app/models/📁_models]] — `WarehouseAngle`, `WarehouseBox`, `WarehouseBoxItem` DB 모델
- [[ERP/backend/app/schemas/📁_schemas]] — 이 라우터가 사용하는 요청/응답 스키마
