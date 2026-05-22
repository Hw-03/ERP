---
type: file-explanation
source_path: "frontend/tsconfig.json"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# tsconfig.json — tsconfig.json 설명

## 이 파일은 무엇을 책임지나

`tsconfig.json`는 JSON 설정/데이터입니다. 프로젝트 구조 안에서 `frontend/tsconfig.json` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

JSON 최상위 키:

- `compilerOptions`
- `include`
- `exclude`

## 연결되는 파일

- [[ERP/frontend/📁_frontend]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```json
{
  "compilerOptions": {
    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": [
        "./*"
      ]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next-prod/types/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "_archive",
    "**/_archive/**",
    "**/__tests__/**",
    "**/*.test.ts",
    "**/*.test.tsx"
  ]
}
```
