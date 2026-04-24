---
type: code-note
project: ERP
layer: backend
source_path: backend/app/main.py
status: active
tags:
  - erp
  - backend
  - fastapi
  - entrypoint
aliases:
  - 백엔드 진입점
  - main.py
---

# main.py

> [!summary] 역할
> FastAPI 앱을 만들고 라우터를 등록하는 서버 진입점.
> 예전처럼 DB를 시작하면서 전부 자동 세팅하기보다는, API 서버 책임과 별도 부트스트랩 책임이 더 분리된 상태로 보는 게 맞다.

## 쉬운 말로 설명

이 파일은 백엔드의 "문 열기 버튼"이다. 서버를 띄우면 여기서 FastAPI 앱이 만들어지고, 각 기능 라우터가 `/api/...` 아래에 연결된다.  
DB 초기화나 대량 시드 작업은 이제 `bootstrap_db.py` 같은 별도 스크립트와 함께 읽는 편이 이해가 빠르다.

## 핵심 책임

- FastAPI 앱 생성과 메타데이터 설정
- CORS 설정
- `items`, `inventory`, `production`, `queue`, `models` 등 라우터 등록
- `/health`, `/health/detailed`, `/` 같은 시스템 엔드포인트 제공

## 주의점

- `health/detailed` 는 재고 불일치 점검을 위해 `services/integrity.py` 를 호출한다.
- 서버 시작 책임과 DB 준비 책임을 혼동하지 말고, 초기화는 `backend/bootstrap_db.py` 와 함께 본다.

## 관련 문서

- [[backend/app/routers/routers]]
- [[backend/app/services/integrity.py.md]]
- [[backend/bootstrap_db.py.md]]

Up: [[backend/app/app]]

