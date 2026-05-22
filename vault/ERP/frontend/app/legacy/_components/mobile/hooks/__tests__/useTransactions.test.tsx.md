---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/hooks/__tests__/useTransactions.test.tsx
tags: [vault, code-note, auto-generated, stub]
---

# useTransactions.test.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/mobile/hooks/__tests__/useTransactions.test.tsx]]

## 원본 첫 줄

```
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: { getTransactions: vi.fn() },
}));

import { api } from "@/lib/api";
import { useTransactions } from "../useTransactions";

function makeLogs(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    log_id: `l${i}`,
    item_id: "i1",
    quantity_change: 1,
    transaction_type: "RECEIVE",
    created_at: "2026-01-01T00:00:00Z",
  }));
}

describe("useTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("초기 refetch 결과 반영 + hasMore 판정", async () => {
    (api.getTransactions as any).mockResolvedValue(makeLogs(100));
    const { result } = renderHook(() => useTransactions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toHaveLength(100);
```
