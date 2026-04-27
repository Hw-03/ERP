---
type: code-note
project: ERP
layer: frontend
source_path: frontend/tsconfig.json
status: active
updated: 2026-04-27
source_sha: b18b390217d2
tags:
  - erp
  - frontend
  - source-file
  - json
---

# tsconfig.json

> [!summary] 역할
> 원본 프로젝트의 `tsconfig.json` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `frontend/tsconfig.json`
- Layer: `frontend`
- Kind: `source-file`
- Size: `600` bytes

## 연결

- Parent hub: [[frontend/frontend|frontend]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
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
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "_archive", "**/_archive/**"]
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
