---
type: file-explanation
source_path: "frontend/tailwind.config.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# tailwind.config.ts — tailwind.config.ts 설명

## 이 파일은 무엇을 책임지나

`tailwind.config.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/tailwind.config.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/📁_frontend]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // lib/ui (BottomSheet/ConfirmModal/Toast/Tooltip 등) 의 클래스도 스캔해야
    // z-[200]·rounded-t-[22px] 같은 arbitrary 유틸이 생성된다.
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // DEXCOWIN 산업용 테마 — Slate / Blue
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
        sans: ["var(--font-pretendard)", "Noto Sans KR", "system-ui", "sans-serif"],
        mono: ["var(--font-pretendard)", "Noto Sans KR", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-in-out",
        "view-fade": "viewFade 150ms ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        viewFade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
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
```
