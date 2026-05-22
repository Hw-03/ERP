---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/hooks/__tests__/useTransactions.test.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useTransactions.test.tsx — useTransactions.test.tsx 설명

## 이 파일은 무엇을 책임지나

`useTransactions.test.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

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
    expect(result.current.hasMore).toBe(true);
  });

  it("결과 < page size → hasMore=false", async () => {
    (api.getTransactions as any).mockResolvedValue(makeLogs(20));
    const { result } = renderHook(() => useTransactions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(false);
  });

  it("에러 시 error state", async () => {
    (api.getTransactions as any).mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useTransactions());
    await waitFor(() => expect(result.current.error).toBe("network"));
  });
});
```
