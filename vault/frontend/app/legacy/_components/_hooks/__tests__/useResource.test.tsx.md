---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_hooks/__tests__/useResource.test.tsx
status: active
updated: 2026-04-27
source_sha: 3548fa88f5d7
tags:
  - erp
  - frontend
  - test
  - tsx
---

# useResource.test.tsx

> [!summary] 역할
> 현재 ERP 동작을 회귀 없이 유지하기 위한 자동 테스트 파일이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_hooks/__tests__/useResource.test.tsx`
- Layer: `frontend`
- Kind: `test`
- Size: `1832` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_hooks/__tests__/__tests__|frontend/app/legacy/_components/_hooks/__tests__]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 기능 변경 후 같은 영역 테스트를 먼저 확인한다.
- 테스트가 문서보다 최신 동작을 더 정확히 말해줄 때가 많다.

## 원본 발췌

````tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useResource } from "../useResource";

describe("useResource", () => {
  it("초기 loading=true, data=undefined", () => {
    const fetcher = vi.fn(() => new Promise(() => {})); // never resolve
    const { result } = renderHook(() => useResource(fetcher, []));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it("성공 시 data 셋, loading=false", async () => {
    const fetcher = vi.fn().mockResolvedValue({ count: 42 });
    const { result } = renderHook(() => useResource(fetcher, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ count: 42 });
    expect(result.current.error).toBeNull();
  });

  it("실패 시 error 셋", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useResource(fetcher, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("network down");
    expect(result.current.data).toBeUndefined();
  });

  it("reload() 호출 시 fetcher 재실행", async () => {
    const fetcher = vi.fn().mockResolvedValue({ v: 1 });
    const { result } = renderHook(() => useResource(fetcher, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetcher).toHaveBeenCalledTimes(1);

    fetcher.mockResolvedValueOnce({ v: 2 });
    await act(async () => {
      await result.current.reload();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ v: 2 });
  });
});
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
