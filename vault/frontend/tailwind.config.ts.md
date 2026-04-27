---
type: code-note
project: ERP
layer: frontend
source_path: frontend/tailwind.config.ts
status: active
updated: 2026-04-27
source_sha: 8cee352f5416
tags:
  - erp
  - frontend
  - source-file
  - ts
---

# tailwind.config.ts

> [!summary] 역할
> 원본 프로젝트의 `tailwind.config.ts` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `frontend/tailwind.config.ts`
- Layer: `frontend`
- Kind: `source-file`
- Size: `1383` bytes

## 연결

- Parent hub: [[frontend/frontend|frontend]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // X-ray ERP 산업용 테마 — Slate / Blue
        brand: {
          50:  "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
      },
      fontFamily: {
        sans: ["Pretendard", "Noto Sans KR", "system-ui", "sans-serif"],
        mono: ["Pretendard", "Noto Sans KR", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-in-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scan: {
          "0%":   { top: "8px" },
          "50%":  { top: "calc(100% - 8px)" },
          "100%": { top: "8px" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
