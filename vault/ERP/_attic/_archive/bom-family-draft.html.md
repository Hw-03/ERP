---
type: file-explanation
source_path: "_attic/_archive/bom-family-draft.html"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# bom-family-draft.html — bom-family-draft.html 설명

## 이 파일은 무엇을 책임지나

`bom-family-draft.html`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/_attic/_archive/📁__archive]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BOM 가계도 초안</title>
  <style>
    :root {
      --bg: #e9e9e9;
      --paper: #ffffff;
      --blue: #4472c4;
      --blue-dark: #244a86;
      --line: #8aa4d6;
      --text: #152238;
      --muted: #697386;
      --assembly: #4472c4;
      --high: #e3b341;
      --vacuum: #8b65d8;
      --tube: #2d9eb3;
      --raw: #4472c4;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: "Segoe UI", "Malgun Gothic", Arial, sans-serif;
    }

    main {
      padding: 26px 28px;
    }

    .sheet {
      min-height: calc(100vh - 52px);
      border: 1px solid #c8c8c8;
      background: var(--paper);
      padding: 26px 28px 44px;
      overflow-x: auto;
    }

    header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
      min-width: 1120px;
      margin-bottom: 26px;
    }
```
