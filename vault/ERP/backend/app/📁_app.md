---
type: folder-note
source_path: "backend/app"
importance: important
layer: backend
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 app

## 이 폴더는 무엇을 위한 곳인가

백엔드 애플리케이션의 본체입니다. 서버 시작점, DB 연결, 모델, 스키마, 라우터, 서비스가 모여 있습니다.

## 현장 업무와의 관계

현장 화면의 거의 모든 저장/조회 동작이 이 폴더를 거칩니다.

## 언제 보면 좋나

- 백엔드 오류의 원인을 따라갈 때
- 어떤 API가 어떤 업무 규칙을 쓰는지 확인할 때
- DB와 화면 사이의 데이터 약속을 볼 때

## 주요 하위 폴더

- [[ERP/backend/app/models/📁_models]] — DB 표(테이블) 구조를 도메인별로 정의한 패키지입니다. 회사 데이터의 뼈대.
- [[ERP/backend/app/routers/📁_routers]] — 프론트엔드가 호출하는 API 문입니다. URL별로 요청을 받아 서비스 로직으로 넘깁니다.
- [[ERP/backend/app/services/📁_services]] — API 라우터 안에서 바로 처리하기 어려운 실제 업무 규칙을 모아 둔 곳입니다.
- [[ERP/backend/app/utils/📁_utils]] — `backend/app/utils`는 백엔드 안의 세부 폴더입니다.

## 먼저 볼 파일 5개

- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/backend/app/schemas/📁_schemas]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 schemas/ 패키지입니다(도메인별 모듈로 분리).
- [[ERP/backend/app/__init__.py]] — `__init__.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/__init__.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/backend/app/_logging.py]] — `_logging.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/_logging.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

> [!info]- 추가 파일
> - [[ERP/backend/app/main.py]] — main.py

## 조심할 점

이 폴더는 운영 핵심입니다. 특히 models, schemas, services, routers는 서로 맞물려 있으므로 한 파일만 보고 고치면 위험합니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/backend/📁_backend]]
