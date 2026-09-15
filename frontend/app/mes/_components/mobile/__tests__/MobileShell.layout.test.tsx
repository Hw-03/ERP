import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppNotification } from "@/lib/api/types";

const setAuditScreen = vi.hoisted(() => vi.fn());
const flushWarehouseDraft = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const warehouseMounts = vi.hoisted(() => ({ count: 0 }));
const notificationNavigation = vi.hoisted(() => ({
  current: undefined as undefined | ((target: { tab: string; section: string | null; relatedRequestId: string | null }) => void),
}));

const state = vi.hoisted(() => ({
  notifications: {
    items: [] as AppNotification[],
    unread_count: 0,
  },
  operator: {
    employee_id: "emp-1",
    name: "Kim",
    department: "Assembly",
    level: "staff",
    employee_code: "E1",
    warehouse_role: "none",
    department_role: "none",
    as_research_approver: true,
    theme: null,
    assigned_model_slots: [],
    io_enabled: true,
    hidden_sidebar_tabs: [],
    loginPopupEnabled: true,
  },
  revision: null as number | null,
}));

vi.mock("@/lib/api", () => ({
  api: {
    getProductionCapacity: vi.fn(() => new Promise<null>(() => {})),
  },
}));

vi.mock("@/lib/queries/useNotificationsQuery", () => ({
  useNotificationsQuery: () => ({ data: state.notifications }),
}));

vi.mock("@/lib/client-events", () => ({
  sendClientEvent: vi.fn(),
}));

vi.mock("@/lib/activity-audit-context", () => ({
  setAuditScreen,
}));

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => state.revision,
}));

vi.mock("../../login/useCurrentOperator", () => ({
  useCurrentOperator: () => state.operator,
}));

vi.mock("../screens", () => ({
  MobileDashboardScreen: ({
    onStatusChange,
    onGoToWarehouse,
    capacityData,
  }: {
    onStatusChange: (status: string) => void;
    onGoToWarehouse?: (item: unknown, intent?: unknown) => void;
    capacityData?: { immediate: number } | null;
  }) => (
    <>
      <button type="button" onClick={() => onStatusChange("item added")}>
        dashboard screen
      </button>
      <button
        type="button"
        onClick={() => onGoToWarehouse?.({ item_id: 101 }, { workType: "receive" })}
      >
        quick warehouse
      </button>
      <output data-testid="capacity-immediate">{capacityData?.immediate ?? "none"}</output>
    </>
  ),
  MobileWarehouseScreen: ({
    onComposeDirtyChange,
    flushDraftRef,
    preselectedItem,
    entryIntent,
    notificationSection,
    targetRequestId,
  }: {
    onComposeDirtyChange?: (dirty: boolean) => void;
    flushDraftRef?: { current: (() => Promise<void>) | null };
    preselectedItem?: { item_id?: number } | null;
    entryIntent?: { workType?: string } | null;
    notificationSection?: string | null;
    targetRequestId?: string | null;
  }) => {
    const [mountId] = useState(() => ++warehouseMounts.count);
    useEffect(() => {
      if (!flushDraftRef) return;
      flushDraftRef.current = flushWarehouseDraft;
      return () => {
        flushDraftRef.current = null;
      };
    }, [flushDraftRef]);
    return (
      <>
        <div>warehouse screen</div>
        <output data-testid="warehouse-mount">{mountId}</output>
        <output data-testid="warehouse-preselected">{preselectedItem?.item_id ?? "none"}</output>
        <output data-testid="warehouse-intent">{entryIntent?.workType ?? "none"}</output>
        <output data-testid="warehouse-notification-section">{notificationSection ?? "none"}</output>
        <output data-testid="warehouse-notification-request">{targetRequestId ?? "none"}</output>
        <button type="button" onClick={() => onComposeDirtyChange?.(true)}>
          mark warehouse dirty
        </button>
        <button type="button" onClick={() => notificationNavigation.current?.({ tab: "warehouse", section: "as-research-queue", relatedRequestId: "as-request-2" })}>
          open deferred AS notification
        </button>
      </>
    );
  },
  MobileDefectScreen: () => <div data-testid="defect-screen-state">{window.history.state?.defect ?? "none"}</div>,
  MobileHistoryScreen: () => <div>history screen</div>,
  MobileWeeklyScreen: ({ onExit }: { onExit?: () => void }) => (
    <>
      <div>weekly screen</div>
      <button type="button" onClick={onExit}>back from weekly</button>
    </>
  ),
  MobileWarehouseMapScreen: () => <div>map screen</div>,
  MobileShippingScreen: () => <div>shipping screen</div>,
  MobileAssemblyChecklistScreen: ({ onExit }: { onExit?: () => void }) => (
    <>
      <div>assembly checklist screen</div>
      <button type="button" onClick={onExit}>back from checklist</button>
    </>
  ),
  MobileMoreScreen: ({
    onChecklist,
    onWeekly,
    visibleEntries,
    onNotificationNavigate,
  }: {
    onChecklist?: () => void;
    onWeekly?: () => void;
    visibleEntries?: string[];
    onNotificationNavigate?: (target: { tab: string; section: string | null; relatedRequestId: string | null }) => void;
  }) => {
    notificationNavigation.current = onNotificationNavigate;
    return <>
      <div data-testid="more-entry-order">{visibleEntries?.join(",")}</div>
      <button type="button" onClick={onChecklist}>open checklist</button>
      <button type="button" onClick={onWeekly}>open weekly</button>
      <button type="button" onClick={() => onNotificationNavigate?.({ tab: "warehouse", section: "as-research-queue", relatedRequestId: "as-request-1" })}>open AS notification</button>
    </>;
  },
}));

import { MobileShell } from "../MobileShell";
import { sendClientEvent } from "@/lib/client-events";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("MobileShell layout", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/mes");
    state.notifications = { items: [], unread_count: 0 };
    state.operator.hidden_sidebar_tabs = [];
    state.revision = null;
    warehouseMounts.count = 0;
    notificationNavigation.current = undefined;
    flushWarehouseDraft.mockReset().mockResolvedValue(undefined);
    vi.mocked(sendClientEvent).mockClear();
    setAuditScreen.mockClear();
  });

  it("does not render the old mobile top header controls", () => {
    render(<MobileShell />);

    expect(screen.queryByTestId("desktop-status-target")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "알림" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "사용자 메뉴" })).not.toBeInTheDocument();
    expect(screen.getByText("dashboard screen")).toBeInTheDocument();
  });

  it("shows unread notification count on the More bottom tab", () => {
    state.notifications = {
      items: [],
      unread_count: 3,
    };

    render(<MobileShell />);

    expect(screen.getByRole("button", { name: "더보기" })).toHaveTextContent("3");
  });

  it("keeps More visible when the checklist is the only available entry", () => {
    state.operator.hidden_sidebar_tabs = ["weekly", "shipping", "warehouseMap"];

    render(<MobileShell />);

    expect(screen.getByRole("button", { name: "더보기" })).toBeInTheDocument();
  });

  it("does not show mobile status messages as floating notifications", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "dashboard screen" }));

    expect(screen.queryByText("item added")).not.toBeInTheDocument();
  });

  it("AS·연구 승인 알림은 모바일 입출고의 전용 탭과 대상 요청으로 전달한다", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(screen.getByRole("button", { name: "open AS notification" }));

    expect(screen.getByTestId("warehouse-notification-section")).toHaveTextContent("as-research-queue");
    expect(screen.getByTestId("warehouse-notification-request")).toHaveTextContent("as-request-1");
  });

  it("작성 중인 입출고에서 새 AS 알림을 취소하면 보류 대상은 적용하지 않는다", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(screen.getByRole("button", { name: "open AS notification" }));
    fireEvent.click(screen.getByRole("button", { name: "mark warehouse dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "open deferred AS notification" }));

    expect(screen.getByRole("dialog", { name: "작성 중 이동 확인" })).toBeInTheDocument();
    expect(screen.getByTestId("warehouse-notification-request")).toHaveTextContent("as-request-1");
    fireEvent.click(screen.getByRole("button", { name: "계속 작성" }));

    expect(screen.queryByRole("dialog", { name: "작성 중 이동 확인" })).not.toBeInTheDocument();
    expect(screen.getByTestId("warehouse-notification-request")).toHaveTextContent("as-request-1");
  });

  it("작성 중인 입출고에서 새 AS 알림을 폐기 확인하면 보류 대상을 적용한다", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(screen.getByRole("button", { name: "open AS notification" }));
    fireEvent.click(screen.getByRole("button", { name: "mark warehouse dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "open deferred AS notification" }));
    fireEvent.click(screen.getByRole("button", { name: "저장 안 하고 나가기" }));

    expect(screen.queryByRole("dialog", { name: "작성 중 이동 확인" })).not.toBeInTheDocument();
    expect(screen.getByTestId("warehouse-notification-section")).toHaveTextContent("as-research-queue");
    expect(screen.getByTestId("warehouse-notification-request")).toHaveTextContent("as-request-2");
  });

  it("AS·연구 승인 알림을 떠난 뒤 빠른 입출고로 다시 열면 과거 대상 요청을 버린다", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(screen.getByRole("button", { name: "open AS notification" }));
    fireEvent.click(screen.getByRole("button", { name: "대시보드" }));
    fireEvent.click(screen.getByRole("button", { name: "quick warehouse" }));

    expect(screen.getByTestId("warehouse-preselected")).toHaveTextContent("101");
    expect(screen.getByTestId("warehouse-notification-section")).toHaveTextContent("none");
    expect(screen.getByTestId("warehouse-notification-request")).toHaveTextContent("none");
  });

  it("AS·연구 승인 알림을 떠난 뒤 하단 입출고 탭으로 열면 compose로 초기화한다", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(screen.getByRole("button", { name: "open AS notification" }));
    fireEvent.click(screen.getByRole("button", { name: "대시보드" }));
    fireEvent.click(screen.getByRole("button", { name: "입출고" }));

    expect(screen.getByTestId("warehouse-preselected")).toHaveTextContent("none");
    expect(screen.getByTestId("warehouse-notification-section")).toHaveTextContent("none");
    expect(screen.getByTestId("warehouse-notification-request")).toHaveTextContent("none");
  });

  it("opens the checklist from More while keeping the More slot active", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(screen.getByRole("button", { name: "open checklist" }));

    expect(screen.getByText("assembly checklist screen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "체크리스트" })).toHaveAttribute("aria-current", "page");
  });

  it("orders More entries and returns checklist and weekly screens to More", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));

    expect(screen.getByTestId("more-entry-order")).toHaveTextContent("assemblyChecklist,dailyReport,shipping,weekly,warehouseMap");

    fireEvent.click(screen.getByRole("button", { name: "open checklist" }));
    fireEvent.click(screen.getByRole("button", { name: "back from checklist" }));

    expect(screen.getByRole("button", { name: "open checklist" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "open weekly" }));
    fireEvent.click(screen.getByRole("button", { name: "back from weekly" }));

    expect(screen.getByRole("button", { name: "open weekly" })).toBeInTheDocument();
  });

  it("logs top-level mobile tab changes once", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "입출고" }));

    expect(sendClientEvent).toHaveBeenCalledWith({
      event: "ui_nav",
      from: "dashboard",
      to: "warehouse",
      path: "/mes",
      screen_key: "mobile.warehouse",
      screen_label: "입출고",
      source: "mobile",
    });
    expect(sendClientEvent).toHaveBeenCalledTimes(1);
    expect(setAuditScreen).toHaveBeenLastCalledWith({ key: "mobile.warehouse", label: "입출고" });
  });

  it("returns an active defect tab to the hub and clears an in-progress cart history state", () => {
    render(<MobileShell />);

    fireEvent.click(screen.getByRole("button", { name: "불량" }));
    window.history.replaceState({ defect: "cart", mode: "add", step: 2, source: "warehouse" }, "");
    fireEvent.click(screen.getByRole("button", { name: "불량" }));

    expect(window.history.state).toEqual({ defect: "hub" });
    expect(screen.getByTestId("defect-screen-state")).toHaveTextContent("hub");
  });

  it("resets a clean active warehouse tab and removes stale compose URL state", () => {
    window.history.replaceState({}, "", "/mes?tab=warehouse&section=compose&step=4&draftId=draft-1");
    render(<MobileShell />);

    expect(screen.getByTestId("warehouse-mount")).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "입출고" }));

    expect(window.location.search).toBe("?tab=warehouse");
    expect(screen.getByTestId("warehouse-mount")).toHaveTextContent("2");
  });

  it("clears quick-entry state and replaces stale compose history on a same-tab reset", () => {
    render(<MobileShell />);
    fireEvent.click(screen.getByRole("button", { name: "quick warehouse" }));

    expect(screen.getByTestId("warehouse-preselected")).toHaveTextContent("101");
    expect(screen.getByTestId("warehouse-intent")).toHaveTextContent("receive");
    window.history.replaceState({}, "", "/mes?tab=warehouse&section=compose&step=4&draftId=draft-1");
    const historyLength = window.history.length;

    fireEvent.click(screen.getByRole("button", { name: "입출고" }));

    expect(window.location.search).toBe("?tab=warehouse");
    expect(window.history.length).toBe(historyLength);
    expect(screen.getByTestId("warehouse-preselected")).toHaveTextContent("none");
    expect(screen.getByTestId("warehouse-intent")).toHaveTextContent("none");
  });

  it("keeps a dirty active warehouse tab and its URL when same-tab reset is cancelled", () => {
    window.history.replaceState({}, "", "/mes?tab=warehouse&section=compose&step=4&draftId=draft-1");
    render(<MobileShell />);
    fireEvent.click(screen.getByRole("button", { name: "mark warehouse dirty" }));

    fireEvent.click(screen.getByRole("button", { name: "입출고" }));

    expect(screen.getByRole("dialog", { name: "작성 중 이동 확인" })).toBeInTheDocument();
    expect(window.location.search).toBe("?tab=warehouse&section=compose&step=4&draftId=draft-1");
    expect(screen.getByTestId("warehouse-mount")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "계속 작성" }));

    expect(screen.queryByRole("dialog", { name: "작성 중 이동 확인" })).not.toBeInTheDocument();
    expect(window.location.search).toBe("?tab=warehouse&section=compose&step=4&draftId=draft-1");
    expect(screen.getByTestId("warehouse-mount")).toHaveTextContent("1");
  });

  it("flushes and resets a dirty active warehouse tab after same-tab confirmation", async () => {
    const draftSave = deferred<void>();
    flushWarehouseDraft.mockReturnValueOnce(draftSave.promise);
    window.history.replaceState({}, "", "/mes?tab=warehouse&section=compose&step=4&draftId=draft-1");
    render(<MobileShell />);
    fireEvent.click(screen.getByRole("button", { name: "mark warehouse dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "입출고" }));

    fireEvent.click(screen.getByRole("button", { name: "임시저장하고 이동" }));

    await vi.waitFor(() => expect(flushWarehouseDraft).toHaveBeenCalledTimes(1));
    expect(window.location.search).toBe("?tab=warehouse&section=compose&step=4&draftId=draft-1");
    expect(screen.getByTestId("warehouse-mount")).toHaveTextContent("1");

    await act(async () => draftSave.resolve(undefined));
    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "작성 중 이동 확인" })).not.toBeInTheDocument();
    });
    expect(window.location.search).toBe("?tab=warehouse");
    expect(screen.getByTestId("warehouse-mount")).toHaveTextContent("2");
  });

  it("refreshes capacity on a realtime revision without leaving the active tab", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api.getProductionCapacity).mockResolvedValue(null);
    vi.mocked(api.getProductionCapacity).mockClear();
    const { rerender } = render(<MobileShell />);

    await screen.findByText("dashboard screen");
    await vi.waitFor(() => {
      expect(api.getProductionCapacity).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getAllByRole("button").find((button) => button.getAttribute("aria-label") === "입출고")!);
    expect(screen.getByText("warehouse screen")).toBeInTheDocument();

    state.revision = 1;
    rerender(<MobileShell />);

    await vi.waitFor(() => {
      expect(api.getProductionCapacity).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText("warehouse screen")).toBeInTheDocument();
  });

  it("keeps the newest capacity when an older request resolves last", async () => {
    const { api } = await import("@/lib/api");
    const older = deferred<never>();
    const newer = deferred<never>();
    vi.mocked(api.getProductionCapacity)
      .mockReset()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const { rerender } = render(<MobileShell />);
    await vi.waitFor(() => expect(api.getProductionCapacity).toHaveBeenCalledTimes(1));

    state.revision = 1;
    rerender(<MobileShell />);
    await vi.waitFor(() => expect(api.getProductionCapacity).toHaveBeenCalledTimes(2));

    await act(async () => newer.resolve({ immediate: 22 } as never));
    await screen.findByText("22");
    await act(async () => older.resolve({ immediate: 11 } as never));

    await vi.waitFor(() => {
      expect(screen.getByTestId("capacity-immediate")).toHaveTextContent("22");
    });
  });
});
