import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/api";
import { BomWorkbench } from "../BomWorkbench";

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
});
