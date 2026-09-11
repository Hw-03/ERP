import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defectsApi } from "@/lib/api/defects";
import type { DefectLocation } from "@/lib/api/types/defects";
import { ManagementCategoryModal } from "../DefectStorageView";

vi.mock("@/lib/api/defects", () => ({
  defectsApi: {
    updateManagementCategory: vi.fn(),
    getManagementCategoryHistory: vi.fn(),
  },
}));

const location = {
  record_id: "record-1",
  item_name: "ADX6000 구형 컬리메이터",
  department: "조립",
  available_quantity: 1,
  management_category: "B_GRADE",
} as DefectLocation;

describe("ManagementCategoryModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("covers the full app with an opaque, spacious category dialog", () => {
    const { container } = render(
      <ManagementCategoryModal
        location={location}
        currentEmployee={{ employee_id: "employee-1" }}
        onClose={() => {}}
        onUpdated={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "보관 분류 변경" });
    expect(container).not.toContainElement(dialog);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveClass("backdrop-blur-sm", "z-[450]");

    const panel = screen.getByTestId("management-category-panel");
    expect(panel).toHaveStyle({ background: "var(--c-popup-bg)" });
    expect(within(panel).queryByText(/현재 분류/)).not.toBeInTheDocument();

    const categoryGroup = within(panel).getByRole("group", { name: "보관 분류" });
    expect(categoryGroup).toHaveClass("grid", "grid-cols-2");
    expect(within(categoryGroup).queryByRole("button", { name: "B급" })).not.toBeInTheDocument();
    const categoryButtons = within(categoryGroup).getAllByRole("button");
    expect(categoryButtons).toHaveLength(2);
    categoryButtons.forEach((button) => {
      expect(button).toHaveClass("min-h-11", "w-full");
    });

    const closeButton = within(panel).getByRole("button", { name: "닫기" });
    expect(closeButton).toHaveTextContent("");
    expect(within(panel).queryByRole("button", { name: "분류 이력" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("textbox", { name: "분류 변경 메모" })).toHaveClass("resize-none");
  });

  it("saves the selected category when Enter is pressed in the PIN field", async () => {
    vi.mocked(defectsApi.updateManagementCategory).mockResolvedValue(undefined);
    const onUpdated = vi.fn();
    render(
      <ManagementCategoryModal
        location={location}
        currentEmployee={{ employee_id: "employee-1" }}
        onClose={() => {}}
        onUpdated={onUpdated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "구형" }));
    const pinField = screen.getByLabelText("직원 PIN");
    fireEvent.change(pinField, { target: { value: "0000" } });
    fireEvent.keyDown(pinField, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(defectsApi.updateManagementCategory).toHaveBeenCalledWith("record-1", {
        management_category: "OBSOLETE",
        expected_management_category: "B_GRADE",
        memo: null,
        actor_employee_id: "employee-1",
        pin: "0000",
      });
    });
    expect(onUpdated).toHaveBeenCalledWith("OBSOLETE");
  });
});
