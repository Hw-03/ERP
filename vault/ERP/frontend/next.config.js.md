---
layer: config
---

# next.config.js — Next.js 설정

> [!summary] dev/.next vs prod/.next-prod 분리. /api/* rewrite → BACKEND_INTERNAL_URL

## 1. 역할
개발/빌드 distDir 분리(충돌 방지). eslint dirs (app, lib, features, components). API rewrite(기본 localhost:8010).

## 2. 실제 원본 위치
erp/frontend/next.config.js

## 3. 관련 형제 파일
- [[tsconfig.json.md|TypeScript 설정]]
- [[package.json.md|패키지 매니페스트]]
