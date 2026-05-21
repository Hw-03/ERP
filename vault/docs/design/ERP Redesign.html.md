---
type: code-note
project: ERP
layer: docs
source_path: erp/docs/design/ERP Redesign.html
status: active
updated: 2026-04-27
source_sha: f283c599167d
tags:
  - erp
  - docs
  - documentation
  - html
---

# ERP Redesign.html

> [!summary] 역할
> 현재 개발/운영 판단에 필요한 원본 문서다. Obsidian에서는 이 노트를 통해 빠르게 찾는다.

## 원본 위치

- Source: `docs/design/ERP Redesign.html`
- Layer: `docs`
- Kind: `documentation`
- Size: `20674` bytes

## 연결

- Parent hub: [[docs/design/design|docs/design]]
- Related: [[docs/docs]]

## 읽는 포인트

- 원본 문서의 최신성은 실제 코드와 함께 검증한다.
- 품목코드 규칙은 `docs/ITEM_CODE_RULES.md`를 우선한다.

## 원본 발췌

> 전체 348줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````html
<!DOCTYPE html>
<html lang="ko" data-theme="dark">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>X-Ray ERP · Redesign Canvas</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable.min.css"/>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  html, body { background:#0D1629; color:#E6ECF5; font-family: Pretendard, system-ui, sans-serif; }
  .font-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace; }
  * { -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #263858; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #2A3A5E; }

/* ── Light mode theme overrides ── */
[data-theme="light"] {
  color-scheme: light;
}

/* Backgrounds */
[data-theme="light"] .bg-\[\#0D1629\] { background-color: #F0F4FA !important; }
[data-theme="light"] .bg-\[\#132240\] { background-color: #FFFFFF !important; }
[data-theme="light"] .bg-\[\#0E1A34\] { background-color: #F4F7FC !important; }
[data-theme="light"] .bg-\[\#0A1020\] { background-color: #F8FAFD !important; }
[data-theme="light"] .bg-\[\#152844\] { background-color: #EBF0FB !important; }
[data-theme="light"] .bg-\[\#172F4C\] { background-color: #DDEEFF !important; }
[data-theme="light"] .bg-\[\#0F2D2A\] { background-color: #CCFBF1 !important; }
[data-theme="light"] .bg-\[\#1A3434\] { background-color: #A7F3D0 !important; }
[data-theme="light"] .bg-\[\#182840\] { background-color: #EFF4FC !important; }
# ... (이하 185줄 생략. 원본 참조)

````
