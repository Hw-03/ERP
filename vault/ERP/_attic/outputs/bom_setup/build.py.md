---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/outputs/bom_setup/build.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# build.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/outputs/bom_setup/build.py]]

## 원본 첫 줄 (또는 메타)

```
import json, sys, os
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/ERP/outputs/bom_setup/items_compact.json', 'r', encoding='utf-8') as f:
    items_json = json.dumps(json.load(f), ensure_ascii=False, separators=(',', ':'))

with open('C:/ERP/outputs/bom_setup/bom.json', 'r', encoding='utf-8') as f:
    preset_bom_json = json.dumps(json.load(f), ensure_ascii=False, separators=(',', ':'))

html = '''<!DOCTYPE html>
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
```
