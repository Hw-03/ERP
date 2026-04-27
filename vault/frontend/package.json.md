---
type: code-note
project: ERP
layer: frontend
source_path: frontend/package.json
status: active
updated: 2026-04-27
source_sha: eef367fef580
tags:
  - erp
  - frontend
  - source-file
  - json
---

# package.json

> [!summary] 역할
> 원본 프로젝트의 `package.json` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `frontend/package.json`
- Layer: `frontend`
- Kind: `source-file`
- Size: `1089` bytes

## 연결

- Parent hub: [[frontend/frontend|frontend]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````json
{
  "name": "xray-erp-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "node scripts/dev.js",
    "dev:raw": "next dev --hostname 0.0.0.0",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@zxing/browser": "^0.1.5",
    "clsx": "^2.1.1",
    "lucide-react": "^0.378.0",
    "next": "14.2.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^3.8.1",
    "swr": "^2.2.5"
  },
  "devDependencies": {
    "@testing-library/dom": "^10.4.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^20.12.12",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.19",
    "eslint": "^8.57.0",
    "eslint-config-next": "14.2.3",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.5",
    "vitest": "^2.1.8"
  }
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
