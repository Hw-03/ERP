import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defectsApi } from "@/lib/api/defects";
import type { DefectLocation } from "@/lib/api/types/defects";
import { DefectStorageView, ManagementCategoryModal } from "../DefectStorageView";

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

describe("모바일 B급·구형 목록", () => {
  it("필터를 접어 시작하고 조건·정렬·분류 선택을 접은 뒤에도 유지한다", () => {
    window.localStorage.clear();
    render(<DefectStorageView mobilePresentation locations={[
      { ...location, item_id: "item-1", mes_code: "6-AR-0001", quantity: 1, original_quantity: 1, pending_quantity: 0, defective_at: null },
      { ...location, record_id: "record-2", item_id: "item-2", item_name: "튜브 구형 품목", department: "튜브", management_category: "OBSOLETE", quantity: 2, original_quantity: 2, pending_quantity: 0, defective_at: null },
    ]} currentEmployee={{ employee_id: "employee-1", name: "Kim", department: "조립" }} onBack={() => {}} onRestore={() => {}} onUpdated={() => {}} />);
    const classifications = screen.getByRole("group", { name: "보관 분류 필터" });
    expect(classifications).toHaveClass("grid-cols-3");
    expect(screen.getByRole("button", { name: "필터 펼치기" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("combobox", { name: "정렬" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "필터 펼치기" }));
    fireEvent.click(screen.getByRole("button", { name: "조립", exact: true }));
    fireEvent.change(screen.getByRole("combobox", { name: "정렬" }), { target: { value: "oldest" } });
    fireEvent.click(screen.getByRole("button", { name: "필터 접기" }));
    expect(screen.getByRole("button", { name: "필터 펼치기" })).toHaveTextContent("부서 조립 · 오래된 순");
    fireEvent.click(within(classifications).getByRole("button", { name: /B급/ }));
    expect(within(classifications).getByRole("button", { name: /B급/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "B급·구형 검색" })).toBeInTheDocument();
    expect(screen.getByText("ADX6000 구형 컬리메이터")).toBeInTheDocument();
    expect(screen.queryByText("튜브 구형 품목")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "필터 펼치기" }));
    expect(screen.getByRole("combobox", { name: "정렬" })).toHaveValue("oldest");
  });
});
