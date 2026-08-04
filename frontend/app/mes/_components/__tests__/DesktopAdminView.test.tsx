import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { DesktopAdminView } from "../DesktopAdminView";

const state = vi.hoisted(() => ({
  unlocked: true,
  sectionParam: null as string | null,
  searchString: "tab=admin",
  selectSection: vi.fn(),
  routerReplace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: state.routerReplace }),
  useSearchParams: () => ({
    get: (key: string) => (key === "section" ? state.sectionParam : null),
    toString: () => state.searchString,
  }),
}));

vi.mock("@/lib/ui/dirty-guard", () => ({
  useConfirmNavigation: () => (next: () => void) => next(),
}));

vi.mock("@/lib/ui/Toast", () => ({
  Toast: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("../_admin_hooks/useAdminViewState", () => ({
  useAdminViewState: () => ({
    unlocked: state.unlocked,
    adminPin: "0000",
    section: "models",
    selectedDept: null,
    setSelectedDept: vi.fn(),
    unlock: vi.fn(),
    selectSection: state.selectSection,
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
  it("applies the soft selection depth only to the unlocked admin workspace", () => {
    render(<DesktopAdminView globalSearch="" onStatusChange={vi.fn()} />);

    expect(screen.getByText("관리자 본문").closest("[data-selection-depth='soft']")).toBeInTheDocument();
  });

  it("does not render the soft selection depth while the admin workspace is locked", () => {
    state.unlocked = false;

    const { container } = render(<DesktopAdminView globalSearch="" onStatusChange={vi.fn()} />);

    expect(container.querySelector("[data-selection-depth='soft']")).not.toBeInTheDocument();
  });

  beforeEach(() => {
    state.unlocked = true;
    state.sectionParam = null;
    state.searchString = "tab=admin";
    state.selectSection.mockReset();
    state.routerReplace.mockReset();
  });

  it("고정 관리자 사이드 메뉴 대신 상단 섹션 탭을 렌더링한다", () => {
    render(<DesktopAdminView globalSearch="" onStatusChange={vi.fn()} />);

    expect(screen.getByRole("navigation", { name: "관리자 섹션" })).toBeInTheDocument();
    expect(screen.getByText("관리자 본문")).toBeInTheDocument();
  });

  it("요약 바의 상단 여백을 16px로 유지하도록 작업 영역에 4px 패딩을 적용한다", () => {
    render(<DesktopAdminView globalSearch="" onStatusChange={vi.fn()} />);

    expect(screen.getByText("관리자 본문").closest("section")).toHaveClass("pt-1");
  });

  it("기존 audit 섹션 주소는 내보내기로 정규화한다", async () => {
    state.sectionParam = "audit";
    state.searchString = "tab=admin&section=audit";

    const { rerender } = render(
      <DesktopAdminView globalSearch="" onStatusChange={vi.fn()} />,
    );

    await waitFor(() => {
      expect(state.selectSection).toHaveBeenCalledWith("export");
      expect(state.routerReplace).toHaveBeenCalledWith(
        "?tab=admin&section=export",
        { scroll: false },
      );
    });

    expect(state.routerReplace).toHaveBeenCalledTimes(1);
    state.sectionParam = "export";
    state.searchString = "tab=admin&section=export";
    rerender(<DesktopAdminView globalSearch="" onStatusChange={vi.fn()} />);

    await waitFor(() => {
      expect(state.routerReplace).toHaveBeenCalledTimes(1);
    });
  });
});
