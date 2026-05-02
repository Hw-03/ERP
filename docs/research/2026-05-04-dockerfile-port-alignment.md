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
- 다음 작업: compose `command` 를 `npm run start` 만 남기거나 제거

### 2-3. NEXT_PUBLIC_API_URL 주입

- compose 는 `BACKEND_INTERNAL_URL=http://backend:8010` 로 next.config.js 의 rewrites 에 주입
- frontend Dockerfile 빌드 단계에서는 `BACKEND_INTERNAL_URL` 미주입 — 빌드 산출물에는 영향 없음 (rewrites 는 런타임 평가)
- 위험 없음

---

## 3. 포트 8000 잔재 검색 (변경 후)

```bash
rg -n "8000|8010" backend/Dockerfile frontend/Dockerfile docker/docker-compose.nas.yml frontend/next.config.js start.bat
```

**기대 결과:** 모든 위치가 8010 (8000 잔재 0).

---

## 4. 위험도

**C** (Dockerfile 수정 — 운영 컨테이너 기동 검증 필요).

기능적 회귀 가능성:
- backend: `--reload` 제거로 코드 변경 자동 반영 안 됨 → 운영에선 정상, 개발 환경에선 docker-compose `command` 로 override 필요
- frontend: `npm run build` 실패 시 이미지 빌드 실패 (전 단계 차단). 런타임 안정성은 dev 보다 향상

---

## 5. 실제 실행 검증 필요 항목 (회사 PC)

- [ ] `docker build -t mes-backend backend/`
- [ ] `docker run --rm -p 8010:8010 mes-backend` → curl http://localhost:8010/health
- [ ] `docker build -t mes-frontend frontend/`
- [ ] `docker run --rm -p 3000:3000 mes-frontend` → 브라우저 확인
- [ ] `docker compose -f docker/docker-compose.nas.yml up --build` 전체 동작
- [ ] `docker compose ... logs backend` 에 `--reload` 메시지 없음 확인
- [ ] `docker compose ... logs frontend` 에 `next dev` 가 아닌 `next start` 확인

---

## 6. 다음 작업 (compose 정리)

1. `docker/docker-compose.nas.yml` 의 `backend.command` 제거 (Dockerfile CMD 와 동일하므로)
2. `docker/docker-compose.nas.yml` 의 `frontend.command` → `npm run start` 만 (또는 제거)
3. 루트 `docker-compose.yml` 신규 생성 검토 (개발용 — `command` override 로 `--reload` 사용)
4. 환경변수 `NEXT_PUBLIC_API_URL` 명시 정책 정리

---

## 7. 동결 식별자 영향

이번 변경은 **frozen 식별자 영향 0** — `erp.db`, `erp_code`, `Hw-03/ERP` 등 모두 그대로.
