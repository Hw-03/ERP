---
type: folder-note
source_path: "backend"
importance: important
layer: backend
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 backend

## 이 폴더는 무엇을 위한 곳인가

FastAPI 백엔드 서버입니다. 화면에서 누르는 버튼이 실제 DB 조회, 재고 변경, 승인 처리로 이어지는 곳입니다.

## 현장 업무와의 관계

현장 직원이 입고/출고를 요청하거나 관리자가 품목과 직원을 바꾸면, 최종적으로 이 폴더의 API와 서비스가 DB를 읽고 씁니다.

## 언제 보면 좋나

- 재고 수량 계산이 맞는지 확인할 때
- API 응답이 이상할 때
- DB 구조나 운영 스크립트를 확인할 때

## 주요 하위 폴더

- [[ERP/backend/app/📁_app]] — 백엔드 애플리케이션의 본체입니다. 서버 시작점, DB 연결, 모델, 스키마, 라우터, 서비스가 모여 있습니다.
- [[ERP/backend/data/📁_data]] — `backend/data`는 백엔드 안의 세부 폴더입니다.
- [[ERP/backend/tests/📁_tests]] — `backend/tests`는 백엔드 안의 세부 폴더입니다.

## 먼저 볼 파일 5개

- [[ERP/backend/assign_models.py]] — `assign_models.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/assign_models.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/backend/bootstrap_db.py]] — `bootstrap_db.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/bootstrap_db.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/backend/sync_excel_stock.py]] — `sync_excel_stock.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/sync_excel_stock.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/backend/.dockerignore]] — `.dockerignore`는 Git/도구 설정입니다. 프로젝트 구조 안에서 `backend/.dockerignore` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/backend/.env.example]] — `.env.example`는 프로젝트 파일입니다. 프로젝트 구조 안에서 `backend/.env.example` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

> [!info]- 추가 파일
> - [[ERP/backend/.gitignore]] — .gitignore
> - [[ERP/backend/archive_old_logs.py]] — archive_old_logs.py
> - [[ERP/backend/backup_db.py]] — backup_db.py
> - [[ERP/backend/requirements.txt]] — requirements.txt
> - [[ERP/backend/schema.sql]] — schema.sql
> - [[ERP/backend/seed.py]] — seed.py
> - [[ERP/backend/seed_bom.py]] — seed_bom.py
> - [[ERP/backend/seed_bom_complete.py]] — seed_bom_complete.py
> - [[ERP/backend/seed_employees.py]] — seed_employees.py

## 조심할 점

재고, 요청 상태, 직원/PIN, DB 스키마를 바꾸면 운영 데이터가 달라질 수 있습니다. 백업과 테스트 없이 수정하면 안 됩니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/📁_ERP]]
