---
type: file
project: ERP
layer: frontend
source_path: frontend/next.config.js
status: active
tags:
  - erp
  - frontend
  - config
aliases:
  - Next.js 설정
---

# frontend/next.config.js

> [!summary] 역할
> Next.js 빌드 및 개발 서버 설정 파일.
> 핵심 역할은 `/api/*` 요청을 백엔드로 **프록시**하는 것이다.

## 주요 설정

### API 프록시 (rewrites)

```js
source: "/api/:path*"
destination: BACKEND_INTERNAL_URL || "http://localhost:8010"
```

- 프론트엔드에서 `/api/items` 호출 → 백엔드 `http://localhost:8010/api/items`로 전달
- `BACKEND_INTERNAL_URL` 환경변수로 Docker 환경에서 내부 URL 지정 가능
- Docker에서는 `http://backend:8010`으로 설정됨

### 기타 설정

| 설정 | 값 | 설명 |
|------|-----|------|
| `devIndicators.buildActivity` | `false` | 개발 중 빌드 인디케이터 숨김 |

## 왜 프록시가 필요한가?

브라우저에서 직접 `http://localhost:8010/api/...`를 호출하면 CORS 문제가 발생할 수 있다.
Next.js 서버를 통해 `/api/*`로 중계하면 같은 origin에서 요청하는 것처럼 처리된다.

---

## 쉬운 말로 설명

**CORS 문제를 우회하는 "API 우체통" 설정**. 브라우저가 `http://localhost:3000/api/items` 호출하면 Next.js 가 자동으로 백엔드(`http://localhost:8010/api/items`)로 전달. 프론트와 백엔드가 같은 도메인처럼 동작.

## rewrites 흐름

```
[브라우저]            [Next.js 서버]            [FastAPI 백엔드]
GET /api/items  -->   프록시 rewrite       -->  GET /api/items
                ← 응답 전달                ← 응답
```

## 환경별 백엔드 URL

| 환경 | BACKEND_INTERNAL_URL | 실제 연결 |
|------|---------------------|----------|
| 로컬 | (없음) | `http://localhost:8010` |
| Docker (dev) | `http://backend:8000` | 컨테이너 네트워크 |
| Docker (NAS) | `http://backend:8010` | 컨테이너 네트워크 |

## FAQ

**Q. `/api` 접두사 바꾸기?**
`source: "/custom-api/:path*"` 로 변경. `lib/api.ts` 의 baseURL 도 같이 수정.

**Q. 프록시 안 쓰고 바로 백엔드 호출?**
FastAPI 의 CORS 미들웨어 설정 필요. 현재는 이미 내부 IP 대역에 대해 허용.

---

Up: [[frontend/frontend]]
Related: [[frontend/lib/api.ts.md]], [[docker-compose.yml.md]], [[docker-compose.nas.yml.md]]
