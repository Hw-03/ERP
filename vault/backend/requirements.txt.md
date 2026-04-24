---
type: code-note
project: ERP
layer: backend
source_path: backend/requirements.txt
status: active
tags:
  - erp
  - backend
  - infra
aliases:
  - Python 패키지 목록
---

# requirements.txt

> [!summary] 역할
> 백엔드 서버 실행에 필요한 Python 패키지 목록. `pip install -r requirements.txt`로 설치한다.

> [!info] 주요 패키지
> - `fastapi` — 웹 프레임워크
> - `uvicorn` — ASGI 서버
> - `sqlalchemy` — ORM (DB 연동)
> - `pydantic` — 데이터 검증
> - `openpyxl` — 엑셀 파일 처리
> - `python-dotenv` — 환경변수 로드

---

## 쉬운 말로 설명

**백엔드 실행에 필요한 파이썬 라이브러리 목록**. 새 환경에서 서버 돌리려면:
```bash
pip install -r backend/requirements.txt
```

## 의존성 역할

| 패키지 | 용도 |
|--------|------|
| `fastapi` | 라우터, DI, OpenAPI 자동 문서화 |
| `uvicorn[standard]` | 개발/운영 ASGI 서버 |
| `sqlalchemy` | ORM — `models.py` 클래스 ↔ DB 테이블 매핑 |
| `pydantic` v2 | 요청/응답 데이터 검증 (`schemas.py`) |
| `openpyxl` | 엑셀 파일 읽기/쓰기 (내보내기/가져오기) |
| `python-dotenv` | `.env` 파일 로드 |

## FAQ

**Q. 버전 pin?**
운영 안정성 위해 `==` 로 고정 권장. 현재는 일부만 pin.

**Q. 새 패키지 추가?**
`pip install <pkg>` → `pip freeze | grep <pkg> >> requirements.txt` 로 버전 포함 추가.

**Q. gunicorn 필요?**
단일 서버 소규모 운영에는 uvicorn 으로 충분. 멀티프로세스 필요 시 `gunicorn + uvicorn.workers.UvicornWorker` 조합.

---

Up: [[backend/backend]]
