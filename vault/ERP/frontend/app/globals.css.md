---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/globals.css
status: active
updated: 2026-04-27
source_sha: ab7160069fb6
tags:
  - erp
  - frontend
  - source-file
  - css
---

# globals.css

> [!summary] 역할
> 원본 프로젝트의 `globals.css` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `frontend/app/globals.css`
- Layer: `frontend`
- Kind: `source-file`
- Size: `4541` bytes

## 연결

- Parent hub: [[frontend/app/app|frontend/app]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: #08111f;
    --foreground: #edf2fb;
    --c-bg: #07101d;
    --c-s1: rgba(11, 21, 36, 0.92);
    --c-s2: rgba(18, 31, 51, 0.92);
    --c-s3: rgba(28, 44, 68, 0.9);
    --c-s4: rgba(39, 58, 87, 0.88);
    --c-border: rgba(165, 190, 220, 0.12);
    --c-border-strong: rgba(149, 197, 255, 0.28);
    --c-blue: #65a9ff;
    --c-green: #43d39d;
    --c-red: #ff7b7b;
    --c-yellow: #f6c667;
    --c-purple: #8e7dff;
    --c-cyan: #4ec9f5;
    --c-text: #edf2fb;
    --c-muted: #72829a;
    --c-muted2: #9badc7;
    --c-panel-glow: radial-gradient(circle at top right, rgba(101, 169, 255, 0.16), transparent 32%);
    --c-card-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
    --c-radius-xl: 32px;
    --c-radius-lg: 24px;
    --c-radius-md: 18px;
    --c-radius-sm: 14px;
    --c-radius-xs: 8px;
    --c-text-caption: 12px;
    --c-text-body: 14px;
    --c-text-title: 16px;
    --c-text-display: 20px;
# ... (이하 135줄 생략. 원본 참조)

````
