---
type: index
project: ERP
layer: backend
status: active
tags:
  - erp
  - backend
aliases:
  - 백엔드 폴더
---

# backend

> [!summary] 역할
> FastAPI 기반의 API 서버와 DB 관리 코드를 담는 폴더.
> 이번 브랜치 기준으로는 재고 무결성 점검, 모델 관리, 부트스트랩 스크립트가 더 분명하게 분리됐다.

## 핵심 문서

- [[backend/app/app]] - 앱 내부 구조
- [[backend/app/main.py.md]] - API 서버 진입점
- [[backend/app/models.py.md]] - ORM 테이블 정의
- [[backend/app/schemas.py.md]] - 요청/응답 스키마
- [[backend/schema.sql.md]] - PostgreSQL 이관용 스키마 파일
- [[backend/bootstrap_db.py.md]] - DB 초기화/점검용 부트스트랩 스크립트

## 하위 허브

- [[backend/app/routers/routers]] - API 엔드포인트
- [[backend/app/services/services]] - 비즈니스 로직
- [[backend/app/utils/utils]] - 유틸리티 함수

## 이번 브랜치에서 눈여겨볼 변경

- `main.py` 에서 자동 부트스트랩 책임이 줄고, 명시적 초기화 흐름이 더 또렷해졌다.
- `app/services/integrity.py` 가 생겨서 재고 합계 불일치 점검/복구 로직이 분리됐다.
- `app/services/stock_math.py` 가 생겨서 화면과 서비스가 공통 재고 계산식을 재사용할 수 있게 됐다.
- `app/routers/models.py` 가 생겨서 제품 모델 CRUD가 별도 라우터로 분리됐다.
- 운영 보조 스크립트가 늘어 `bootstrap_db.py`, `assign_models.py`, `fix_unclassified.py`, `seed_bom_complete.py` 같은 정비 도구가 추가됐다.

## 실행 메모

```bash
cd backend
python -m uvicorn app.main:app --reload
```

DB 준비나 정비 작업은 서버 시작과 분리해서 `python bootstrap_db.py --all` 같은 명시적 실행 흐름으로 보는 편이 안전하다.

## 관련 문서

- [[_vault/guides/ERP_MOC]]
- [[_vault/guides/처음_읽는_사람]]
- [[docs/ITEM_CODE_RULES.md.md]]

Up: [[ERP]]

