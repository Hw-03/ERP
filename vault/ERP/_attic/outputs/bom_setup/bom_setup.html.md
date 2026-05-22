---
type: file-explanation
source_path: "_attic/outputs/bom_setup/bom_setup.html"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# bom_setup.html — bom_setup.html 설명

## 이 파일은 무엇을 책임지나

`bom_setup.html`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/_attic/outputs/bom_setup/📁_bom_setup]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BOM 세팅 도구 — DEXCOWIN MES</title>
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  <link href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --c-bg: #eff4fb; --c-s1: rgba(255,255,255,0.92); --c-s2: rgba(244,247,252,0.96);
      --c-border: rgba(0,0,0,0.07); --c-blue: #2f74e7; --c-green: #179f72;
      --c-red: #d95a5a; --c-yellow: #b98619; --c-text: #101a2b;
      --c-muted: #8a96a6; --c-muted2: #56657e;
    }
    html, body { height: 100%; font-family: Pretendard, "Noto Sans KR", system-ui, sans-serif;
      font-size: 15px; background: var(--c-bg); color: var(--c-text); line-height: 1.5;
      -webkit-font-smoothing: antialiased; }
    button { cursor: pointer; border: none; outline: none; background: none; font-family: inherit; font-size: inherit; }
    input { font-family: inherit; font-size: inherit; }
    input:focus { outline: none; }
    #app { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    .content-area { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
    .app-bar { height: 60px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
      padding: 0 20px; background: var(--c-s1); border-bottom: 1px solid var(--c-border); }
    .panel { background: var(--c-s2); border: 1px solid var(--c-border); border-radius: 28px; overflow: hidden; }
    .panel-header { padding: 12px 20px; border-bottom: 1px solid var(--c-border); flex-shrink: 0; }
    .panel-label { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.18em; color: var(--c-muted2); }
    .panel-sub { font-size: 13px; color: var(--c-muted2); margin-top: 2px; }
    .input { width: 100%; background: var(--c-s1); border: 1px solid var(--c-border); border-radius: 12px;
      padding: 10px 14px; font-size: 15px; color: var(--c-text); transition: border-color 120ms; }
    .input:focus { border-color: var(--c-blue); }
    .input::placeholder { color: var(--c-muted); }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      border-radius: 10px; padding: 9px 18px; font-size: 15px; font-weight: 600;
      transition: opacity 120ms; white-space: nowrap; }
    .btn:disabled { opacity: 0.45; cursor: default; }
    .btn-primary { background: var(--c-blue); color: #fff; }
    .btn-primary:hover:not(:disabled) { opacity: 0.88; }
    .btn-success { background: var(--c-green); color: #fff; }
    .btn-success:hover:not(:disabled) { opacity
...
```
