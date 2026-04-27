---
type: code-note
project: ERP
layer: github
source_path: .github/workflows/ci.yml
status: active
updated: 2026-04-27
source_sha: c7739788ed4c
tags:
  - erp
  - github
  - ci-workflow
  - yml
---

# ci.yml

> [!summary] 역할
> GitHub Actions에서 백엔드/프론트엔드 검증을 자동으로 돌리는 CI 설정이다.

## 원본 위치

- Source: `.github/workflows/ci.yml`
- Layer: `github`
- Kind: `ci-workflow`
- Size: `1526` bytes

## 연결

- Parent hub: [[.github/workflows/workflows|.github/workflows]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````yaml
name: CI

on:
  push:
    branches: [main, "feat/**", "fix/**", "refactor/**"]
  pull_request:
    branches: [main]

# 같은 브랜치에서 새 push 가 들어오면 이전 실행은 취소
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  backend:
    name: Backend (pytest + compile)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: "pip"
          cache-dependency-path: backend/requirements.txt

      - name: Install dependencies
        working-directory: backend
        run: pip install -r requirements.txt

      - name: Compile check
        run: python -m compileall backend

      - name: Run pytest
        working-directory: backend
        run: pytest -q

  frontend:
    name: Frontend (lint + tsc + vitest)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        working-directory: frontend
        run: npm ci

      - name: Lint
        working-directory: frontend
        run: npm run lint

      - name: Type check
        working-directory: frontend
        run: npx tsc --noEmit

      - name: Vitest
        working-directory: frontend
        run: npm test
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
