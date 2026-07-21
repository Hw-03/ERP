import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DesktopAdminView } from "../DesktopAdminView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/ui/dirty-guard", () => ({
  useConfirmNavigation: () => (next: () => void) => next(),
}));

vi.mock("@/lib/ui/Toast", () => ({
  Toast: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("../_admin_hooks/useAdminViewState", () => ({
  useAdminViewState: () => ({
    unlocked: true,
    adminPin: "0000",
    section: "models",
    selectedDept: null,
    setSelectedDept: vi.fn(),
    unlock: vi.fn(),
    lock: vi.fn(),
    selectSection: vi.fn(),
  }),
}));

vi.mock("../_admin_hooks/useAdminBootstrap", () => ({
  useAdminBootstrap: () => ({
    items: [], setItems: vi.fn(),
    employees: [], setEmployees: vi.fn(),
    productModels: [], setProductModels: vi.fn(),
    departments: [], setDepartments: vi.fn(),
    allBomRows: [], refreshAllBom: vi.fn(), refreshItems: vi.fn(), loadData: vi.fn(),
  }),
}));

vi.mock("../_admin_hooks/useAdminSettings", () => ({
  useAdminSettings: () => ({
    pinForm: { current_pin: "", new_pin: "", confirm_pin: "" },
    setPinForm: vi.fn(), saveMessage: "", showSave: vi.fn(), changePin: vi.fn(),
  }),
}));

vi.mock("../_admin_sections/AdminSectionContent", () => ({
  AdminSectionContent: () => <div>관리자 본문</div>,
}));

describe("DesktopAdminView", () => {
  it("고정 관리자 사이드 메뉴 대신 상단 섹션 탭을 렌더링한다", () => {
    render(<DesktopAdminView globalSearch="" onStatusChange={vi.fn()} />);

    expect(screen.getByRole("navigation", { name: "관리자 섹션" })).toBeInTheDocument();
    expect(screen.getByText("관리자 본문")).toBeInTheDocument();
  });
});
