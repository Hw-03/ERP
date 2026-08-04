/* eslint-disable @next/next/no-img-element */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { api } from "@/lib/api";
import { readCurrentOperator } from "../login/useCurrentOperator";
import { DesktopSidebar } from "../DesktopSidebar";

vi.mock("next/image", () => ({
  default: ({ alt = "", priority: _priority, ...props }: Record<string, unknown>) => (
    <img alt={String(alt)} {...props} />
  ),
}));

const SIDEBAR_MODE_STORAGE_KEY = "dexcowin_mes_sidebar_mode";
const apiWithSidebarMode = api as typeof api & {
  setEmployeeSidebarMode?: (employeeId: string, mode: string) => Promise<unknown>;
};
const realSetEmployeeSidebarMode = apiWithSidebarMode.setEmployeeSidebarMode;

function storeOperator(sidebarMode?: string): void {
  window.sessionStorage.setItem(
    "dexcowin_mes_operator",
    JSON.stringify({
      employee_id: "emp-1",
      name: "테스트 작업자",
      role: "조립/사원",
      department: "조립",
      level: "staff",
      employee_code: "E1",
      warehouse_role: "none",
      department_role: "none",
      theme: null,
      sidebar_mode: sidebarMode,
      assigned_model_slots: [],
      io_enabled: true,
      hidden_sidebar_tabs: [],
      loginPopupEnabled: false,
    }),
  );
}

function renderSidebar() {
  return render(
    <DesktopSidebar
      activeTab="dashboard"
      onTabChange={vi.fn()}
      visibleTabs={["dashboard", "admin"]}
    />,
  );
}

describe("SidebarModeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (realSetEmployeeSidebarMode) {
      apiWithSidebarMode.setEmployeeSidebarMode = realSetEmployeeSidebarMode;
    } else {
      delete apiWithSidebarMode.setEmployeeSidebarMode;
    }
  });

  it("restores the local expanded preference when no operator is logged in", async () => {
    window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, "expanded");
    const { container } = renderSidebar();

    await screen.findByRole("button", { name: /사이드바 현재 펼침 고정/ });
    expect(container.firstElementChild).toHaveStyle({ width: "220px" });
  });

  it("prefers the logged-in employee mode over the local fallback", async () => {
    window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, "expanded");
    storeOperator("collapsed");
    const { container } = renderSidebar();

    await screen.findByRole("button", { name: /사이드바 현재 접힘 고정/ });
    expect(container.firstElementChild).toHaveStyle({ width: "72px" });
  });

  it("falls back to hover for an invalid stored value", async () => {
    window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, "floating");
    renderSidebar();

    expect(
      await screen.findByRole("button", { name: /사이드바 현재 호버 모드/ }),
    ).toBeInTheDocument();
  });

  it("places the sidebar mode control below the theme control", async () => {
    renderSidebar();

    const buttons = await screen.findAllByRole("button");
    const bottomLabels = buttons
      .map((button) => button.getAttribute("aria-label") ?? button.textContent ?? "")
      .filter((label) => /라이트 모드|다크 모드|사이드바 현재/.test(label));

    expect(bottomLabels).toEqual([
      expect.stringMatching(/라이트 모드|다크 모드/),
      expect.stringMatching(/사이드바 현재 호버 모드/),
    ]);
  });

  it("updates local and operator state immediately while serializing server writes", async () => {
    storeOperator("hover");
    let rejectFirst!: (reason?: unknown) => void;
    const firstRequest = new Promise<unknown>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const saveMode = vi
      .fn()
      .mockImplementationOnce(() => firstRequest)
      .mockResolvedValueOnce({ employee_id: "emp-1", sidebar_mode: "expanded" });
    apiWithSidebarMode.setEmployeeSidebarMode = saveMode;
    renderSidebar();

    fireEvent.click(
      await screen.findByRole("button", { name: /사이드바 현재 호버 모드/ }),
    );
    await screen.findByRole("button", { name: /사이드바 현재 접힘 고정/ });
    await waitFor(() => expect(saveMode).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /사이드바 현재 접힘 고정/ }));
    await screen.findByRole("button", { name: /사이드바 현재 펼침 고정/ });
    expect(saveMode).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY)).toBe("expanded");
    expect(
      (readCurrentOperator() as unknown as { sidebar_mode: string })?.sidebar_mode,
    ).toBe("expanded");

    rejectFirst(new Error("first save failed"));
    await waitFor(() => expect(saveMode).toHaveBeenCalledTimes(2));
    expect(saveMode.mock.calls).toEqual([
      ["emp-1", "collapsed"],
      ["emp-1", "expanded"],
    ]);
  });
});
