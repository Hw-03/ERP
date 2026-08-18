import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryKeys } from "@/lib/queries/keys";

const updateItemMock = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    updateItem: (...a: any[]) => updateItemMock(...a),
  },
}));

import { useAdminMasterItemsForm } from "../useAdminMasterItemsForm";

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function renderFormHook(
  args: Parameters<typeof useAdminMasterItemsForm>[0],
  client = makeClient(),
) {
  return renderHook(() => useAdminMasterItemsForm(args), { wrapper: makeWrapper(client) });
}

const I = (over: Partial<any> = {}): any => ({
  item_id: "1",
  item_name: "프로브",
  mes_code: "P-001",
  process_type_code: "TR",
  unit: "EA",
  model_slots: [],
  bom_stock_exempt: false,
  sales_review_required: false,
  ...over,
});

const baseArgs = (over: Partial<Parameters<typeof useAdminMasterItemsForm>[0]> = {}) => ({
  selectedItem: null,
  setSelectedItem: vi.fn(),
  setItems: vi.fn(),
  onStatusChange: vi.fn(),
  onError: vi.fn(),
  ...over,
});

describe("useAdminMasterItemsForm", () => {
  beforeEach(() => {
    updateItemMock.mockReset();
  });

  it("selectedItem null → 빈 form, dirty=false", () => {
    const { result } = renderFormHook(baseArgs());
    expect(result.current.form.item_name).toBe("");
    expect(result.current.dirty).toBe(false);
  });

  it("selectedItem 주어지면 form 자동 채워짐, dirty=false", () => {
    const item = I({ bom_stock_exempt: true, sales_review_required: true });
    const { result } = renderFormHook(baseArgs({ selectedItem: item }));
    expect(result.current.form.item_name).toBe("프로브");
    expect(result.current.form.mes_code).toBe("P-001");
    expect(result.current.form.bom_stock_exempt).toBe(true);
    expect(result.current.form.sales_review_required).toBe(true);
    expect(result.current.dirty).toBe(false);
  });

  it("setForm 호출 시 dirty=true", () => {
    const { result } = renderFormHook(baseArgs({ selectedItem: I() }));
    act(() => {
      result.current.setForm((f) => ({
        ...f,
        item_name: "변경됨",
        bom_stock_exempt: true,
        sales_review_required: true,
      }));
    });
    expect(result.current.dirty).toBe(true);
  });

  it("save — selectedItem 없으면 updateItem 호출 안 함", async () => {
    const { result } = renderFormHook(baseArgs());
    await act(async () => {
      await result.current.save();
    });
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it("save — 성공 시 setItems/setSelectedItem 호출 + dirty=false", async () => {
    const updated = I({ item_name: "변경됨" });
    updateItemMock.mockResolvedValue(updated);
    const args = baseArgs({ selectedItem: I() });
    const { result } = renderFormHook(args);
    act(() => {
      result.current.setForm((f) => ({
        ...f,
        item_name: "변경됨",
        bom_stock_exempt: true,
        sales_review_required: true,
      }));
    });
    expect(result.current.dirty).toBe(true);
    await act(async () => {
      await result.current.save();
    });
    await waitFor(() => expect(result.current.dirty).toBe(false));
    expect(args.setItems).toHaveBeenCalled();
    expect(args.setSelectedItem).toHaveBeenCalledWith(updated);
    expect(updateItemMock).toHaveBeenCalledWith("1", expect.objectContaining({
      bom_stock_exempt: true,
      sales_review_required: true,
    }));
  });

  it("save 성공 후 shared items query root를 무효화한다", async () => {
    const updated = I({ item_name: "Changed" });
    updateItemMock.mockResolvedValue(updated);
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const { result } = renderFormHook(baseArgs({ selectedItem: I() }), client);

    await act(async () => {
      await result.current.save();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.items.all });
  });
});
