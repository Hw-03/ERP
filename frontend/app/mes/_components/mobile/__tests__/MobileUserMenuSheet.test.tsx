import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DEFAULT_ROLE = "조립/사원";

const state = vi.hoisted(() => ({
  operator: {
    employee_id: "emp-1",
    name: "김현우",
    department: "조립",
    level: "staff",
    role: "조립/사원",
    employee_code: "E06",
    warehouse_role: "none",
    department_role: "none",
    theme: null,
    assigned_model_slots: [],
    io_enabled: true,
    hidden_sidebar_tabs: [],
    loginPopupEnabled: true,
  },
}));

vi.mock("@/lib/ui/BottomSheet", () => ({
  BottomSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
}));

vi.mock("../../login/useCurrentOperator", () => ({
  clearCurrentOperator: vi.fn(),
  useCurrentOperator: () => state.operator,
}));

vi.mock("@/lib/api", () => ({ api: { changeMyPin: vi.fn() } }));

import { MobileUserMenuSheet } from "../MobileUserMenuSheet";

describe("MobileUserMenuSheet", () => {
  beforeEach(() => {
    state.operator.role = DEFAULT_ROLE;
  });

  it("shows the department and final role segment without exposing the access level", () => {
    render(<MobileUserMenuSheet open onClose={() => {}} />);

    expect(screen.getByText("조립 · 사원")).toBeInTheDocument();
    expect(screen.queryByText("staff")).not.toBeInTheDocument();
  });

  it("trims the final role segment after the department separator", () => {
    state.operator.role = "조립 / 사원  ";
    render(<MobileUserMenuSheet open onClose={() => {}} />);

    expect(screen.getByText("조립 · 사원")).toBeInTheDocument();
  });

  it("uses a role without a department separator as the job title", () => {
    state.operator.role = "사원";
    render(<MobileUserMenuSheet open onClose={() => {}} />);

    expect(screen.getByText("조립 · 사원")).toBeInTheDocument();
  });

  it("shows only the department when role is empty", () => {
    state.operator.role = "";
    render(<MobileUserMenuSheet open onClose={() => {}} />);

    expect(screen.getByText("조립")).toBeInTheDocument();
    expect(screen.queryByText("조립 ·")).not.toBeInTheDocument();
  });

  it("shows only the department when a legacy in-memory operator has no role", () => {
    state.operator.role = undefined as unknown as string;
    render(<MobileUserMenuSheet open onClose={() => {}} />);

    expect(screen.getByText("조립")).toBeInTheDocument();
    expect(screen.queryByText("조립 ·")).not.toBeInTheDocument();
  });
});
