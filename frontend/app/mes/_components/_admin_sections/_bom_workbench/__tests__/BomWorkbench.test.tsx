import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BomWorkbench } from "../BomWorkbench";

function closestWithClass(element: HTMLElement, className: string): HTMLElement {
  let current: HTMLElement | null = element;
  while (current && !current.classList.contains(className)) current = current.parentElement;
  if (!current) throw new Error(`Missing ancestor with ${className}`);
  return current;
}

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
});
