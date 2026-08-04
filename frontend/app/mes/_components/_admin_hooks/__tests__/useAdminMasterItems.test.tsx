import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { useAdminMasterItems } from "../useAdminMasterItems";

function item(name: string): Item {
  return {
    item_id: "item-1",
    item_name: name,
    mes_code: "A-001",
    process_type_code: "AA",
    unit: "EA",
  } as Item;
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAdminMasterItems refreshed item synchronization", () => {
  it("adopts a same-id server item only while the edit form is clean", async () => {
    const initial = item("Initial name");
    const refreshed = item("Server name");
    const ignoredWhileDirty = item("Later server name");
    const args = {
      setItems: vi.fn(),
      globalSearch: "",
      onStatusChange: vi.fn(),
      onError: vi.fn(),
      adminPin: "1234",
      productModels: [],
    };
    const { result, rerender } = renderHook(
      ({ items }: { items: Item[] }) => useAdminMasterItems({ ...args, items }),
      { initialProps: { items: [initial] }, wrapper },
    );

    act(() => result.current.setSelectedItem(initial));
    expect(result.current.editForm.item_name).toBe("Initial name");

    rerender({ items: [refreshed] });
    await waitFor(() => {
      expect(result.current.selectedItem).toBe(refreshed);
      expect(result.current.editForm.item_name).toBe("Server name");
    });

    act(() => {
      result.current.setEditForm((current) => ({ ...current, item_name: "Unsaved draft" }));
    });
    expect(result.current.dirty).toBe(true);

    rerender({ items: [ignoredWhileDirty] });
    expect(result.current.selectedItem).toBe(refreshed);
    expect(result.current.editForm.item_name).toBe("Unsaved draft");
  });
});
