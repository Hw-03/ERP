---
type: file-explanation
source_path: "backend/requirements.txt"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# requirements.txt — requirements.txt 설명

## 이 파일은 무엇을 책임지나

`requirements.txt`는 문서입니다. 프로젝트 구조 안에서 `backend/requirements.txt` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/backend/📁_backend]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```text
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy>=2.0.31
psycopg2-binary>=2.9.10
alembic==1.13.1
python-dotenv==1.0.1
pydantic[email]>=2.9.0
python-multipart==0.0.9
openpyxl==3.1.5

# Testing (Phase 5.3-D)
pytest>=8.0
pytest-cov>=5.0
httpx>=0.27
```
