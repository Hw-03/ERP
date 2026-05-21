---
type: index
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/routers/
tags: [vault, index, folder-marker]
aliases:
  - "routers"
  - "routers.md"
---

# 📁 routers

> [!summary] 역할
> HTTP 엔드포인트 정의 모음. 각 파일이 도메인 단위로 라우터를 선언하고, `main.py` 가 이를 `include_router` 로 마운트한다.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/backend/app/routers/` 의 vault 미러. 자식 파일들의 분석 노트가 모여 있다.

## 어떤 파일들이 있나

핵심 라우터:
- `[[erp/backend/app/routers/items.py|items.py]]` — 품목 CRUD, 아이템 코드 검색
- `[[erp/backend/app/routers/stock_requests.py|stock_requests.py]]` — 불출 요청 생성·승인·반려·취소 흐름
- `[[erp/backend/app/routers/production.py|production.py]]` — 생산 입고 처리
- `[[erp/backend/app/routers/io.py|io.py]]` — 입출고 v2 (재고 이동의 상위 API)
- `[[erp/backend/app/routers/admin_audit.py|admin_audit.py]]` — 감사 로그 조회
- `[[erp/backend/app/routers/admin_audit_csv.py|admin_audit_csv.py]]` — 감사 로그 CSV 익스포트

나머지 라우터 (도메인별):
- `bom.py` — BOM(자재 명세서) 조회·편집
- `codes.py` — 공통 코드 관리
- `departments.py` — 부서 목록
- `dept_adjustment.py` — 부서 재고 조정
- `employees.py` — 직원·PIN 관리
- `settings.py` — 시스템 설정
- `variance.py` — 재고 차이 보고
- `models.py` — 공유 Pydantic 요청/응답 모델 (라우터 간 공통 스키마)
- `_errors.py` — `ErrorCode` 열거형 및 공통 예외 처리

제거된 라우터: `queue`, `alerts`, `counts`, `loss`, `ship_packages` — 해당 기능은 inventory 서브 패키지로 흡수되거나 삭제됨.

## 도메인 컨텍스트

재고 이동·요청·생산 등 MES 핵심 업무 흐름이 이 폴더에서 HTTP 레이어로 노출된다. 비즈니스 로직은 `services/` 에 위임하고, 라우터는 요청 파싱·응답 직렬화·권한 의존성에 집중한다.

## ⚠️ 위험 포인트

- `models.py` 는 라우터용 Pydantic 모델 파일로, `app/models.py` (ORM) 와 이름이 겹침. import 시 주의.
- `stock_requests.py` 의 상태 전이 엔드포인트는 낙관적 락과 결합돼 있어 동시성 테스트 통과 후 변경할 것.
- `_errors.py` 의 `ErrorCode` 를 임의로 추가하면 프런트엔드 에러 핸들러와 불일치 발생 가능.

## 관련 가이드

- [[erp/_vault/guides/router-conventions|router-conventions]]
- [[erp/_vault/guides/error-handling|error-handling]]

## 자식 폴더

- [[erp/backend/app/routers/inventory/📁_inventory|inventory/]] — 재고 관리 라우터 패키지 (8개 서브모듈)
