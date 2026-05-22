---
type: file-explanation
source_path: "frontend/app/legacy/_components/_hooks/__tests__/useChunkedRender.test.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useChunkedRender.test.tsx — useChunkedRender.test.tsx 설명

## 이 파일은 무엇을 책임지나

`useChunkedRender.test.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_hooks/__tests__/📁___tests__]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
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
    const items2 = Array.from({ length: 50 }, (_, i) => i + 1000);
    const { result, rerender } = renderHook(({ list }) => useChunkedRender(list, 20), {
      initialProps: { list: items1 },
    });
    expect(result.current.shown).toBe(20);
    rerender({ list: items2 });
    expect(result.current.shown).toBe(20);
    expect(result.current.visible[0]).toBe(1000);
  });
});
```
