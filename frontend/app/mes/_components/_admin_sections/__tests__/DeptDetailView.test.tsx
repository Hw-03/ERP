import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DeptDetailView } from "../_department_parts/DeptDetailView";

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

  it("색상 코드 오류를 입력 필드에 연결하고 유효한 값에서 해제한다", () => {
    render(<ControlledDetail />);

    const colorInput = screen.getByRole("textbox", { name: "색상 코드" });
    fireEvent.change(colorInput, { target: { value: "#123" } });

    const error = screen.getByText("올바른 hex 코드를 입력하세요 (예: #3B82F6)");
    expect(colorInput).toHaveAttribute("aria-invalid", "true");
    expect(colorInput).toHaveAttribute("aria-describedby", error.id);

    fireEvent.change(colorInput, { target: { value: "#123456" } });

    expect(colorInput).not.toHaveAttribute("aria-invalid");
    expect(colorInput).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText("올바른 hex 코드를 입력하세요 (예: #3B82F6)")).not.toBeInTheDocument();
  });

  it("비활성화 확인창을 닫으면 실행 버튼으로 포커스를 돌려준다", async () => {
    render(<ControlledDetail />);

    const trigger = screen.getByRole("button", { name: "부서 비활성화" });
    trigger.focus();
    fireEvent.click(trigger);

    const cancel = screen.getByRole("button", { name: "취소" });
    fireEvent.click(cancel);

    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
