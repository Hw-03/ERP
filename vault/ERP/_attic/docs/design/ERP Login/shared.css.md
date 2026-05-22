---
type: file-explanation
source_path: "_attic/docs/design/ERP Login/shared.css"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# shared.css — shared.css 설명

## 이 파일은 무엇을 책임지나

`shared.css`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/_attic/docs/design/ERP Login/📁_ERP Login]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```css
/* ===== Dexcowin MES — shared tokens ===== */
:root{
  --bg-0:#07090D;
  --bg-1:#0D1218;
  --bg-2:#121821;
  --bg-3:#1A2330;
  --line:rgba(255,255,255,0.06);
  --line-strong:rgba(255,255,255,0.12);
  --text-hi:#E8ECF2;
  --text:#B8C0CC;
  --text-dim:#6B7280;
  --text-faint:#3D4550;
  --brand:#2E6DB4;
  --brand-hi:#4A8BD4;
  --brand-dim:#1F4A7E;
  --brand-glow:rgba(46,109,180,0.35);
  --red:#E63946;
  --ok:#3FB950;
  --warn:#D29922;
  --font-ui:'Inter', -apple-system, system-ui, sans-serif;
  --font-mono:'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
}

*{box-sizing:border-box}

/* letter-pixel crispness */
.px{image-rendering:-webkit-optimize-contrast;image-rendering:crisp-edges}

/* ==== inputs / buttons shared ==== */
.dx-field{
  position:relative;
  display:flex;flex-direction:column;gap:8px;
}
.dx-label{
  font-family:var(--font-mono);
  font-size:10px;letter-spacing:0.12em;text-transform:uppercase;
  color:var(--text-dim);
  display:flex;justify-content:space-between;align-items:center;
}
.dx-label .req{color:var(--brand-hi)}
.dx-input-wrap{
  position:relative;
  background:var(--bg-1);
  border:1px solid var(--line);
  transition:border-color .15s ease, background .15s ease;
}
.dx-input-wrap:focus-within{
  border-color:var(--brand);
  background:#0B1017;
  box-shadow:0 0 0 1px var(--brand-dim) inset;
}
.dx-input{
  width:100%;
  background:transparent;
  border:0;outline:0;
```
