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
