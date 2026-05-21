---
layer: docker
---

# frontend/Dockerfile — 프론트엔드 빌드

> [!summary] Node 20 + Next.js. npm ci → build → start (dev 금지)

## 1. 역할
package*.json → npm ci (정확한 설치). npm run build (.next/). NEXT_TELEMETRY_DISABLED=1. CMD: npm run start (dev 금지).

## 2. 실제 원본 위치
erp/frontend/Dockerfile

## 3. 관련 형제 파일
- [[docker-compose.nas.yml.md|NAS 배포]]
- [[docker-compose.yml.md|개발 DB]]
