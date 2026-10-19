import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defectsApi } from "@/lib/api/defects";
import type { DefectLocation } from "@/lib/api/types/defects";
import { DefectStorageView, ManagementCategoryModal } from "../DefectStorageView";

vi.mock("@/lib/api/defects", () => ({
  defectsApi: {
    updateManagementCategory: vi.fn(),
    movePoolCategory: vi.fn(),
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

  it("moves a selected POOL quantity with its version and PIN", async () => {
    vi.mocked(defectsApi.movePoolCategory).mockResolvedValue({ management_category: "OBSOLETE", target_pool_id: "target-pool" });
    render(<ManagementCategoryModal location={{ ...location, record_id: null, pool_id: "pool-1", source_kind: "POOL", version: 4, quantity: 5, available_quantity: 3, pending_quantity: 2, original_quantity: null }} currentEmployee={{ employee_id: "employee-1" }} onClose={() => {}} onUpdated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "구형" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "이동 수량" }), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("직원 PIN"), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
    await waitFor(() => expect(defectsApi.movePoolCategory).toHaveBeenCalledWith("pool-1", expect.objectContaining({ management_category: "OBSOLETE", quantity: 2, expected_version: 4, actor_employee_id: "employee-1", pin: "0000" })));
    expect(defectsApi.updateManagementCategory).not.toHaveBeenCalled();
  });

  it("does not move more POOL stock than the available quantity", () => {
    render(<ManagementCategoryModal location={{ ...location, record_id: null, pool_id: "pool-1", source_kind: "POOL", version: 4, quantity: 5, available_quantity: 3, pending_quantity: 2, original_quantity: null }} currentEmployee={{ employee_id: "employee-1" }} onClose={() => {}} onUpdated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "구형" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "이동 수량" }), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("직원 PIN"), { target: { value: "0000" } });
    expect(screen.getByRole("button", { name: "변경 저장" })).toBeDisabled();
    expect(defectsApi.movePoolCategory).not.toHaveBeenCalled();
  });
});

describe("모바일 B급·구형 목록", () => {
  it("PC 보관 검색을 지울 수 있고 조건에 가려진 재고를 없는 재고로 표시하지 않는다", () => {
    window.localStorage.clear();
    render(<DefectStorageView locations={[location]} currentEmployee={{ employee_id: "employee-1", name: "Kim", department: "조립" }} onBack={() => {}} onRestore={() => {}} onUpdated={() => {}} />);
    const search = screen.getByRole("searchbox", { name: "B급·구형 검색" });
    fireEvent.change(search, { target: { value: "검색 없음" } });
    expect(screen.getByText("검색 결과가 없습니다")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "B급·구형 검색 지우기" }));
    expect(search).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "필터 펼치기" }));
    fireEvent.click(within(screen.getByRole("group", { name: "공정 구분" })).getByRole("button", { name: "공정완료" }));
    expect(screen.queryByText("보관 중인 B급·구형 자재가 없습니다.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "필터 초기화" })).toBeInTheDocument();
  });
  it("PC 빈결과 초기화는 격리자 조건도 풀고 고정과 정렬 설정은 유지한다", () => {
    window.localStorage.clear();
    render(<DefectStorageView locations={[{ ...location, quarantined_by_employee_id: "other" }]} currentEmployee={{ employee_id: "employee-1", name: "Kim", department: "조립" }} onBack={() => {}} onRestore={() => {}} onUpdated={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "필터 펼치기" }));
    fireEvent.click(screen.getByRole("button", { name: "내가 격리" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "필터 고정" }));
    fireEvent.click(screen.getByRole("button", { name: "오래된 순", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(screen.getByText(location.item_name)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "필터 고정" })).toBeChecked();
    expect(screen.getByRole("button", { name: "오래된 순", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
  it("조합 입력 도중에도 보관 목록을 필터링한다", () => {
    window.localStorage.clear();
    render(<DefectStorageView mobilePresentation locations={[location]}
      currentEmployee={{ employee_id: "employee-1", name: "Kim", department: "조립" }}
      onBack={vi.fn()} onRestore={vi.fn()} onUpdated={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "B급·구형 검색" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "없는 검색어" } });
    expect(screen.queryByText(location.item_name)).not.toBeInTheDocument();
    fireEvent.compositionEnd(input);
    expect(screen.queryByText(location.item_name)).not.toBeInTheDocument();
    expect(screen.getByText("검색 결과가 없습니다.")).toBeInTheDocument();
  });

  it("필터를 접어 시작하고 조건·정렬·분류 선택을 접은 뒤에도 유지한다", () => {
    window.localStorage.clear();
    render(<DefectStorageView mobilePresentation locations={[
      { ...location, item_id: "item-1", mes_code: "6-AR-0001", quantity: 1, original_quantity: 1, pending_quantity: 0, defective_at: null },
      { ...location, record_id: "record-2", item_id: "item-2", item_name: "튜브 구형 품목", department: "튜브", management_category: "OBSOLETE", quantity: 2, original_quantity: 2, pending_quantity: 0, defective_at: null },
    ]} currentEmployee={{ employee_id: "employee-1", name: "Kim", department: "조립" }} onBack={() => {}} onRestore={() => {}} onUpdated={() => {}} />);
    const classifications = screen.getByRole("group", { name: "보관 분류 필터" });
    expect(classifications).toHaveClass("grid-cols-3");
    expect(screen.getByRole("button", { name: "필터 펼치기" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "정렬" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "필터 펼치기" }));
    fireEvent.click(screen.getByRole("button", { name: "조립", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "오래된 순", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "필터 접기" }));
    expect(screen.getByRole("button", { name: "필터 펼치기" })).toHaveTextContent("부서 조립 · 오래된 순");
    fireEvent.click(within(classifications).getByRole("button", { name: /B급/ }));
    expect(within(classifications).getByRole("button", { name: /B급/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "B급·구형 검색" })).toBeInTheDocument();
    expect(screen.getByText("ADX6000 구형 컬리메이터")).toBeInTheDocument();
    expect(screen.queryByText("튜브 구형 품목")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "필터 펼치기" }));
    expect(screen.getByRole("button", { name: "오래된 순", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
});
