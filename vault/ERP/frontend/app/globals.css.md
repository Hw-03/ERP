---
type: file-explanation
source_path: "frontend/app/globals.css"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# globals.css — globals.css 설명

## 이 파일은 무엇을 책임지나

`globals.css`는 스타일시트입니다. 프로젝트 구조 안에서 `frontend/app/globals.css` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/app/📁_app]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@keyframes statusFlash {
  from { opacity: 0.3; transform: translateY(-2px); }
  to   { opacity: 1;   transform: translateY(0);    }
}

@layer base {
  :root {
    /* === Light Theme (Default) === */
    --background: #f5f8fd;
    --foreground: #101a2b;
    --c-bg: #eff4fb;
    --c-s1: rgba(255, 255, 255, 0.92);
    --c-s2: rgba(244, 247, 252, 0.96);
    --c-s3: rgba(230, 236, 245, 0.96);
    --c-s4: rgba(214, 224, 237, 0.98);
    --c-border: rgba(76, 97, 130, 0.1);
    --c-border-strong: rgba(70, 122, 222, 0.22);
    --c-blue: #2f74e7;
    --c-green: #179f72;
    --c-red: #d95a5a;
    --c-yellow: #b98619;
    --c-purple: #6f59e8;
    --c-cyan: #078db0;
    --c-text: #101a2b;
    --c-muted: #72829a;
    --c-muted2: #56657e;
    --c-panel-glow: radial-gradient(circle at top right, rgba(47, 116, 231, 0.08), transparent 36%);
    --c-card-shadow: 0 24px 64px rgba(45, 70, 106, 0.12);
    --c-popup-bg: #ffffff;
    --c-popup-shadow: 0 12px 28px rgba(45, 70, 106, 0.16);
    --c-radius-xl: 32px;
    --c-radius-lg: 24px;
    --c-radius-md: 18px;
    --c-radius-sm: 14px;
    --c-radius-xs: 8px;
    --c-text-caption: 12px;
    --c-text-body: 14px;
    --c-text-title: 16px;
    --c-text-display: 20px;
    --c-action: var(--c-blue);
    --c-ok: var(--c-green);
    --c-warn: var(--c-yellow);
    --c-danger: var(--c-red);
    --pill-hover-mix: 14%;
    --pill-glow-strength: 0%;
    --pill-glow-blur: 0px;
    --pill-inset-ring: 0;
    --kpi-hover-mix: 18%;
    --kpi-glow-strength: 0%;
    --kpi-glow-blur: 0px;
    --sidebar-hover-mix: 18%;
```
