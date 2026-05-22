---
type: file-explanation
source_path: "README.md"
importance: important
layer: meta
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# README.md — 프로젝트 공식 소개와 실행 안내

## 이 파일은 무엇을 책임지나

이 문서는 DEXCOWIN MES가 무엇인지, 어떻게 실행하는지, 어떤 폴더를 먼저 봐야 하는지 알려주는 공식 입구입니다.

## 업무 흐름에서의 의미

새 담당자나 운영자가 프로젝트 전체 방향을 가장 빠르게 확인할 때 읽는 문서입니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DEXCOWIN MES`
- `현재 기준`
- `빠른 시작 (Windows · 권장)`
- `수동 실행`
- `운영 보조 스크립트`
- `품목코드 핵심 규칙`
- `한눈에 보는 폴더 구조`
- `문서 허브`
- `검증`
- `5게이트 일괄 검증 (commit 전 권장)`

## 연결되는 파일

- [[ERP/📁_ERP]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

README가 오래되면 새 사람이 잘못된 실행법을 따라갈 수 있습니다. 큰 구조가 바뀌면 같이 갱신해야 합니다.

## 핵심 발췌

```md
# DEXCOWIN MES

DEXCOWIN의 품목, 재고, BOM, 입출고를 관리하는 경량 MES 프로토타입.

**현재 안정성 점수**: ~96/100 (Round-10A 완료, 2026-05-02). 세부 추적: [docs/CODEX_PROGRESS.md](docs/CODEX_PROGRESS.md)

## 현재 기준

- 기준 품목 수: 722건
- 백엔드: FastAPI + SQLAlchemy + SQLite (`backend/mes.db`)
- 프론트엔드: Next.js 14 + Tailwind CSS
- 주 사용 화면: `/legacy` (데스크톱 셸: 대시보드 / 입출고 / 입출고 내역 / 관리자)
- 품목코드 기준 문서: `docs/ITEM_CODE_RULES.md`

## 빠른 시작 (Windows · 권장)

루트의 `start.bat` 한 번 실행으로 백엔드·프론트가 함께 뜨고 LAN IP 기준 브라우저가 자동 실행된다.

```bat
start.bat
```

- 백엔드: `http://0.0.0.0:8010` (로컬 호출은 `http://127.0.0.1:8010`)
- 프론트엔드: `http://<LAN IP>:3000` 또는 `http://localhost:3000`
- 같은 사설망 안의 다른 PC에서도 `http://<LAN IP>:3000` 으로 접속 가능

처음 실행 시 `npm install` 과 `pip install -r backend/requirements.txt` 가 자동 수행된다.

## 수동 실행

백엔드:

```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload
```

프론트엔드:

```bash
cd frontend
npm run dev
```

대표 접속:

```text
http://localhost:3000
```

## 운영 보조 스크립트

| 스크립트 | 역할 |
|---|---|
| `scripts/ops/backup_db.bat` | `backend/mes.db` 를 `backend/_backup/mes_YYYYMMDD_HHMMSS.db` 로 복사 |
```
