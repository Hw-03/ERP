import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";
import { AdminDepartmentsSection } from "../AdminDepartmentsSection";

const assembly = { id: 1, name: "조립", display_order: 1, is_active: true, color_hex: "#2f74e7" };

const context = {
  departments: [assembly],
  addName: "",
  setAddName: vi.fn(),
  addDepartmentMaster: vi.fn(),
  selectedDept: assembly,
  setSelectedDept: vi.fn(),
  deactivateDepartmentMaster: vi.fn(),
  reactivateDepartmentMaster: vi.fn(),
  hardDeleteDepartment: vi.fn(),
  reorderDepartments: vi.fn(),
  updateDepartmentColor: vi.fn(),
  detailForm: { name: "조립", color_hex: "#2f74e7" },
  setDetailForm: vi.fn(),
  saveDepartment: vi.fn().mockResolvedValue({ status: "unchanged", department: assembly }),
  dirty: false,
};
const defaultDepartments = [assembly];

beforeEach(() => {
  vi.clearAllMocks();
  context.departments = defaultDepartments;
  context.selectedDept = assembly;
});

vi.mock("../AdminDepartmentsContext", () => ({
  useAdminDepartmentsContext: () => context,
}));

describe("AdminDepartmentsSection", () => {
  it("uses fixed list and status widths so full department statuses fit", () => {
    const { container } = render(
      <DirtyGuardProvider>
        <AdminDepartmentsSection employees={[]} items={[]} />
      </DirtyGuardProvider>,
    );

    expect(container.querySelector("div[style*='width: 336px']")).toBeInTheDocument();
    expect(container.querySelector("[data-admin-list-header='departments']")).toHaveClass("grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_88px]");
    expect(container.querySelector("[data-admin-department-row='1']")).toHaveClass("grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_88px]");
    expect(container.querySelector("[data-admin-department-row='1'] span[title]")).toHaveStyle({ maxWidth: "84px" });
  });

  it("부서 목록을 부서명·코드 소속 직원·상태 열의 평평한 표 행으로 표시한다", () => {
    const inactiveDepartment = {
      id: 2,
      name: "비활성 부서",
      display_order: 2,
      is_active: false,
      color_hex: "#6f59e8",
    };
    context.departments = [assembly, inactiveDepartment];

    const { container } = render(
      <DirtyGuardProvider>
        <AdminDepartmentsSection employees={[]} items={[]} />
      </DirtyGuardProvider>,
    );

    const header = container.querySelector("[data-admin-list-header='departments']");
    expect(header).toHaveTextContent("부서명");
    expect(header).toHaveTextContent("코드·소속 직원");
    expect(header).toHaveTextContent("상태");
    expect(container.querySelector("[data-admin-department-row='1']")).toHaveClass("grid", "border-b");
    expect(container.querySelector("[data-admin-department-row='1']")).not.toHaveClass("rounded-[10px]");
    expect(container.querySelector("[data-admin-department-row='1']")).toHaveAttribute("aria-selected", "true");
    expect(container.querySelectorAll("svg[data-lucide='grip-vertical']")).toHaveLength(0);
    expect(container.querySelector("[data-admin-department-row='1']")).toHaveTextContent("사용 중");
    expect(container.querySelector("[data-admin-department-row='2']")).toHaveTextContent("비활성");
  });

  it("부서 표 행은 세 gridcell과 키보드 선택을 제공한다", () => {
    context.selectedDept = null as any;
    const { container } = render(
      <DirtyGuardProvider>
        <AdminDepartmentsSection employees={[]} items={[]} />
      </DirtyGuardProvider>,
    );
    const row = container.querySelector("[data-admin-department-row='1']");
    context.setSelectedDept.mockClear();

    expect(row).toHaveAttribute("role", "row");
    expect(container.querySelector("button[data-admin-department-row='1']")).toBeNull();
    expect(row?.querySelectorAll("[role='gridcell']")).toHaveLength(3);
    fireEvent.keyDown(row!, { key: " " });

    expect(context.setSelectedDept).toHaveBeenCalledWith(assembly);
    context.setSelectedDept.mockClear();
    fireEvent.keyDown(row!, { key: "Enter" });
    expect(context.setSelectedDept).toHaveBeenCalledWith(assembly);
    context.setSelectedDept.mockClear();
    fireEvent.click(row!);
    expect(context.setSelectedDept).toHaveBeenCalledWith(assembly);
  });

  it("삭제 확인창을 닫으면 영구 삭제 버튼으로 포커스를 돌려준다", async () => {
    render(
      <DirtyGuardProvider>
        <AdminDepartmentsSection employees={[]} items={[]} />
      </DirtyGuardProvider>,
    );

    const trigger = screen.getByRole("button", { name: "영구 삭제" });
    trigger.focus();
    fireEvent.click(trigger);

    const cancel = screen.getByRole("button", { name: "취소" });
    fireEvent.click(cancel);

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("passes the available detail height into the department workspace", () => {
    const { container } = render(
      <DirtyGuardProvider>
        <AdminDepartmentsSection employees={[]} items={[]} />
      </DirtyGuardProvider>,
    );

    expect(container.querySelector(".flex.min-h-0.flex-1.flex-col")).toHaveClass("min-h-0", "flex-1");
  });

  it("uses the shared primary action size for the selected department save button", () => {
    render(
      <DirtyGuardProvider>
        <AdminDepartmentsSection employees={[]} items={[]} />
      </DirtyGuardProvider>,
    );

    const saveButton = screen.getByRole("button", { name: "저장" });

    expect(saveButton).toHaveClass("h-11", "min-w-[88px]", "px-4", "py-2", "text-[13px]");
    expect(saveButton.querySelector("svg")).toHaveClass("h-4", "w-4");
  });

  it("counts related items from their process type instead of their legacy department field", () => {
    render(
      <DirtyGuardProvider>
        <AdminDepartmentsSection
          employees={[]}
          items={[
            { item_id: "assembly", item_name: "조립 품목", process_type_code: "AA", department: "기타" },
            { item_id: "tube", item_name: "튜브 품목", process_type_code: "TR", department: "조립" },
            { item_id: "unmapped", item_name: "미매핑 품목", process_type_code: null, department: "조립" },
          ] as any}
        />
      </DirtyGuardProvider>,
    );

    expect(screen.getByText("관련 품목").parentElement).toHaveTextContent("1개");
  });
});
