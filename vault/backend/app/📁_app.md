---
type: index
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/
tags: [vault, index, folder-marker]
aliases:
  - "app"
  - "app.md"
---

# 📁 app

> [!summary] 역할
> DEXCOWIN MES 백엔드의 Python 패키지 루트. FastAPI 앱 생성, ORM 모델 정의, Pydantic 스키마, DB 연결, 라우터·서비스·유틸리티 서브 패키지가 모두 여기서 출발한다.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/backend/app/` 의 vault 미러. 자식 파일들의 분석 노트가 모여 있다.

## 어떤 파일들이 있나

핵심 파일:
- `[[erp/backend/app/main.py|main.py]]` — FastAPI 앱 인스턴스 생성, 미들웨어 등록, 라우터 include. 서버 기동 자체로 DB 가 변하지 않도록 설계됨.
- `[[erp/backend/app/models.py|models.py]]` — SQLAlchemy ORM 모델 전체 (Item, Inventory, InventoryLocation, TransactionLog, StockRequest, Employee, Department …). 스키마 변경 시 마이그레이션 영향.
- `[[erp/backend/app/schemas.py|schemas.py]]` — Pydantic 응답·요청 모델. 프런트엔드 API 계약과 직결.
- `[[erp/backend/app/database.py|database.py]]` — SQLAlchemy 엔진·세션·`get_db` 의존성. `_is_sqlite()` 플래그 포함.
- `[[erp/backend/app/_logging.py|_logging.py]]` — 구조화 로거 설정. `setup_logging()` / `get_logger()` 제공.

부수 파일: `__init__.py` (패키지 마커), `__pycache__/` (무시).

## 도메인 컨텍스트

시스템 전체의 기술 진입점. `main.py` 에서 15개 라우터를 `include_router` 로 마운트하고, `audit_csv_svc.register_session_listeners()` 로 감사 이벤트를 연결한다. DB 초기화·시드는 `backend/bootstrap_db.py --all` 로만 수행한다.

## ⚠️ 위험 포인트

- `models.py` ORM 변경 → `bootstrap_db.py` 재실행 또는 마이그레이션 스크립트 작성 필요. 스키마 드리프트 발생 가능.
- `schemas.py` Pydantic 모델 변경 → 프런트엔드 API 타입 불일치 즉시 발생.
- `main.py` 미들웨어 순서 변경 → CORS 오류 또는 인증 우회 위험.

## 관련 가이드

- [[erp/_vault/guides/bootstrap-db|bootstrap-db]]
- [[erp/_vault/guides/run-backend|run-backend]]

## 자식 폴더

- [[erp/backend/app/routers/📁_routers|routers/]] — 15개 라우터 + inventory 서브 패키지
- [[erp/backend/app/services/📁_services|services/]] — 14개 비즈니스 로직 서비스
- [[erp/backend/app/utils/📁_utils|utils/]] — excel, item_code 등 유틸리티
