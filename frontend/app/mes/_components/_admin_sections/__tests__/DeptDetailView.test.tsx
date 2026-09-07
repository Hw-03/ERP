import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DeptDetailView } from "../_department_parts/DeptDetailView";

vi.mock("@/lib/ui/ConfirmModal", () => ({
  ConfirmModal: () => null,
}));

const department = { id: 1, name: "조립", display_order: 1, is_active: true, color_hex: "#2f74e7" };

function ControlledDetail() {
  const [editForm, setEditForm] = useState({ name: department.name, color_hex: department.color_hex });
  return (
    <DeptDetailView
      dept={department}
      editForm={editForm}
      setEditForm={setEditForm}
      empCount={1}
      itemCount={1}
      deptEmployees={[]}
      onToggleActive={vi.fn()}
      onRequestDelete={vi.fn()}
    />
  );
}

describe("DeptDetailView", () => {
  it("starts the palette closed and exposes it through an accessible button", () => {
    render(
      <ControlledDetail />,
    );

    expect(screen.getByTitle("현재 저장된 색상")).toBeInTheDocument();
    expect(screen.getByTestId("department-dark-color-preview").getAttribute("style")).toContain(
      "color-mix(in srgb, #2f74e7 var(--c-department-color-source-weight), var(--c-department-color-neutral))",
    );

    const toggle = screen.getByRole("button", { name: "전체 색상 보기" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "department-color-palette");
    expect(toggle).not.toHaveClass("active:scale-[0.98]");
    expect(screen.queryByRole("button", { name: /blue-500/i })).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const blueSwatch = screen.getByRole("button", { name: /blue-500/i });
    expect(blueSwatch).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(blueSwatch);

    expect(blueSwatch).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "색상 코드" })).toHaveValue("#3b82f6");
  });

  it("가용 높이를 카드에 배분하고 위험 작업 행을 상세 영역 최하단에 둔다", () => {
    render(
      <ControlledDetail />,
    );

    const colorCard = screen.getByText("색상").parentElement;
    const employeesCard = screen.getByText("소속 직원 (0명)").parentElement;
    const actions = screen.getByRole("button", { name: "부서 비활성화" }).parentElement;
    const layout = actions?.parentElement;

    expect(layout).toHaveClass("min-h-full");
    expect(colorCard).toHaveClass("min-h-0", "flex-1");
    expect(employeesCard).toHaveClass("min-h-0", "flex-1");
    expect(actions).toHaveClass("mt-auto");
  });
});
