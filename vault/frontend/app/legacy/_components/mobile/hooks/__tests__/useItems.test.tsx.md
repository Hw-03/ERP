---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/mobile/hooks/__tests__/useItems.test.tsx
status: active
updated: 2026-04-27
source_sha: 0059ae52d0b9
tags:
  - erp
  - frontend
  - test
  - tsx
---

# useItems.test.tsx

> [!summary] 역할
> 현재 ERP 동작을 회귀 없이 유지하기 위한 자동 테스트 파일이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/hooks/__tests__/useItems.test.tsx`
- Layer: `frontend`
- Kind: `test`
- Size: `2881` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/hooks/__tests__/__tests__|frontend/app/legacy/_components/mobile/hooks/__tests__]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 기능 변경 후 같은 영역 테스트를 먼저 확인한다.
- 테스트가 문서보다 최신 동작을 더 정확히 말해줄 때가 많다.

## 원본 발췌

````tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

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
    // AbortError 면 loading 은 가드되어 그대로 둘 수 있음 — error 는 절대 set 되지 않아야
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.error).toBeNull();
# ... (이하 43줄 생략. 원본 참조)

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
