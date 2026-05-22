---
type: file-explanation
source_path: "frontend/package.json"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# package.json — package.json 설명

## 이 파일은 무엇을 책임지나

`package.json`는 JSON 설정/데이터입니다. 프로젝트 구조 안에서 `frontend/package.json` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

JSON 최상위 키:

- `name`
- `version`
- `private`
- `scripts`
- `dependencies`
- `devDependencies`

## 연결되는 파일

- [[ERP/frontend/📁_frontend]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```json
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
    "lint:strict": "next lint --max-warnings=0",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "check:bundle-size": "node scripts/check-bundle-size.mjs"
  },
  "dependencies": {
    "@zxing/browser": "^0.1.5",
    "axe-playwright": "^2.2.2",
    "clsx": "^2.1.1",
    "lucide-react": "^0.378.0",
    "next": "14.2.3",
    "playwright": "^1.60.0",
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
    "@vitest/coverage-v8": "^2.1.9",
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
```
