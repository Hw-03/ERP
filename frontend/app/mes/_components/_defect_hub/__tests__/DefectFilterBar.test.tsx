import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DefectFilterBar } from "../DefectFilterBar";

describe("DefectFilterBar", () => {
  it("renders the filter lock checkbox after the sort select and reports changes", () => {
    const onFilterLockedChange = vi.fn();
    const { rerender } = render(
      <DefectFilterBar
        scope="my"
        actorScope="all"
        sort="newest"
        filterLocked={false}
        onScopeChange={vi.fn()}
        onActorScopeChange={vi.fn()}
        onSortChange={vi.fn()}
        onFilterLockedChange={onFilterLockedChange}
        currentDept="조립"
      />,
    );

    const sortSelect = screen.getByRole("combobox");
    const checkbox = screen.getByRole("checkbox", { name: "필터 고정" });
    expect(sortSelect.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(onFilterLockedChange).toHaveBeenCalledWith(true);

    rerender(
      <DefectFilterBar
        scope="my"
        actorScope="all"
        sort="newest"
        filterLocked
        onScopeChange={vi.fn()}
        onActorScopeChange={vi.fn()}
        onSortChange={vi.fn()}
        onFilterLockedChange={onFilterLockedChange}
        currentDept="조립"
      />,
    );
    expect(screen.getByRole("checkbox", { name: "필터 고정" })).toBeChecked();
  });
});
