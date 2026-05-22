---
type: file-explanation
source_path: "_attic/_archive/reference/files/build_v4.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# build_v4.py — build_v4.py 설명

## 이 파일은 무엇을 책임지나

`build_v4.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/_attic/_archive/reference/files/📁_files]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
import json, re, subprocess, tempfile, os


HTML_BODY = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>재고관리</title>
<style>
:root{
  --bg:#080a10;--s1:#10121a;--s2:#181b26;--s3:#1f2333;
  --bd:rgba(255,255,255,.07);
  --blue:#4f8ef7;--green:#1fd17a;--red:#f25f5c;
  --yellow:#f4b942;--purple:#9b72f8;--cyan:#06b6d4;
  --text:#eef0f8;--muted:#5a5f75;--muted2:#8890aa;
  --mono:Menlo,'Courier New',monospace;
  --sat:env(safe-area-inset-top,44px);
  --sab:env(safe-area-inset-bottom,34px);
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{width:100%;height:100%;overflow:hidden;background:#000;color:var(--text);font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased}
#wrap{display:flex;flex-direction:column;height:100%;background:var(--bg)}#sbg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;align-items:flex-end}
#sbg.on{display:flex}
@media(min-width:431px){html,body{background:#000}body{display:flex;justify-content:center;align-items:stretch}#wrap{width:430px;max-width:430px;flex-shrink:0;position:relative;...

#safe{height:var(--sat);background:var(--s1);flex-shrink:0}
#top{background:var(--s1);border-bottom:1px solid var(--bd);padding:10px 18px 12px;flex-shrink:0}
#top-sub{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted2);margin-bottom:3px}
#top-ttl{font-size:24px;font-weight:900}
#scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px}
#scroll::-webkit-scrollbar{display:none}
#io-bottom,#dio-bottom{padding:10px 14px 6px;background:var(--s1);border-top:1px solid var(--bd);flex-shrink:0}
#nav{height:calc(58px + var(--sab));background:var(--s1);border-top:1px solid var(--bd);display:flex;padding-top:6px;flex-shrink:0}
.tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;border:none;background:none;cursor:pointer;padding:4px 2px}
.ti{font-size:20px}.tl{font-size:9px;font-weight:700;color:var(--muted)}.td{width:4px;height:4px;border-radius:50%;background:var(--blue);opacity:0}
.tab.on .tl{color:var(--blue)}.tab.on .td{opacity:1}
.pg{animation:fu .18s ease}@keyframes fu{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.pad{height:16px}
.card{background:var(--s1);border:1px solid var(--bd);border-radius:14px;overflow:hidden;margin-bottom:12px}
.row{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--bd);cursor:pointer;-webkit-user-selec
...
```
