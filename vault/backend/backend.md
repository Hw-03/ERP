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
> FastAPI 기반의 REST API 서버. 재고·품목·생산·BOM 등 모든 데이터 처리를 담당한다.
> SQLite 데이터베이스(`erp.db`)를 사용한다.

## 하위 문서

- [[backend/app/app]] — 핵심 앱 모듈
- [[backend/app/main.py.md]] — 서버 진입점
- [[backend/app/models.py.md]] — DB 테이블 정의
- [[backend/app/schemas.py.md]] — 데이터 스키마
- [[backend/app/database.py.md]] — DB 연결 설정
- [[backend/requirements.txt.md]] — Python 패키지 목록
- [[backend/seed.py.md]] — 초기 데이터 시드 (품목 + 기준 데이터)
- [[backend/seed_bom.py.md]] — BOM 계층 샘플 데이터 생성
- [[backend/seed_employees.py.md]] — 직원 26명 동기화
- [[backend/seed_packages.py.md]] — 출하묶음 20개 생성
- [[backend/sync_excel_stock.py.md]] — 엑셀 → DB 재고 동기화
- [[backend/Dockerfile.md]] — 컨테이너 빌드 설정

## 하위 폴더

- [[backend/app/routers/routers]] — API 엔드포인트
- [[backend/app/services/services]] — 비즈니스 로직
- [[backend/app/utils/utils]] — 유틸리티

## 실행 방법

```bash
cd backend
python -m uvicorn app.main:app --reload
```

API 문서: http://localhost:8000/docs

---

## 쉬운 말로 설명

Backend는 이 ERP의 **"뇌"**다. 사용자가 화면에서 버튼을 누르면, 그 요청을 받아서 규칙대로 데이터를 읽고 쓰는 역할을 한다.

구조는 3층이다:
1. **입구 (routers/)** — 어떤 URL 요청이 오면 받는 담당. 예: `POST /api/items` 는 `items.py` 가 받는다.
2. **두뇌 (services/)** — 받은 요청을 실제로 계산·처리. 예: ERP 코드 자동 생성, BOM 전개.
3. **기억 (models.py + database.py)** — DB 테이블 정의와 연결.

그 밖에 `utils/` 는 자주 쓰는 도우미 함수들, `seed_*.py` 는 초기 데이터 넣는 스크립트.

---

## 이 폴더에서 벌어지는 일 (전형적인 흐름)

예: 사용자가 "튜브 10개 입고" 버튼을 누르면:

1. 프론트엔드가 `POST /api/inventory/receive` 호출
2. **routers/inventory.py** 가 요청 수신
3. **services/inventory.py** 의 `receive_confirmed()` 실행
4. **models.py** 의 `Inventory` 테이블 수량 +10
5. `transaction_logs` 에 `RECEIVE` 기록
6. 업데이트된 재고 정보를 JSON으로 반환
7. 프론트가 화면 갱신

자세한 건 재고 입출고 시나리오.

---

## 핵심 용어 (자세한 건 용어 사전)

- **FastAPI** — 이 백엔드에서 쓰는 파이썬 웹 프레임워크. URL ↔ 함수 매핑과 자동 문서화 제공.
- **SQLAlchemy** — DB를 파이썬 클래스로 다루는 라이브러리. `models.py` 가 이걸로 작성됨.
- **Pydantic** — 요청/응답 데이터 검증. `schemas.py` 에서 사용.
- **uvicorn** — FastAPI를 실제 실행시키는 서버 프로그램.

---

## 관련 문서

- [[backend/app/app]] — 앱 내부 구조
- [[backend/app/routers/routers]] — API 14개 목록
- [[backend/app/services/services]] — 비즈니스 로직
- 품목 등록 시나리오, 재고 입출고 시나리오, 생산 배치 시나리오
- FAQ 전체, 용어 사전

Up: ERP MOC
