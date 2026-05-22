---
type: file-explanation
source_path: "_attic/docs/research/2026-05-04-dockerfile-port-alignment.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# 2026-05-04-dockerfile-port-alignment.md — 2026-05-04-dockerfile-port-alignment.md 설명

## 이 파일은 무엇을 책임지나

`2026-05-04-dockerfile-port-alignment.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `Dockerfile 포트/실행 정렬 — 2026-05-04`
- `1. 변경 요약`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `2. compose 파일과의 충돌 여부`
- `2-1. backend 서비스 — 충돌 없음`
- `2-2. frontend 서비스 — 잠재 중복 (위험 낮음)`
- `2-3. NEXT_PUBLIC_API_URL 주입`
- `3. 포트 8000 잔재 검색 (변경 후)`
- `4. 위험도`

## 연결되는 파일

- [[ERP/_attic/docs/research/📁_research]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
# Dockerfile 포트/실행 정렬 — 2026-05-04

> **작업 ID:** MES-DEPLOY-001
> **작성일:** 2026-05-04 (월)
> **기준 브랜치:** `feat/hardening-roadmap`
> **수정 여부:** Dockerfile 2건만 수정. compose 는 다음 작업.

---

## 1. 변경 요약

### backend/Dockerfile

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| EXPOSE | 8000 | **8010** |
| CMD | `uvicorn ... --port 8000 --reload` | `uvicorn ... --port 8010` (no reload) |

### frontend/Dockerfile

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| 의존성 설치 | `npm install` | **`npm ci`** (lock 정합성 강제) |
| 빌드 | (런타임 실행) | **`RUN npm run build`** (이미지 빌드 시) |
| 환경 | — | `NEXT_TELEMETRY_DISABLED=1` |
| CMD | `npm run dev` | **`npm run start`** |

---

## 2. compose 파일과의 충돌 여부

루트에 `docker-compose.yml` 은 **없다**. 운영용은 `docker/docker-compose.nas.yml` 만 존재.

### 2-1. backend 서비스 — 충돌 없음

```yaml
backend:
  ports:
    - "8010:8010"
  command: uvicorn app.main:app --host 0.0.0.0 --port 8010
```

- 포트 8010 일치
- compose `command` 가 Dockerfile `CMD` 를 override 하지만 둘이 사실상 동일하므로 안전
- 다음 작업 (compose 정리) 에서 `command:` 제거하고 Dockerfile CMD 만 쓰는 방향 권장

### 2-2. frontend 서비스 — 잠재 중복 (위험 낮음)

```yaml
frontend:
  command: sh -c "npm run build && npm run start"
```

- 본 PR 의 frontend Dockerfile 은 이미 빌드 시점에 `npm run build` 를 수행
- compose `command` 가 컨테이너 시작 시 또 빌드 → **중복 빌드 (시간 손해, 동작 정상)**
```
