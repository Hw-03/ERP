---
type: code-note
project: ERP
layer: docs
source_path: erp/docs/design/ui.jsx
status: active
updated: 2026-04-27
source_sha: afdfcaad38be
tags:
  - erp
  - docs
  - documentation
  - jsx
---

# ui.jsx

> [!summary] 역할
> 현재 개발/운영 판단에 필요한 원본 문서다. Obsidian에서는 이 노트를 통해 빠르게 찾는다.

## 원본 위치

- Source: `docs/design/ui.jsx`
- Layer: `docs`
- Kind: `documentation`
- Size: `13596` bytes

## 연결

- Parent hub: [[docs/design/design|docs/design]]
- Related: [[docs/docs]]

## 읽는 포인트

- 원본 문서의 최신성은 실제 코드와 함께 검증한다.
- 품목코드 규칙은 `docs/ITEM_CODE_RULES.md`를 우선한다.

## 원본 발췌

> 전체 234줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````jsx
/* Shared primitives + tokens for the X-Ray ERP mockups.
   All components are attached to window so other Babel scripts can use them. */

const TOKENS = {
  bg: "#0D1629",
  bg2: "#132240",
  surface: "#152240",
  surface2: "#16213D",
  line: "#263858",
  lineSoft: "#17213B",
  text: "#E6ECF5",
  textMuted: "#8A97B3",
  textFaint: "#5A6785",
  accent: "#3BC5B4",      // calm teal
  accentDim: "#1F5E58",
  amber: "#E0A63C",
  rose: "#E5576E",
  emerald: "#4FB37A",
};

/* ---------- Icon set (tiny, 1.5 stroke) ---------- */
const Ic = {
  Box: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M3 7.5 12 3l9 4.5M3 7.5v9L12 21l9-4.5v-9M3 7.5 12 12m9-4.5L12 12m0 9v-9"/></svg>,
  Warehouse: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M3 10 12 4l9 6v10H3V10Z"/><path d="M7 20v-7h10v7M10 20v-4h4v4"/></svg>,
  History: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2"/></svg>,
  Tool: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M4 20 14 10M4 20l-1-3 3 1M14 10a4 4 0 1 1 4-4 2 2 0 0 0 2 2 4 4 0 1 1-4 4 2 2 0 0 0-2-2Z"/></svg>,
  Search: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  Plus: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M12 5v14M5 12h14"/></svg>,
  Minus: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M5 12h14"/></svg>,
  Refresh: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>,
  Chevron: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="m9 6 6 6-6 6"/></svg>,
  ChevronDown: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="m6 9 6 6 6-6"/></svg>,
  Up: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="m6 15 6-6 6 6"/></svg>,
  Filter: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M4 5h16l-6 8v6l-4-2v-4L4 5Z"/></svg>,
  Close: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M6 6l12 12M18 6 6 18"/></svg>,
# ... (이하 185줄 생략. 원본 참조)

````
