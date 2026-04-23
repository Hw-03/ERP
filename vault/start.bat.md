---
type: code-note
project: ERP
layer: infra
source_path: start.bat
status: active
tags:
  - erp
  - infra
  - script
  - windows
aliases:
  - 로컬 실행 배치
---

# start.bat

> [!summary] 역할
> Windows 환경에서 **백엔드와 프론트엔드를 동시에 실행**하는 배치 스크립트.
> Docker 없이 로컬에서 빠르게 개발 서버를 띄울 때 사용한다.

> [!info] 실행 내용
> 1. 새 CMD 창에서 백엔드 실행: `uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload`
> 2. 새 CMD 창에서 프론트엔드 실행: `npm run dev -- --hostname 0.0.0.0 --port 3000`
> 3. 5초 대기 후 브라우저에서 `http://192.168.0.63:3000` 자동 오픈

> [!warning] 주의
> 접속 IP(`192.168.0.63`)가 하드코딩되어 있으므로, 내부 네트워크 IP가 변경되면 수정 필요.

---

## 쉬운 말로 설명

**`start.bat` 더블클릭 한 번이면 개발 서버 기동**. Docker 없이 로컬 Python/Node 로 백엔드+프론트엔드 동시 실행. 창 2개 자동 띄우고 브라우저도 열어줌.

일상 개발 시 가장 자주 쓰는 실행 방식.

## 사전 요구사항

- Python 3.11 + 가상환경(선택)
- Node 20
- `pip install -r backend/requirements.txt` 1회 실행
- `cd frontend && npm install` 1회 실행

## FAQ

**Q. 내부 IP 바뀌면?**
`start.bat` 의 `http://192.168.0.63:3000` URL 하드코딩 수정. 또는 `localhost` 로 변경.

**Q. 백엔드 재시작만 필요?**
해당 CMD 창만 닫고 다시 실행. uvicorn `--reload` 옵션으로 코드 수정 시 자동 재시작됨.

**Q. 로그 저장?**
현재는 화면만. 파일로 남기려면 `> log.txt 2>&1` 리디렉션 추가.

---

## 관련 문서

- [[docker-compose.nas.yml.md]] — Docker를 이용한 운영 실행
- [[backend/app/main.py.md]] — 백엔드 엔트리포인트
- [[frontend/package.json.md]] — `npm run dev` 정의

Up: ERP MOC
