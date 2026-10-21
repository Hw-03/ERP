import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeptDetailView } from "../_department_parts/DeptDetailView";
import type { Employee } from "@/lib/api";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: { updateDepartment: vi.fn() },
}));

vi.mock("../../DepartmentsContext", () => ({
  useRefreshDepartments: () => vi.fn(),
}));

vi.mock("@/lib/ui/ConfirmModal", () => ({
  ConfirmModal: () => null,
}));

describe("DeptDetailView", () => {
  it("표시명을 편집하며 위치키를 저장 요청에 보내지 않는다", async () => {
    const dept = { id: 1, name: "튜브", display_name: "튜브팀", display_order: 1, is_active: true, color_hex: "#2f74e7" };
    vi.mocked(api.updateDepartment).mockResolvedValue({ ...dept, display_name: "튜브 새 표시명" });
    let save: (() => void) | null = null;
    const onStatusChange = vi.fn();
    render(<DeptDetailView dept={dept} adminPin="0000" empCount={1} itemCount={1} deptEmployees={[]}
      onSetDepartments={vi.fn()} setSelectedDept={vi.fn()} onStatusChange={onStatusChange}
      onError={vi.fn()} onToggleActive={vi.fn()} onRequestDelete={vi.fn()}
      onSaveRef={(fn) => { save = fn; }} />);
    expect(screen.getByRole("textbox", { name: "부서명" })).toHaveValue("튜브팀");
    fireEvent.change(screen.getByRole("textbox", { name: "부서명" }), { target: { value: "튜브 새 표시명" } });
    act(() => { save?.(); });
    await waitFor(() => expect(api.updateDepartment).toHaveBeenCalledWith(1, {
      display_name: "튜브 새 표시명", color_hex: "#2f74e7", pin: "0000",
    }));
    expect(onStatusChange).toHaveBeenCalledWith("'튜브 새 표시명' 부서 정보를 저장했습니다.");
  });

  it("returns the save promise and rejects on failure without discarding the draft", async () => {
    const failure = new Error("저장 실패");
    vi.mocked(api.updateDepartment).mockRejectedValueOnce(failure);
    const onSaveRef = vi.fn();
    const setSelectedDept = vi.fn();
    render(<DeptDetailView dept={{ id: 1, name: "조립", display_order: 1, is_active: true, color_hex: "#2f74e7" }} adminPin="0000"
      empCount={0} itemCount={0} deptEmployees={[]} onSetDepartments={vi.fn()} setSelectedDept={setSelectedDept}
      onStatusChange={vi.fn()} onError={vi.fn()} onToggleActive={vi.fn()} onRequestDelete={vi.fn()} onSaveRef={onSaveRef} />);
    fireEvent.change(screen.getByRole("textbox", { name: "부서명" }), { target: { value: "수정 이름" } });
    await act(async () => {
      await expect(onSaveRef.mock.lastCall![0]()).rejects.toBe(failure);
    });
    expect(setSelectedDept).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "부서명" })).toHaveValue("수정 이름");
  });
  it("소속 직원을 색상 카드 앞에 배치하고 모든 직원을 표시한다", () => {
    const employees = Array.from({ length: 7 }, (_, index) => ({ employee_id: `employee-${index}`, name: `직원 ${index}`, role: "사원", is_active: true }) as Employee);
    render(<DeptDetailView dept={{ id: 1, name: "조립", display_order: 1, is_active: true, color_hex: "#2f74e7" }} adminPin="0000"
      empCount={employees.length} itemCount={0} deptEmployees={employees} onSetDepartments={vi.fn()} setSelectedDept={vi.fn()}
      onStatusChange={vi.fn()} onError={vi.fn()} onToggleActive={vi.fn()} onRequestDelete={vi.fn()} />);
    employees.forEach(employee => expect(screen.getByText(employee.name)).toBeInTheDocument());
    expect(screen.queryByText(/더보기/)).not.toBeInTheDocument();
    const employeesCard = screen.getByText("소속 직원 (7명)").parentElement!;
    expect(employeesCard.nextElementSibling).toContainElement(screen.getByText("색상"));
  });
  it("starts the palette closed and exposes it through an accessible button", () => {
    render(
      <DeptDetailView
        dept={{ id: 1, name: "조립", display_order: 1, is_active: true, color_hex: "#2f74e7" }}
        adminPin="0000"
        empCount={1}
        itemCount={1}
        deptEmployees={[]}
        onSetDepartments={vi.fn()}
        setSelectedDept={vi.fn()}
        onStatusChange={vi.fn()}
        onError={vi.fn()}
        onToggleActive={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
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
      <DeptDetailView
        dept={{ id: 1, name: "조립", display_order: 1, is_active: true, color_hex: "#2f74e7" }}
        adminPin="0000"
        empCount={1}
        itemCount={1}
        deptEmployees={[]}
        onSetDepartments={vi.fn()}
        setSelectedDept={vi.fn()}
        onStatusChange={vi.fn()}
        onError={vi.fn()}
        onToggleActive={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
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
