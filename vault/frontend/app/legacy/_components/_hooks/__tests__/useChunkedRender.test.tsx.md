---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_hooks/__tests__/useChunkedRender.test.tsx
tags: [vault, code-note, auto-generated, stub]
---

# useChunkedRender.test.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_hooks/__tests__/useChunkedRender.test.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useChunkedRender } from "../useChunkedRender";

describe("useChunkedRender", () => {
  it("기본 chunkSize 50 — 첫 50개만 visible", () => {
    const items = Array.from({ length: 200 }, (_, i) => i);
    const { result } = renderHook(() => useChunkedRender(items));
    expect(result.current.visible).toHaveLength(50);
    expect(result.current.shown).toBe(50);
    expect(result.current.total).toBe(200);
    expect(result.current.hasMore).toBe(true);
  });

  it("items 길이 ≤ chunkSize → 전부 visible, hasMore=false", () => {
    const items = [1, 2, 3];
    const { result } = renderHook(() => useChunkedRender(items, 50));
    expect(result.current.visible).toEqual([1, 2, 3]);
    expect(result.current.hasMore).toBe(false);
  });

  it("커스텀 chunkSize 적용", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const { result } = renderHook(() => useChunkedRender(items, 10));
    expect(result.current.visible).toHaveLength(10);
    expect(result.current.hasMore).toBe(true);
  });

  it("items 변경 시 첫 chunk 로 리셋", () => {
    const items1 = Array.from({ length: 100 }, (_, i) => i);
```
