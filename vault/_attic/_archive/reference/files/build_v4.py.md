---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/_archive/reference/files/build_v4.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# build_v4.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/_archive/reference/files/build_v4.py]]

## 원본 첫 줄 (또는 메타)

```
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
```
