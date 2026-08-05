import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, type BOMEntry, type Item } from "@/lib/api";
import { BomWorkbench } from "../BomWorkbench";

const realtime = vi.hoisted(() => ({ revision: null as number | null }));

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => realtime.revision,
}));

function closestWithClass(element: HTMLElement, className: string): HTMLElement {
  let current: HTMLElement | null = element;
  while (current && !current.classList.contains(className)) current = current.parentElement;
  if (!current) throw new Error(`Missing ancestor with ${className}`);
  return current;
}

const selectedParent = {
  item_id: "parent-1",
  item_name: "Selected parent summary",
  mes_code: "PARENT-001",
  process_type_code: "AA",
  bom_completed_at: null,
} as Item;

describe("BomWorkbench", () => {
  beforeEach(() => {
    realtime.revision = null;
    window.history.replaceState({}, "", "/mes?tab=admin");
  });

  it("constrains the workbench and parent column while preserving the parent-list scroll region", () => {
    const { container } = render(
      <BomWorkbench
        items={[]}
        allBomRows={[]}
        refreshAllBom={() => undefined}
        refreshItems={async () => undefined}
        onStatusChange={() => undefined}
        onError={() => undefined}
      />,
    );

    const root = container.firstElementChild as HTMLDivElement;
    expect(root).toHaveClass("flex", "flex-1", "min-h-0", "flex-col");

    const threeColumnLayout = Array.from(container.querySelectorAll<HTMLDivElement>("div")).find(
      (element) => element.style.gridTemplateColumns === "minmax(280px, 1fr) minmax(340px, 1fr) minmax(340px, 1fr)",
    );
    expect(threeColumnLayout).toBeDefined();

    const parentScrollRegion = Array.from(container.querySelectorAll<HTMLElement>("div")).find(
      (element) => element.classList.contains("overflow-y-auto"),
    );
    expect(parentScrollRegion).toBeDefined();
    expect(parentScrollRegion).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");

    const parentListCard = closestWithClass(parentScrollRegion!, "rounded-2xl");
    expect(parentListCard.parentElement).toHaveClass("flex", "flex-1", "min-h-0", "flex-col");
  });

  it("removes duplicate export and expands the mode controls into its space", async () => {
    render(
      <BomWorkbench
        items={[selectedParent]}
        allBomRows={[]}
        refreshAllBom={() => undefined}
        refreshItems={async () => undefined}
        onStatusChange={() => undefined}
        onError={() => undefined}
      />,
    );

    const departmentFilters = screen.getByTestId("bom-department-filters");
    expect(departmentFilters).toHaveClass("min-h-[58px]", "flex-wrap");
    for (const filter of departmentFilters.querySelectorAll("button")) {
      expect(filter).toHaveClass("h-11");
    }

    expect(screen.queryByRole("button", { name: "BOM 내보내기" })).not.toBeInTheDocument();
    const modeControls = screen.getByRole("group", { name: "BOM 보기 방식" });
    expect(modeControls).toHaveClass("h-11", "w-[168px]");
    expect(screen.getByRole("button", { name: "편집" })).toHaveClass("h-11", "min-w-[82px]");
    expect(screen.getByRole("button", { name: "사용처" })).toHaveClass("h-11", "min-w-[82px]");

    const departmentWrapper = departmentFilters.parentElement!;
    expect(departmentWrapper).toHaveClass("min-w-0", "max-w-full");
    expect(departmentWrapper).not.toHaveClass("shrink-0");

    const summary = (await screen.findAllByText("Selected parent summary")).find((element) =>
      element.classList.contains("text-base"),
    )!;
    const summaryCard = summary.closest(".rounded-2xl")!;
    expect(summaryCard).toHaveClass("min-w-0", "flex-1");
    expect(departmentWrapper.nextElementSibling).toBe(summaryCard);
  });
  it("reloads selected BOM data on revision without clearing an edited row quantity draft", async () => {
    const row = {
      bom_id: "bom-1",
      parent_item_id: "parent-1",
      child_item_id: "child-1",
      quantity: 2,
      unit: "EA",
    } as BOMEntry;
    const getBom = vi.spyOn(api, "getBOM").mockResolvedValue([row]);
    const getWhereUsed = vi.spyOn(api, "getBOMWhereUsed").mockResolvedValue([]);
    const child = {
      item_id: "child-1",
      item_name: "Draft child",
      mes_code: "CHILD-001",
      process_type_code: "AR",
      unit: "EA",
    } as Item;
    const props = {
      items: [selectedParent, child],
      allBomRows: [],
      refreshAllBom: () => undefined,
      refreshItems: async () => undefined,
      onStatusChange: () => undefined,
      onError: () => undefined,
    };
    const { container, rerender } = render(<BomWorkbench {...props} />);

    await waitFor(() => {
      expect(getBom).toHaveBeenCalledTimes(1);
      expect(getWhereUsed).toHaveBeenCalledTimes(1);
    });
    const currentRow = container.querySelector("div[data-bom-row-surface]")!;
    fireEvent.click(currentRow.querySelector("button")!);
    const quantity = currentRow.querySelector("input[type=number]") as HTMLInputElement;
    fireEvent.change(quantity, { target: { value: "7" } });
    expect(quantity).toHaveValue(7);

    realtime.revision = 1;
    rerender(<BomWorkbench {...props} />);

    await waitFor(() => {
      expect(getBom).toHaveBeenCalledTimes(2);
      expect(getWhereUsed).toHaveBeenCalledTimes(2);
    });
    expect(currentRow.querySelector("input[type=number]")).toHaveValue(7);
  });

  it("stores only stable user navigation states and preserves other history namespaces", async () => {
    const highParent = {
      ...selectedParent,
      item_id: "high-parent",
      item_name: "High parent",
      mes_code: "HIGH-001",
      process_type_code: "HA",
    } as Item;
    vi.spyOn(api, "getBOM").mockResolvedValue([]);
    vi.spyOn(api, "getBOMWhereUsed").mockImplementation(async (itemId) => itemId === "high-parent" ? [{
      bom_id: "where-used-1",
      parent_item_id: "high-parent",
      parent_item_name: "High parent",
      parent_mes_code: "HIGH-001",
      child_item_id: "high-parent",
      child_item_name: "High parent",
      child_mes_code: "HIGH-001",
      quantity: 1,
      unit: "EA",
      notes: null,
    }] : []);
    window.history.replaceState({ shell: "kept" }, "", "/mes?tab=admin");
    const pushState = vi.spyOn(window.history, "pushState");

    render(
      <BomWorkbench
        items={[selectedParent, highParent]}
        allBomRows={[]}
        refreshAllBom={() => undefined}
        refreshItems={async () => undefined}
        onStatusChange={() => undefined}
        onError={() => undefined}
      />,
    );

    await waitFor(() => expect(window.history.state).toEqual({
      shell: "kept",
      bomWorkbench: { dept: "A", mode: "edit", parentId: "parent-1" },
    }));
    expect(pushState).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByTestId("bom-department-filters")).getByRole("button", { name: "고압" }));
    await waitFor(() => expect(pushState).toHaveBeenLastCalledWith({
      shell: "kept",
      bomWorkbench: { dept: "H", mode: "edit", parentId: "high-parent" },
    }, ""));

    fireEvent.click(screen.getByRole("button", { name: "사용처" }));
    await waitFor(() => expect(pushState).toHaveBeenLastCalledWith({
      shell: "kept",
      bomWorkbench: { dept: "H", mode: "whereused", parentId: "high-parent" },
    }, ""));
    const pushCount = pushState.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "사용처" }));
    expect(pushState).toHaveBeenCalledTimes(pushCount);

    fireEvent.click(await screen.findByTitle("이 부모로 이동 (편집 모드)"));
    expect(pushState).toHaveBeenLastCalledWith({
      shell: "kept",
      bomWorkbench: { dept: "H", mode: "edit", parentId: "high-parent" },
    }, "");
  });

  it("replaces an invalid where-used parent with the first active edit candidate without pushing", async () => {
    const deletedParent = {
      ...selectedParent,
      item_id: "deleted-parent",
      item_name: "Deleted parent",
      mes_code: "DELETED-001",
      deleted_at: "2026-08-05T00:00:00Z",
    } as Item;
    vi.spyOn(api, "getBOM").mockResolvedValue([]);
    vi.spyOn(api, "getBOMWhereUsed").mockResolvedValue([{
      bom_id: "where-used-deleted",
      parent_item_id: "deleted-parent",
      parent_item_name: "Deleted parent",
      parent_mes_code: "DELETED-001",
      child_item_id: selectedParent.item_id,
      child_item_name: selectedParent.item_name,
      child_mes_code: selectedParent.mes_code,
      quantity: 1,
      unit: "EA",
      notes: null,
    }]);
    window.history.replaceState({ shell: "kept" }, "", "/mes?tab=admin");
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");

    render(
      <BomWorkbench
        items={[selectedParent, deletedParent]}
        allBomRows={[]}
        refreshAllBom={() => undefined}
        refreshItems={async () => undefined}
        onStatusChange={() => undefined}
        onError={() => undefined}
      />,
    );

    await waitFor(() => expect(window.history.state.bomWorkbench).toEqual({
      dept: "A",
      mode: "edit",
      parentId: "parent-1",
    }));
    fireEvent.click(screen.getByRole("button", { name: "사용처" }));
    const deletedTarget = await screen.findByTitle("이 부모로 이동 (편집 모드)");
    pushState.mockClear();
    replaceState.mockClear();

    fireEvent.click(deletedTarget);

    await waitFor(() => expect(window.history.state.bomWorkbench).toEqual({
      dept: "A",
      mode: "edit",
      parentId: "parent-1",
    }));
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenLastCalledWith({
      shell: "kept",
      bomWorkbench: { dept: "A", mode: "edit", parentId: "parent-1" },
    }, "");
  });

  it("restores back and forward states without pushing and replaces an unavailable parent fallback", async () => {
    const secondParent = {
      ...selectedParent,
      item_id: "parent-2",
      item_name: "Second parent",
      mes_code: "PARENT-002",
    } as Item;
    vi.spyOn(api, "getBOM").mockResolvedValue([]);
    vi.spyOn(api, "getBOMWhereUsed").mockResolvedValue([]);
    window.history.replaceState({ shell: "kept" }, "", "/mes?tab=admin");
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");

    render(
      <BomWorkbench
        items={[selectedParent, secondParent]}
        allBomRows={[]}
        refreshAllBom={() => undefined}
        refreshItems={async () => undefined}
        onStatusChange={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(await screen.findAllByText("Selected parent summary")).not.toHaveLength(0);
    pushState.mockClear();
    replaceState.mockClear();

    const restoredState = {
      shell: "kept",
      bomWorkbench: { dept: "A", mode: "whereused", parentId: "parent-2" },
    };
    window.history.replaceState(restoredState, "");
    replaceState.mockClear();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: restoredState }));
    });
    await screen.findByText("사용처 (0건)");
    expect(await screen.findAllByText("Second parent")).not.toHaveLength(0);
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();

    const invalidState = {
        shell: "kept",
        bomWorkbench: { dept: "A", mode: "edit", parentId: "missing-parent" },
    };
    window.history.replaceState(invalidState, "");
    replaceState.mockClear();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: invalidState }));
    });
    await waitFor(() => expect(replaceState).toHaveBeenLastCalledWith({
      shell: "kept",
      bomWorkbench: { dept: "A", mode: "edit", parentId: "parent-1" },
    }, ""));
    expect(pushState).not.toHaveBeenCalled();
  });

  it("excludes deleted parents and replaces a deleted popstate parent with the first active candidate", async () => {
    const deletedParent = {
      ...selectedParent,
      item_id: "deleted-parent",
      item_name: "Deleted parent",
      mes_code: "DELETED-001",
      deleted_at: "2026-08-05T00:00:00Z",
    } as Item;
    vi.spyOn(api, "getBOM").mockResolvedValue([]);
    vi.spyOn(api, "getBOMWhereUsed").mockResolvedValue([]);
    window.history.replaceState({ shell: "kept" }, "", "/mes?tab=admin");
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");

    render(
      <BomWorkbench
        items={[selectedParent, deletedParent]}
        allBomRows={[]}
        refreshAllBom={() => undefined}
        refreshItems={async () => undefined}
        onStatusChange={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(await screen.findAllByText("Selected parent summary")).not.toHaveLength(0);
    const parentList = screen.getByText("상위 품목 선택").closest(".rounded-2xl") as HTMLElement;
    expect(within(parentList).queryByText("Deleted parent")).not.toBeInTheDocument();
    pushState.mockClear();
    replaceState.mockClear();

    const deletedState = {
      shell: "kept",
      bomWorkbench: { dept: "A", mode: "edit", parentId: "deleted-parent" },
    };
    window.history.replaceState(deletedState, "");
    replaceState.mockClear();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: deletedState }));
    });

    await waitFor(() => expect(replaceState).toHaveBeenLastCalledWith({
      shell: "kept",
      bomWorkbench: { dept: "A", mode: "edit", parentId: "parent-1" },
    }, ""));
    expect(within(parentList).queryByText("Deleted parent")).not.toBeInTheDocument();
    expect(pushState).not.toHaveBeenCalled();
  });

  it("preserves restored navigation while an initially empty item list is still loading", async () => {
    const highParent = {
      ...selectedParent,
      item_id: "high-parent",
      item_name: "High parent",
      mes_code: "HIGH-001",
      process_type_code: "HA",
    } as Item;
    const restoredState = {
      shell: "kept",
      bomWorkbench: { dept: "H", mode: "whereused", parentId: "high-parent" },
    };
    vi.spyOn(api, "getBOM").mockResolvedValue([]);
    vi.spyOn(api, "getBOMWhereUsed").mockResolvedValue([]);
    window.history.replaceState(restoredState, "", "/mes?tab=admin");
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    replaceState.mockClear();
    const props = {
      allBomRows: [],
      refreshAllBom: () => undefined,
      refreshItems: async () => undefined,
      onStatusChange: () => undefined,
      onError: () => undefined,
    };

    const { rerender } = render(<BomWorkbench {...props} items={[]} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "사용처" })).toHaveStyle({
      background: "var(--c-blue-solid)",
    }));
    expect(window.history.state).toEqual(restoredState);
    expect(replaceState).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();

    rerender(<BomWorkbench {...props} items={[highParent]} />);

    expect(await screen.findAllByText("High parent")).not.toHaveLength(0);
    await waitFor(() => expect(window.history.state).toEqual(restoredState));
    expect(replaceState).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
  });
});
