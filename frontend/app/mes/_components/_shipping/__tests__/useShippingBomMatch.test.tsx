import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShippingBomMatchResponse } from "@/lib/api";
import {
  shippingBomMatchFingerprint,
  shippingRequestDraftFingerprint,
  useShippingBomMatch,
} from "../useShippingBomMatch";

vi.mock("@/lib/api", () => ({
  api: {
    matchShippingBom: vi.fn(),
  },
}));

import { api } from "@/lib/api";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function matchResult(name: string): ShippingBomMatchResponse {
  return {
    matched_pa_item_id: null,
    matched_pf_item_id: null,
    matched_pa_item_name: name,
    matched_pf_item_name: null,
    requires_pa_name: false,
    requires_pf_name: false,
    preview_pa_mes_code: null,
    preview_pf_mes_code: null,
  };
}

const firstPayload = {
  base_pf_item_id: "pf-1",
  bom_lines: [{
    parent_stage: "PA" as const,
    child_item_id: "af-1",
    quantity: 1,
    unit: "EA",
    included: true,
    origin: "DEFAULT" as const,
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useShippingBomMatch", () => {
  it("aborts the older match and only accepts the latest payload generation", async () => {
    const first = deferred<ShippingBomMatchResponse>();
    const second = deferred<ShippingBomMatchResponse>();
    vi.mocked(api.matchShippingBom)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useShippingBomMatch());

    let firstRun!: ReturnType<typeof result.current.run>;
    let secondRun!: ReturnType<typeof result.current.run>;
    act(() => {
      firstRun = result.current.run(firstPayload);
      secondRun = result.current.run({
        ...firstPayload,
        bom_lines: [{ ...firstPayload.bom_lines[0], quantity: 2 }],
      });
    });

    const firstSignal = vi.mocked(api.matchShippingBom).mock.calls[0][1]?.signal;
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => {
      second.resolve(matchResult("latest"));
    });
    await expect(secondRun).resolves.toMatchObject({
      status: "success",
      result: { matched_pa_item_name: "latest" },
    });

    await act(async () => {
      first.resolve(matchResult("stale"));
    });
    await expect(firstRun).resolves.toMatchObject({ status: "aborted" });
  });

  it("aborts the active match when its owner unmounts", () => {
    vi.mocked(api.matchShippingBom).mockReturnValue(new Promise(() => {}));
    const { result, unmount } = renderHook(() => useShippingBomMatch());

    act(() => {
      void result.current.run(firstPayload);
    });
    const signal = vi.mocked(api.matchShippingBom).mock.calls[0][1]?.signal;

    unmount();

    expect(signal?.aborted).toBe(true);
  });
});

describe("shipping fingerprints", () => {
  it("changes when the editable BOM payload changes inside the same draft", () => {
    const first = shippingBomMatchFingerprint(firstPayload);
    const changed = shippingBomMatchFingerprint({
      ...firstPayload,
      bom_lines: [{ ...firstPayload.bom_lines[0], quantity: 2 }],
    });

    expect(changed).not.toBe(first);
  });

  it("treats reordered editable lines as the same persisted payload", () => {
    const common = {
      base_pf_item_id: "pf-1",
      request_quantity: 1,
      requested_by_name: "출하 담당",
      notes: "메모",
      finalization_mode: "KEEP_BASE" as const,
    };
    const lines = [
      { ...firstPayload.bom_lines[0], child_item_id: "af-1" },
      { ...firstPayload.bom_lines[0], child_item_id: "acc-1", quantity: 2 },
    ];

    expect(shippingRequestDraftFingerprint({ ...common, bom_lines: lines })).toBe(
      shippingRequestDraftFingerprint({ ...common, bom_lines: [...lines].reverse() }),
    );
  });

  it("normalizes optional text and default values before comparing a save baseline", () => {
    expect(shippingRequestDraftFingerprint({
      base_pf_item_id: "pf-1",
      request_quantity: 1,
      requested_by_name: " 출하 담당 ",
      notes: " ",
      bom_lines: [],
      companion_lines: [],
    })).toBe(shippingRequestDraftFingerprint({
      base_pf_item_id: "pf-1",
      requested_by_name: "출하 담당",
      notes: null,
      finalization_mode: "KEEP_BASE",
    }));
  });
});
