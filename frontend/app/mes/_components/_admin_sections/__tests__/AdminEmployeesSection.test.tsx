import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AdminEmployeesSection } from "../AdminEmployeesSection";
import { DirtyGuardProvider } from "@/lib/ui/dirty-guard";
import { AdminReadProvider, INITIAL_ADMIN_READ_STATES } from "../_admin_primitives/AdminReadState";

const setSelectedEmployee = vi.fn();
const context: any = {
  employees: [
    {
      employee_id: "emp-1",
      employee_code: "E01",
      name: "김건호",
      role: "작업자",
      department: "조립",
      warehouse_role: "none",
      department_role: "none",
      io_enabled: true,
      display_order: 1,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      pin_is_default: true,
      assigned_model_slots: [],
    },
  ],
  departments: [
    { id: 1, name: "조립", display_order: 1, is_active: true, color_hex: "#c026d3" },
  ],
  selectedEmployee: null,
  setSelectedEmployee,
  empAddMode: false,
  setEmpAddMode: vi.fn(),
  empAddForm: {},
  setEmpAddForm: vi.fn(),
  addEmployee: vi.fn(),
  toggleEmployee: vi.fn(),
  confirmTarget: null,
  confirmToggle: vi.fn(),
  cancelConfirm: vi.fn(),
  editForm: {},
  setEditForm: vi.fn(),
  saveEmployee: vi.fn().mockResolvedValue(undefined),
  pinResetTarget: null,
  pinResetAdminPin: "",
  setPinResetAdminPin: vi.fn(),
  pinResetError: "",
  requestPinReset: vi.fn(),
  confirmPinReset: vi.fn(),
  cancelPinReset: vi.fn(),
  deleteTarget: null,
  requestDelete: vi.fn(),
  confirmDelete: vi.fn(),
  cancelDelete: vi.fn(),
  dirty: false,
};
const defaultEmployee = context.employees[0];
const defaultDepartments = context.departments;

beforeEach(() => {
  vi.clearAllMocks();
  context.employees = [defaultEmployee];
  context.departments = defaultDepartments;
  context.selectedEmployee = null;
  context.editForm = {};
});

vi.mock("../AdminEmployeesContext", () => ({
  useAdminEmployeesContext: () => context,
}));

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useModelsQuery: () => ({ data: [] }),
}));

describe("AdminEmployeesSection", () => {
  it("최초 조회에서는 미선택 안내 대신 직원 목록과 상세 자리를 표시한다", () => {
    render(<AdminReadProvider value={{ states: INITIAL_ADMIN_READ_STATES, retry: vi.fn() }}>
      <DirtyGuardProvider><AdminEmployeesSection /></DirtyGuardProvider>
    </AdminReadProvider>);
    expect(screen.getByTestId("admin-table-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("admin-detail-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/직원을 선택하세요/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "직원 추가" })).toBeDisabled();
  });
  it("지연된 첫 조회도 상세를 숨기지 않고 이전 스켈레톤에서 전환한다", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 800, height: 600, left: 500, top: 280 } as DOMRect);
    const readyStates = Object.fromEntries(Object.keys(INITIAL_ADMIN_READ_STATES).map((key) => [key, { status: "ready" }])) as typeof INITIAL_ADMIN_READ_STATES;
    const view = (ready: boolean) => <AdminReadProvider value={{ states: ready ? readyStates : INITIAL_ADMIN_READ_STATES, retry: vi.fn() }}><DirtyGuardProvider><AdminEmployeesSection /></DirtyGuardProvider></AdminReadProvider>;
    try {
      const { container, rerender, unmount } = render(view(false));
      context.selectedEmployee = defaultEmployee;
      context.editForm = { ...defaultEmployee, phone: "", hidden_sidebar_tabs: [], as_research_approver: false };
      rerender(view(true));
      const snapshot = container.querySelector("[data-admin-detail-snapshot]")!;
      expect(snapshot.querySelector("[data-testid='admin-detail-skeleton']")).toBeInTheDocument();
      expect(container.querySelector("[data-admin-detail-content] [data-testid='admin-detail-skeleton']")).toBeNull();
      expect(screen.getByRole("textbox", { name: "이름" })).toHaveValue(defaultEmployee.name);
      expect(animate.mock.contexts.some((element) => element.hasAttribute("data-admin-detail-content"))).toBe(false);
      unmount();
    } finally { bounds.mockRestore(); Reflect.deleteProperty(Element.prototype, "animate"); vi.unstubAllGlobals(); }
  });
  it.each(["ㄱㄱㅎ", "ㄱㄱㅎ ㅈㄹ", "ㅈㅇㅈ", "김건호 조립"])("직원 이름·부서·직급을 초성과 조합 검색으로 찾는다: %s", (query) => {
    context.employees = [defaultEmployee, { ...defaultEmployee, employee_id: "emp-2", name: "박서연", department: "출하", role: "대리" }];
    const { container } = render(<DirtyGuardProvider><AdminEmployeesSection /></DirtyGuardProvider>);
    fireEvent.change(screen.getByPlaceholderText("이름·부서·직급 검색"), { target: { value: query } });
    expect(container.querySelector("[data-admin-employee-row='emp-1']")).toBeInTheDocument();
    expect(container.querySelector("[data-admin-employee-row='emp-2']")).toBeNull();
  });

  it("초성 검색과 부서 필터를 함께 적용한다", async () => {
    context.employees = [defaultEmployee, { ...defaultEmployee, employee_id: "emp-2", name: "김건하", department: "출하" }];
    const { container } = render(<DirtyGuardProvider><AdminEmployeesSection /></DirtyGuardProvider>);
    fireEvent.change(screen.getByPlaceholderText("이름·부서·직급 검색"), { target: { value: "ㄱㄱㅎ" } });
    expect(container.querySelectorAll("[data-admin-employee-row]")).toHaveLength(2);
    fireEvent.click(screen.getByRole("combobox", { name: "부서 필터" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "출하", exact: true }));
    await waitFor(() => expect(container.querySelector("[data-admin-employee-row='emp-1']")).toBeNull());
    expect(container.querySelector("[data-admin-employee-row='emp-2']")).toBeInTheDocument();
  });

  it("직원 목록을 이름·부서 직급·상태 열의 평평한 표 행으로 표시한다", () => {
    const inactiveEmployee = {
      ...defaultEmployee,
      employee_id: "emp-2",
      employee_code: "E02",
      name: "김비활성",
      is_active: false,
    };
    context.employees = [defaultEmployee, inactiveEmployee];
    context.selectedEmployee = defaultEmployee;
    context.editForm = {
      name: defaultEmployee.name,
      role: defaultEmployee.role,
      phone: "",
      department: defaultEmployee.department,
      warehouse_role: defaultEmployee.warehouse_role,
      department_role: defaultEmployee.department_role,
      as_research_approver: false,
      hidden_sidebar_tabs: [],
      assigned_model_slots: [],
    };

    const { container } = render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    const header = container.querySelector("[data-admin-list-header='employees']");
    expect(header).toHaveTextContent("이름");
    expect(header).toHaveTextContent("부서·직급");
    expect(header).toHaveTextContent("상태");
    expect(container.querySelector("[data-admin-employee-row='emp-1']")).toHaveClass("grid", "border-b");
    expect(container.querySelector("[data-admin-employee-row='emp-1']")).not.toHaveClass("rounded-[10px]");
    expect(container.querySelector("[data-admin-employee-row='emp-1']")).toHaveAttribute("aria-selected", "true");
    expect(container.querySelectorAll("svg[data-lucide='grip-vertical']")).toHaveLength(0);
    expect(container.querySelector("[data-admin-employee-row='emp-1']")).toHaveTextContent("활성");
    expect(container.querySelector("[data-admin-employee-row='emp-2']")).toHaveTextContent("비활성");
  });

  it("선택한 직원의 상세 권한 편집기에 AS·연구 승인 권한을 연결한다", () => {
    context.selectedEmployee = defaultEmployee;
    context.editForm = {
      name: defaultEmployee.name,
      role: defaultEmployee.role,
      phone: "",
      department: defaultEmployee.department,
      warehouse_role: "none",
      department_role: "none",
      as_research_approver: false,
      hidden_sidebar_tabs: [],
      assigned_model_slots: [],
    };

    render(<DirtyGuardProvider><AdminEmployeesSection /></DirtyGuardProvider>);

    const approval = screen.getByRole("radiogroup", { name: "AS·연구 승인 권한" });
    expect(within(approval).getByRole("radio", { name: "없음" })).toBeChecked();
    fireEvent.click(within(approval).getByRole("radio", { name: "승인" }));
    expect(context.setEditForm.mock.calls[0][0](context.editForm)).toEqual({ ...context.editForm, as_research_approver: true });
  });

  it("직원 표 행은 세 gridcell과 키보드 선택을 제공한다", () => {
    const { container } = render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );
    const row = container.querySelector("[data-admin-employee-row='emp-1']");

    expect(row).toHaveAttribute("role", "row");
    expect(container.querySelector("button[data-admin-employee-row='emp-1']")).toBeNull();
    expect(row?.querySelectorAll("[role='gridcell']")).toHaveLength(3);
    fireEvent.keyDown(row!, { key: "Enter" });

    expect(setSelectedEmployee).toHaveBeenCalledWith(defaultEmployee);
    setSelectedEmployee.mockClear();
    fireEvent.click(row!);
    expect(setSelectedEmployee).toHaveBeenCalledWith(defaultEmployee);
  });

  it("passes the available detail height into the employee workspace", () => {
    const { container } = render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    expect(container.querySelector(".flex.min-h-0.flex-1.flex-col")).toHaveClass("min-h-0", "flex-1");
  });

  it("uses the shared primary action size for the selected employee save button", () => {
    context.selectedEmployee = defaultEmployee;
    context.editForm = {
      name: defaultEmployee.name,
      role: defaultEmployee.role,
      phone: "",
      department: defaultEmployee.department,
      warehouse_role: defaultEmployee.warehouse_role,
      department_role: defaultEmployee.department_role,
      hidden_sidebar_tabs: [],
      assigned_model_slots: [],
    };
    render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    const saveButton = screen.getByRole("button", { name: "저장" });

    expect(saveButton).toHaveClass("h-11", "min-w-[88px]", "px-4", "py-2", "text-[13px]");
    expect(saveButton.querySelector("svg")).toHaveClass("h-4", "w-4");
    context.saveEmployee.mockClear();
    fireEvent.click(saveButton);
    expect(saveButton).toBeDisabled();
    expect(context.saveEmployee).not.toHaveBeenCalled();
  });

  it("legacy 부서/직급은 목록과 선택 헤더에서 표준 직급으로 표시한다", () => {
    const legacyEmployee = {
      ...context.employees[0],
      department: "영업",
      role: "영업/과장",
    };
    context.employees = [legacyEmployee];
    context.selectedEmployee = legacyEmployee;
    context.editForm = {
      name: legacyEmployee.name,
      role: "과장",
      phone: "",
      department: "영업",
      warehouse_role: "none",
      department_role: "none",
      hidden_sidebar_tabs: [],
      assigned_model_slots: [],
    };

    render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    expect(screen.getAllByText("영업 · 과장")).toHaveLength(1);
    expect(within(screen.getByRole("group", { name: "직원 기본 정보" })).getByRole("combobox", { name: "직급" })).toHaveTextContent("과장");
  });

  it("비선택 legacy 직원도 목록에서 표준 직급으로 표시한다", () => {
    const selectedEmployee = {
      ...context.employees[0],
      department: "조립",
      role: "사원",
    };
    const legacyEmployee = {
      ...context.employees[0],
      employee_id: "emp-2",
      employee_code: "E02",
      name: "영업 직원",
      department: "영업",
      role: "영업/과장",
    };
    context.employees = [selectedEmployee, legacyEmployee];
    context.selectedEmployee = selectedEmployee;
    context.editForm = {
      name: selectedEmployee.name,
      role: "사원",
      phone: "",
      department: "조립",
      warehouse_role: "none",
      department_role: "none",
      hidden_sidebar_tabs: [],
      assigned_model_slots: [],
    };

    render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    expect(screen.getByRole("row", { name: /영업 직원/ })).toHaveTextContent("영업 · 과장");
  });

  it("선택 직원의 부서와 직급 편집은 저장 전 목록과 헤더에 즉시 반영하고 저장하지 않는다", () => {
    const selectedEmployee = {
      ...context.employees[0],
      department: "영업",
      role: "영업/과장",
    };
    context.employees = [selectedEmployee];
    context.departments = [
      { id: 1, name: "영업", display_order: 1, is_active: true, color_hex: "#c026d3" },
      { id: 2, name: "조립", display_order: 2, is_active: true, color_hex: "#0891b2" },
    ];
    context.selectedEmployee = selectedEmployee;
    context.editForm = {
      name: selectedEmployee.name,
      role: "과장",
      phone: "",
      department: "영업",
      warehouse_role: "none",
      department_role: "none",
      hidden_sidebar_tabs: [],
      assigned_model_slots: [],
    };
    context.setEditForm.mockImplementation((updater: (form: typeof context.editForm) => typeof context.editForm) => {
      context.editForm = updater(context.editForm);
    });
    context.saveEmployee.mockClear();

    const { rerender } = render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "직급" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "대리" }));
    rerender(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    fireEvent.click(screen.getAllByRole("combobox")[2]);
    fireEvent.mouseDown(screen.getByRole("option", { name: "조립" }));
    rerender(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    expect(screen.getAllByText("조립 · 대리")).toHaveLength(1);
    expect(within(screen.getByRole("group", { name: "직원 기본 정보" })).getByRole("combobox", { name: "직급" })).toHaveTextContent("대리");
    expect(context.saveEmployee).not.toHaveBeenCalled();
  });

  it("부서 마스터의 저장 색상 변경을 직원 목록 점에 즉시 반영한다", () => {
    const { rerender } = render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );
    const employeeRow = screen.getByRole("row", { name: /김건호/ });

    expect(employeeRow.querySelector("span.h-2.w-2")).toHaveStyle({ background: "#c026d3" });

    context.departments = [
      { id: 1, name: "조립", display_order: 1, is_active: true, color_hex: "#0891b2" },
    ];
    rerender(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    expect(employeeRow.querySelector("span.h-2.w-2")).toHaveStyle({ background: "#0891b2" });
  });
  it("부서 필터를 목록 헤더 오른쪽의 넓은 선택 상자로 표시한다", () => {
    render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    const deptFilter = screen.getByRole("combobox", { name: "부서 필터" });
    expect(deptFilter.parentElement).toHaveClass("w-[48%]", "min-w-[144px]");
    expect(deptFilter.closest("div.flex.shrink-0")).toContainElement(screen.getByText("직원 목록"));
  });

  it("직원 추가를 시작하면 비어 있는 직급을 사원으로 채운다", () => {
    context.empAddForm = { role: "" };
    context.setEmpAddForm.mockClear();
    render(
      <DirtyGuardProvider>
        <AdminEmployeesSection />
      </DirtyGuardProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "직원 추가" }));

    expect(context.setEmpAddForm).toHaveBeenCalledOnce();
    const updateForm = context.setEmpAddForm.mock.calls[0][0];
    expect(updateForm({ role: "" }).role).toBe("사원");
  });
});
