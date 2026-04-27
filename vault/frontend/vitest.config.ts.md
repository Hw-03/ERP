---
type: code-note
project: ERP
layer: frontend
source_path: frontend/vitest.config.ts
status: active
updated: 2026-04-27
source_sha: 97a45066b101
tags:
  - erp
  - frontend
  - source-file
  - ts
---

# vitest.config.ts

> [!summary] 역할
> 원본 프로젝트의 `vitest.config.ts` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `frontend/vitest.config.ts`
- Layer: `frontend`
- Kind: `source-file`
- Size: `433` bytes

## 연결

- Parent hub: [[frontend/frontend|frontend]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["app/**/*.test.{ts,tsx}", "lib/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
