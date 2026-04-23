---
type: index
project: ERP
layer: backend
status: active
tags:
  - erp
  - backend
aliases:
  - 앱 코어
---

# backend/app

> [!summary] 역할
> FastAPI 앱의 핵심 모듈이 모여 있는 폴더.
> 서버 진입점, DB 연결, 데이터 모델, 스키마, 라우터, 서비스, 유틸이 모두 여기 있다.

## 하위 문서

| 파일 | 역할 |
|------|------|
| [[backend/app/main.py.md]] | 서버 진입점, 라우터 등록, 마이그레이션 |
| [[backend/app/database.py.md]] | SQLAlchemy DB 연결 및 세션 관리 |
| [[backend/app/models.py.md]] | DB 테이블 ORM 모델 정의 |
| [[backend/app/schemas.py.md]] | Pydantic 입출력 스키마 |

## 하위 폴더

- [[backend/app/routers/routers]] — API 라우터 14개
- [[backend/app/services/services]] — 비즈니스 로직 레이어
- [[backend/app/utils/utils]] — ERP 코드 생성, 엑셀 처리

---

## 쉬운 말로 설명

이 폴더는 백엔드의 실제 "내용물"이다. 4가지 역할의 파일이 있다:

| 파일 | 비유 | 하는 일 |
|------|------|--------|
| `main.py` | 접수대 | 앱이 켜지면 제일 먼저 실행. 라우터들을 등록하고 DB를 초기화. |
| `database.py` | 파일함 | DB 연결 방법 + 세션 관리. |
| `models.py` | 서류 양식 | DB 테이블 구조 정의 (items, inventory 등). |
| `schemas.py` | 접수 서류 | API 요청/응답 형식 정의 (Pydantic). |

그리고 3개의 하위 폴더:
- `routers/` — URL 담당자들
- `services/` — 실제 일하는 사람들
- `utils/` — 도우미 도구들

---

## 파일 간 의존 관계

```
요청 → main.py (라우터 등록)
         ↓
      routers/*.py (URL 처리)
         ↓
      schemas.py (요청 검증)
         ↓
      services/*.py (로직 실행)
         ↓
      models.py (DB 테이블)
         ↓
      database.py (실제 DB)
```

---

## 핵심 용어 (자세한 건 용어 사전)

- **ORM** — Object-Relational Mapping. `models.py` 에서 파이썬 클래스로 DB 테이블을 표현.
- **Pydantic** — 데이터 검증 라이브러리. `schemas.py` 의 클래스가 "들어오는 JSON이 형식 맞는지" 자동 검사.
- **세션(session)** — DB 연결 한 건. `database.py` 가 요청마다 세션을 만들고 끝나면 닫음.

---

## 관련 문서

- [[backend/backend]] (상위 폴더)
- [[backend/app/routers/routers]], [[backend/app/services/services]], [[backend/app/utils/utils]]
- [[backend/app/models.py.md]] ⭐ (DB 테이블 정의, 가장 중요)
- [[backend/app/schemas.py.md]]
- 품목 등록 시나리오 — 이 폴더 구조가 어떻게 협업하는지 예시

Up: [[backend/backend]]
