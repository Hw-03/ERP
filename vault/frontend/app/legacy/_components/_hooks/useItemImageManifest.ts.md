---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_hooks/useItemImageManifest.ts
tags: [vault, code-note, auto-generated, stub]
---

# useItemImageManifest.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_hooks/useItemImageManifest.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useEffect, useState } from "react";

/**
 * 품목 이미지 매니페스트 훅.
 *
 * /images/items/manifest.json 을 1회 로드해 { item_code: filename } 맵으로 보관한다.
 * Next.js 정적 파일이라 브라우저 캐시가 알아서 처리. 마운트 1회.
 */
export function useItemImageManifest() {
  const [manifest, setManifest] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    fetch("/images/items/manifest.json", { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (alive) setManifest(data ?? {});
      })
      .catch(() => {
        if (alive) setManifest({});
      });
    return () => {
      alive = false;
    };
  }, []);

  return manifest;
}
```
