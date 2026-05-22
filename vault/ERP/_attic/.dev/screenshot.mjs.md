---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/.dev/screenshot.mjs
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# screenshot.mjs

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/.dev/screenshot.mjs]]

## 원본 첫 줄 (또는 메타)

```
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'fs';

const BASE = 'http://localhost:3000';
// MODE=light|dark (기본 light). dark 재생성 시 MODE=dark 로 실행.
const MODE = (process.env.MODE || 'light').toLowerCase();
const OUT = `C:/ERP/.dev/screenshots/${MODE}`;

// 해당 모드 폴더만 비우고 재생성 (다른 모드는 보존)
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 라이트 모드: 페이지 로딩 전 localStorage + data-theme 을 세팅
async function applyTheme(ctx) {
  if (MODE === 'light') {
    await ctx.addInitScript(() => {
      try { localStorage.setItem('theme', 'light'); } catch {}
      const setAttr = () => document.documentElement?.setAttribute('data-theme', 'light');
      setAttr();
      document.addEventListener('DOMContentLoaded', setAttr);
    });
  }
}

async function shot(page, name) {
```
