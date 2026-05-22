---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/hooks/__tests__/useItems.test.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useItems.test.tsx — useItems.test.tsx 설명

## 이 파일은 무엇을 책임지나

`useItems.test.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/hooks/__tests__/📁___tests__]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// api 모킹 — useItems 가 부르는 api.getItems 만 가로챈다
vi.mock("@/lib/api", () => ({
  api: {
    getItems: vi.fn(),
  },
}));

import { api } from "@/lib/api";
import { useItems } from "../useItems";

describe("useItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("초기 fetch 결과를 반영", async () => {
    (api.getItems as any).mockResolvedValue([{ item_id: "1", item_name: "A" }]);
    const { result } = renderHook(() => useItems({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([{ item_id: "1", item_name: "A" }]);
    expect(result.current.error).toBeNull();
  });

  it("AbortError 는 error state 로 노출하지 않음", async () => {
    const abortErr = new Error("aborted");
    (abortErr as any).name = "AbortError";
    (api.getItems as any).mockRejectedValue(abortErr);

    const { result } = renderHook(() => useItems({}));
    // AbortError 면 loading 은 가드되어 그대로 둘 수 있음. waitFor 로 hook update 를 act 안에서 비운다.
    await waitFor(() => expect(api.getItems).toHaveBeenCalledTimes(1));
    expect(result.current.error).toBeNull();
  });

  it("일반 에러는 error state 로 노출", async () => {
    (api.getItems as any).mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useItems({}));
    await waitFor(() => expect(result.current.error).toBe("network down"));
  });

  it("빠른 필터 변경 시 마지막 결과만 반영", async () => {
    let resolveFirst: (v: any) => void = () => {};
    const firstPromise = new Promise((res) => {
      resolveFirst = res;
    });
    (api.getItems as any)
      .mockImplementationOnce((_p: any, opts: any) => {
        // 첫 호출: signal.aborted 가 true 가 되도록 설계됨
        return new Promise((_, rej) => {
          opts?.signal?.addEventListener?.("abort", () => {
            const err = new Error("aborted");
            (err as any).name = "AbortError";
```
