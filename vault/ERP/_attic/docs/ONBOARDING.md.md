---
type: file-explanation
source_path: "_attic/docs/ONBOARDING.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# ONBOARDING.md — ONBOARDING.md 설명

## 이 파일은 무엇을 책임지나

`ONBOARDING.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `신규 인원 온보딩 (DEXCOWIN MES)`
- `1. 환경 준비 (10분)`
- `2. 클론 + 의존성 설치 (15분)`
- `3. 첫 헬스체크 (5분)`
- `4. 첫 작업 시뮬 (15분)`
- `4.1. 백업 1회`
- `4.2. 입출고 1건 (모바일)`
- `4.3. 관리자 1회`
- `5. 자주 보는 화면`
- `6. 막혔을 때`

## 연결되는 파일

- [[ERP/_attic/docs/📁_docs]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# 신규 인원 온보딩 (DEXCOWIN MES)

이 문서는 처음 MES 프로젝트를 받는 운영자/개발자가 **1시간 안에 첫 작업까지** 도달하기 위한 절차를 정리한다.

> 한국어 LAN 환경 운영 기준. 외부 노출 시나리오는 별도.

---

## 1. 환경 준비 (10분)

| 도구 | 권장 버전 | 확인 명령 |
|---|---|---|
| Python | 3.11+ (3.13 까지 OK) | `py --version` |
| Node | 20+ | `node --version` |
| Git | 최신 | `git --version` |

PostgreSQL/Docker 는 **불필요**. 기본은 SQLite + uvicorn + next dev.

---

## 2. 클론 + 의존성 설치 (15분)

```bat
git clone https://github.com/Hw-03/ERP.git
cd ERP
start.bat
```

`start.bat` 이 다음을 자동 처리:
1. `frontend/node_modules` 가 없거나 lockfile 이 더 새로우면 `npm install`
2. 백엔드 핵심 의존성 (`fastapi`, `uvicorn`, `sqlalchemy` 등) 누락 시 `pip install -r backend/requirements.txt`
3. `bootstrap_db.py --schema` 자동 실행 — 신규 테이블 idempotent 생성 (Phase 5.4-B)
4. LAN IP 자동 감지 → 백엔드 (8010) + 프론트 (3000) 별도 창에서 기동

첫 실행은 5~10분. 두 번째부터는 즉시.

---

## 3. 첫 헬스체크 (5분)

브라우저:
- `http://<감지된IP>:3000` — 모바일/데스크톱 자동 분기
- `http://127.0.0.1:8010/health` — `{"status":"ok"}` 확인
- `http://127.0.0.1:8010/docs` — OpenAPI 인터랙티브

CLI:
```bat
curl http://127.0.0.1:8010/health
curl http://127.0.0.1:8010/health/detailed
```

---

## 4. 첫 작업 시뮬 (15분)
```
