import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render as rtlRender, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { DesktopShippingView } from "../DesktopShippingView";
import type { Item, ShippingHistoryMonth, ShippingRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { queryKeys } from "@/lib/queries/keys";

const navigationMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  search: "tab=shipping",
  searchParams: null as URLSearchParams | null,
}));

const realtimeMock = vi.hoisted(() => ({
  revision: 1 as number | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigationMock.push,
    replace: navigationMock.replace,
  }),
  useSearchParams: () => {
    if (navigationMock.searchParams?.toString() !== navigationMock.search) {
      navigationMock.searchParams = new URLSearchParams(navigationMock.search);
    }
    return navigationMock.searchParams;
  },
}));
vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => realtimeMock.revision,
}));
vi.mock("@/lib/api", () => ({
  api: {
    getItems: vi.fn(),
    getBOM: vi.fn(),
    getShippingRequests: vi.fn(),
    getShippingRequest: vi.fn(),
    getShippingHistory: vi.fn(),
    getShippingHistoryMonths: vi.fn(),
    getShippingRevisions: vi.fn(),
    updateShippingInvoice: vi.fn(),
    createShippingRequest: vi.fn(),
    updateShippingRequest: vi.fn(),
    sendShippingToPrep: vi.fn(),
    deleteShippingRequest: vi.fn(),
    updateShippingChecklist: vi.fn(),
    clearShippingChecklist: vi.fn(),
    prepareShippingComplete: vi.fn(),
    cancelShippingPrepare: vi.fn(),
    completeShippingPickup: vi.fn(),
    cancelShippingPickup: vi.fn(),
    matchShippingBom: vi.fn(),
  },
}));

import { api } from "@/lib/api";

function item(id: string, name: string, process: string, mes = id): Item {
  return {
    item_id: id,
    item_name: name,
    unit: "EA",
    quantity: 10,
    warehouse_qty: 10,
    production_total: 0,
    defective_total: 0,
    pending_quantity: 0,
    available_quantity: 10,
    last_reserver_name: null,
    location: null,
    locations: [],
    legacy_part: null,
    legacy_item_type: null,
    supplier: null,
    min_stock: null,
    mes_code: mes,
    model_symbol: "S",
    model_slots: [],
    process_type_code: process,
    sales_review_required: id === "af-1",
    serial_no: null,
    bom_completed_at: null,
    deleted_at: null,
    created_at: "2026-06-26T00:00:00Z",
    updated_at: "2026-06-26T00:00:00Z",
    department: null,
  };
}

const items = [
  item("pf-1", "Standard PF", "PF", "PF-001"),
  item("pa-1", "Standard PA", "PA", "PA-001"),
  item("pa-target", "Custom PA", "PA", "PA-T"),
  item("af-1", "AF Main", "AF-001"),
  item("acc-1", "Cable Set", "R", "R-001"),
  item("bracket-1", "Bracket Kit", "R", "R-BR"),
  item("carton-1", "Carton Box", "R", "R-BOX"),
];

function request(overrides: Partial<ShippingRequest> = {}): ShippingRequest {
  return {
    request_id: "req-1",
    status: "PREPARING",
    request_quantity: 1,
    base_pf_item_id: "pf-1",
    base_pf_item_name: "Standard PF",
    base_pf_mes_code: "PF-001",
    final_pa_item_id: null,
    final_pa_item_name: null,
    final_pf_item_id: null,
    final_pf_item_name: null,
    requested_by_name: "shipping",
    custom_pa_name: null,
    custom_pf_name: null,
    notes: "urgent",
    invoice_number: null,
    serial_numbers: null,
    prepared_at: null,
    picked_up_at: null,
    cancelled_at: null,
    cancelled_by_employee_id: null,
    cancelled_by_name: null,
    created_at: "2026-06-26T00:00:00Z",
    updated_at: "2026-06-26T00:00:00Z",
    bom_lines: [
      {
        line_id: "bom-1",
        parent_stage: "PF",
        child_item_id: "pa-1",
        item_name: "Standard PA",
        mes_code: "PA-001",
        process_type_code: "PA",
        quantity: 1,
        unit: "EA",
        included: true,
        origin: "DEFAULT",
      },
      {
        line_id: "bom-2",
        parent_stage: "PA",
        child_item_id: "af-1",
        item_name: "AF Main",
        mes_code: "AF-001",
        process_type_code: "AF",
        quantity: 1,
        unit: "EA",
        included: true,
        origin: "DEFAULT",
      },
      {
        line_id: "bom-3",
        parent_stage: "PA",
        child_item_id: "acc-1",
        item_name: "Cable Set",
        mes_code: "R-001",
        process_type_code: "R",
        quantity: 2,
        unit: "EA",
        included: true,
        origin: "DEFAULT",
      },
    ],
    companion_lines: [],
    checklist_lines: [
      {
        line_id: "check-1",
        item_id: "pa-1",
        item_name: "Standard PA",
        mes_code: "PA-001",
        process_type_code: "PA",
        quantity: 1,
        checked: false,
      },
      {
        line_id: "check-2",
        item_id: "acc-1",
        item_name: "Cable Set",
        mes_code: "R-001",
        process_type_code: "R",
        quantity: 2,
        checked: false,
      },
    ],
    events: [],
    latest_preparation_revision: null,
    transactions: [],
    allocations: [],
    stock_shortages: [],
    transaction_count: 0,
    ...overrides,
  };
}

function makeClient(overrides?: { gcTime?: number; staleTime?: number }) {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: overrides?.gcTime ?? 0, staleTime: overrides?.staleTime ?? 0 },
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function render(ui: ReactElement) {
  const client = makeClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return rtlRender(ui, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  realtimeMock.revision = 1;
  navigationMock.search = "tab=shipping";
  vi.mocked(api.getItems).mockResolvedValue(items);
  vi.mocked(api.getShippingRequests).mockResolvedValue([
    request({ request_id: "requested-1", status: "REQUESTED" }),
    request(),
    request({ request_id: "prepared-1", status: "PREPARED", prepared_at: "2026-06-26T01:00:00Z" }),
    request({
      request_id: "hist-1",
      status: "PICKED_UP",
      final_pa_item_id: "pa-1",
      final_pa_item_name: "Standard PA",
      final_pf_item_id: "pf-1",
      final_pf_item_name: "Standard PF",
      picked_up_at: "2026-06-26T01:00:00Z",
      transactions: [
        {
          log_id: "tx-1",
          item_id: "pf-1",
          item_name: "Standard PF",
          mes_code: "PF-001",
          item_process_type_code: "PF",
          transaction_type: "SHIP",
          quantity_change: -1,
          quantity_before: 1,
          quantity_after: 0,
          warehouse_qty_before: 1,
          warehouse_qty_after: 0,
          reference_no: "SHIP-req",
          produced_by: "shipping",
          notes: "final PF shipped",
          shipping_phase: "PICKUP",
          created_at: "2026-06-26T01:00:00Z",
          cancelled: false,
          cancel_reason: null,
          cancelled_at: null,
          inventory_effect: [{ scope: "warehouse", delta: -1 }],
        },
      ],
      transaction_count: 1,
    }),
  ]);
  vi.mocked(api.getShippingRequest).mockImplementation(async (requestId: string) =>
    request({ request_id: requestId }),
  );
  vi.mocked(api.getShippingHistory).mockResolvedValue({
    requests: [request({
      request_id: "hist-1",
      status: "PICKED_UP",
      final_pa_item_id: "pa-1",
      final_pa_item_name: "Standard PA",
      final_pf_item_id: "pf-1",
      final_pf_item_name: "Standard PF",
      picked_up_at: "2026-06-26T01:00:00Z",
      transactions: [
        {
          log_id: "tx-1",
          item_id: "pf-1",
          item_name: "Standard PF",
          mes_code: "PF-001",
          item_process_type_code: "PF",
          transaction_type: "SHIP",
          quantity_change: -1,
          quantity_before: 1,
          quantity_after: 0,
          warehouse_qty_before: 1,
          warehouse_qty_after: 0,
          reference_no: "SHIP-req",
          produced_by: "shipping",
          notes: "final PF shipped",
          shipping_phase: "PICKUP",
          created_at: "2026-06-26T01:00:00Z",
          cancelled: false,
          cancel_reason: null,
          cancelled_at: null,
          inventory_effect: [{ scope: "warehouse", delta: -1 }],
        },
      ],
      transaction_count: 1,
    })],
    next_cursor: null,
    has_more: false,
  });
  vi.mocked(api.getShippingHistoryMonths).mockResolvedValue([{ year: 2026, month: 6, count: 1 }]);
  vi.mocked(api.getShippingRevisions).mockResolvedValue([]);
  vi.mocked(api.updateShippingInvoice).mockImplementation(async (requestId: string, invoiceNumber: string | null) =>
    request({ request_id: requestId, invoice_number: invoiceNumber?.trim().toUpperCase() || null }),
  );
  vi.mocked(api.getBOM).mockImplementation(async (parentId: string) => {
    if (parentId === "pf-1") {
      return [{ bom_id: "b1", parent_item_id: "pf-1", child_item_id: "pa-1", quantity: 1, unit: "EA", notes: null }];
    }
    return [
      { bom_id: "b2", parent_item_id: "pa-1", child_item_id: "af-1", quantity: 1, unit: "EA", notes: null },
      { bom_id: "b3", parent_item_id: "pa-1", child_item_id: "acc-1", quantity: 2, unit: "EA", notes: null },
    ];
  });
  vi.mocked(api.matchShippingBom).mockResolvedValue({
    matched_pa_item_id: "pa-1",
    matched_pf_item_id: null,
    matched_pa_item_name: "Standard PA",
    matched_pf_item_name: null,
    requires_pa_name: false,
    requires_pf_name: true,
  });
  vi.mocked(api.updateShippingChecklist).mockResolvedValue(request({
    checklist_lines: request().checklist_lines.map((line) => line.item_id === "acc-1" ? { ...line, checked: true } : line),
  }));
  vi.mocked(api.clearShippingChecklist).mockResolvedValue(request());
  vi.mocked(api.createShippingRequest).mockResolvedValue(request({ request_id: "new-1", status: "REQUESTED" }));
  vi.mocked(api.updateShippingRequest).mockResolvedValue(request({ request_id: "requested-1", status: "REQUESTED" }));
  vi.mocked(api.sendShippingToPrep).mockResolvedValue(request({ request_id: "requested-1", status: "PREPARING" }));
  vi.mocked(api.deleteShippingRequest).mockResolvedValue(undefined);
  vi.mocked(api.prepareShippingComplete).mockResolvedValue(request({ status: "PREPARED" }));
  vi.mocked(api.cancelShippingPrepare).mockResolvedValue(request({ status: "PREPARING" }));
  vi.mocked(api.completeShippingPickup).mockResolvedValue(request({ request_id: "req-1", status: "PICKED_UP" }));
  vi.mocked(api.cancelShippingPickup).mockResolvedValue(request({ request_id: "req-1", status: "PREPARED", picked_up_at: null }));
});

describe("DesktopShippingView", () => {
  async function openHubCard(container: HTMLElement, id: "request" | "history") {
    let button: Element | null = null;
    await waitFor(() => {
      button = container.querySelector(`[data-shipping-hub-card="${id}"]`);
      expect(button).toBeTruthy();
    });
    fireEvent.click(button as HTMLElement);
  }

  async function openShippingManagement(container: HTMLElement) {
    await openHubCard(container, "request");
  }

  async function openNewRequest(container: HTMLElement) {
    let button: Element | null = null;
    await waitFor(() => {
      button = container.querySelector('[data-primary-action="new-shipping-request"]');
      expect(button).toBeTruthy();
    });
    fireEvent.click(button as HTMLElement);
  }

  async function openRequestById(container: HTMLElement, requestId: string) {
    let button: Element | null = null;
    await waitFor(() => {
      button = container.querySelector(`[data-shipping-request-id="${requestId}"]`);
      expect(button).toBeTruthy();
    });
    fireEvent.click(button as HTMLElement);
  }

  function nextStep(container: HTMLElement) {
    const button = container.querySelector('[data-testid="shipping-wizard-next"]');
    expect(button).toBeTruthy();
    fireEvent.click(button as HTMLElement);
  }

  async function selectBasePf() {
    const input = await screen.findByTestId("shipping-pf-search");
    fireEvent.change(input, { target: { value: "Standard" } });
    fireEvent.click(await screen.findByTestId("shipping-pf-option-pf-1"));
  }

  async function addCompanionItem() {
    const input = await screen.findByTestId("shipping-companion-search");
    fireEvent.change(input, { target: { value: "Carton" } });
    fireEvent.click(await screen.findByTestId("shipping-companion-add-carton-1"));
  }

  it("loads the shipping hub without waiting for items or history", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    expect(api.getShippingRequests).toHaveBeenCalledTimes(1);
    expect(api.getItems).not.toHaveBeenCalled();
    expect(api.getShippingHistory).not.toHaveBeenCalled();
  });

  it("keeps the shipping hub mounted while the first request fetch is pending", () => {
    vi.mocked(api.getShippingRequests).mockReturnValue(new Promise(() => {}));

    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    expect(screen.queryByText("출하 데이터를 불러오는 중입니다.")).not.toBeInTheDocument();
    expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy();
  });

  it("loads PF candidates separately and delays the full item list until PF selection", async () => {
    vi.mocked(api.getItems).mockImplementation(async (params?: any) => {
      if (params?.process_type_code === "PF") return [items[0]];
      if (params?.limit === 2000) return items;
      return items;
    });
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await waitFor(() => expect(screen.getByTestId("shipping-request-list-panel")).toBeInTheDocument());
    await openNewRequest(container);

    expect(await screen.findByTestId("shipping-pf-option-pf-1")).toBeInTheDocument();
    expect(api.getItems).toHaveBeenCalledWith({ process_type_code: "PF", limit: 2000 });
    expect(api.getItems).not.toHaveBeenCalledWith({ limit: 2000 });

    fireEvent.click(screen.getByTestId("shipping-pf-option-pf-1"));

    await waitFor(() => expect(api.getItems).toHaveBeenCalledWith({ limit: 2000 }));
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
  });

  it("refreshes loaded PF candidates when the first realtime snapshot arrives without resetting the request draft", async () => {
    const refreshedPf = item("pf-2", "Realtime PF", "PF", "PF-002");
    let pfLoads = 0;
    vi.mocked(api.getItems).mockImplementation(async (params?: any) => {
      if (params?.process_type_code === "PF") {
        pfLoads += 1;
        return pfLoads === 1 ? [items[0]] : [items[0], refreshedPf];
      }
      return items;
    });
    realtimeMock.revision = null;
    const { container, rerender } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await openHubCard(container, "request");
    await openNewRequest(container);
    const quantityInput = await screen.findByRole("spinbutton", { name: "출하 수량" });
    fireEvent.change(quantityInput, { target: { value: "7" } });
    expect(await screen.findByTestId("shipping-pf-option-pf-1")).toBeInTheDocument();

    await act(async () => {
      realtimeMock.revision = 2;
      rerender(<DesktopShippingView onStatusChange={() => {}} />);
    });

    expect(await screen.findByTestId("shipping-pf-option-pf-2")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-wizard-step-1")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "출하 수량" })).toHaveValue(7);
  });

  it("re-fetches PF candidates when a revision arrives during the initial PF request", async () => {
    const initialPfRequest = deferred<Item[]>();
    const stalePf = item("pf-stale", "Stale PF", "PF", "PF-STALE");
    const freshPf = item("pf-fresh", "Fresh PF", "PF", "PF-FRESH");
    let pfLoads = 0;
    vi.mocked(api.getItems).mockImplementation((params?: any) => {
      if (params?.process_type_code === "PF") {
        pfLoads += 1;
        return pfLoads === 1 ? initialPfRequest.promise : Promise.resolve([freshPf]);
      }
      return Promise.resolve(items);
    });
    realtimeMock.revision = null;
    const { container, rerender } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await openHubCard(container, "request");
    await openNewRequest(container);
    await waitFor(() => expect(pfLoads).toBe(1));

    await act(async () => {
      realtimeMock.revision = 2;
      rerender(<DesktopShippingView onStatusChange={() => {}} />);
    });
    expect(pfLoads).toBe(1);
    await act(async () => {
      initialPfRequest.resolve([stalePf]);
    });

    await waitFor(() => expect(pfLoads).toBe(2));
    expect(await screen.findByTestId("shipping-pf-option-pf-fresh")).toBeInTheDocument();
    expect(screen.queryByTestId("shipping-pf-option-pf-stale")).not.toBeInTheDocument();
  });

  it("re-fetches the full catalog when a revision arrives during the initial full request", async () => {
    const initialFullRequest = deferred<Item[]>();
    const freshPa = item("pa-fresh", "Fresh PA", "PA", "PA-FRESH");
    let fullLoads = 0;
    vi.mocked(api.getItems).mockImplementation((params?: any) => {
      if (params?.process_type_code === "PF") return Promise.resolve([items[0]]);
      if (params?.limit === 2000) {
        fullLoads += 1;
        return fullLoads === 1 ? initialFullRequest.promise : Promise.resolve([...items, freshPa]);
      }
      return Promise.resolve(items);
    });
    realtimeMock.revision = null;
    const { container, rerender } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(fullLoads).toBe(1));

    await act(async () => {
      realtimeMock.revision = 2;
      rerender(<DesktopShippingView onStatusChange={() => {}} />);
    });
    expect(fullLoads).toBe(1);
    await act(async () => {
      initialFullRequest.resolve(items);
    });

    await waitFor(() => expect(fullLoads).toBe(2));
    nextStep(container);
    fireEvent.change(await screen.findByTestId("shipping-bom-search-pf"), { target: { value: "Fresh PA" } });
    expect(await screen.findByTestId("shipping-bom-add-pf-pa-fresh")).toBeInTheDocument();
  });

  it("applies a successful full catalog refresh when the PF refresh fails", async () => {
    const refreshedPa = item("pa-realtime", "Realtime PA", "PA", "PA-REALTIME");
    let pfLoads = 0;
    let fullLoads = 0;
    vi.mocked(api.getItems).mockImplementation(async (params?: any) => {
      if (params?.process_type_code === "PF") {
        pfLoads += 1;
        if (pfLoads === 1) return [items[0]];
        throw new Error("PF refresh failed");
      }
      if (params?.limit === 2000) {
        fullLoads += 1;
        return fullLoads === 1 ? items : [...items, refreshedPa];
      }
      return items;
    });
    const { container, rerender } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(fullLoads).toBe(1));
    fireEvent.change(screen.getByRole("spinbutton", { name: "출하 수량" }), { target: { value: "7" } });

    await act(async () => {
      realtimeMock.revision = 2;
      rerender(<DesktopShippingView onStatusChange={() => {}} />);
    });
    await waitFor(() => expect(fullLoads).toBe(2));
    await waitFor(() => expect(pfLoads).toBe(2));
    expect(screen.getByRole("spinbutton", { name: "출하 수량" })).toHaveValue(7);

    nextStep(container);
    fireEvent.change(await screen.findByTestId("shipping-bom-search-pf"), { target: { value: "Realtime PA" } });
    expect(await screen.findByTestId("shipping-bom-add-pf-pa-realtime")).toBeInTheDocument();
  });

  it("applies both catalog refreshes when the PF response changes length first", async () => {
    const pfRefresh = deferred<Item[]>();
    const fullRefresh = deferred<Item[]>();
    const freshPf = item("pf-both-fresh", "Both Fresh PF", "PF", "PF-BOTH");
    const freshPa = item("pa-both-fresh", "Both Fresh PA", "PA", "PA-BOTH");
    let pfLoads = 0;
    let fullLoads = 0;
    vi.mocked(api.getItems).mockImplementation((params?: any) => {
      if (params?.process_type_code === "PF") {
        pfLoads += 1;
        return pfLoads === 1 ? Promise.resolve([items[0]]) : pfRefresh.promise;
      }
      if (params?.limit === 2000) {
        fullLoads += 1;
        return fullLoads === 1 ? Promise.resolve(items) : fullRefresh.promise;
      }
      return Promise.resolve(items);
    });
    const { container, rerender } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(fullLoads).toBe(1));

    await act(async () => {
      realtimeMock.revision = 2;
      rerender(<DesktopShippingView onStatusChange={() => {}} />);
    });
    await waitFor(() => expect(pfLoads).toBe(2));
    await waitFor(() => expect(fullLoads).toBe(2));

    await act(async () => {
      pfRefresh.resolve([items[0], freshPf]);
    });
    fireEvent.change(screen.getByTestId("shipping-pf-search"), { target: { value: "Both Fresh PF" } });
    expect(await screen.findByTestId("shipping-pf-option-pf-both-fresh")).toBeInTheDocument();
    await act(async () => {
      fullRefresh.resolve([...items, freshPa]);
    });

    nextStep(container);
    fireEvent.change(await screen.findByTestId("shipping-bom-search-pf"), { target: { value: "Both Fresh PA" } });
    expect(await screen.findByTestId("shipping-bom-add-pf-pa-both-fresh")).toBeInTheDocument();
  });

  it("shows a loading state while PF candidates are loading", async () => {
    let resolvePfItems: (value: Item[]) => void = () => {};
    const pfItemsPromise = new Promise<Item[]>((resolve) => {
      resolvePfItems = resolve;
    });
    vi.mocked(api.getItems).mockImplementation((params?: any) => {
      if (params?.process_type_code === "PF") return pfItemsPromise;
      return Promise.resolve(items);
    });
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);

    expect(await screen.findByText("PF 후보를 불러오는 중입니다.")).toBeInTheDocument();

    resolvePfItems([items[0]]);

    expect(await screen.findByTestId("shipping-pf-option-pf-1")).toBeInTheDocument();
  });

  it("renders full-height hub cards", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    const requestCard = container.querySelector('[data-shipping-hub-card="request"]') as HTMLElement;
    expect(requestCard.className).toContain("h-full");
    expect(requestCard.className).toContain("min-h-[360px]");
    expect(screen.queryByText("작업 선택")).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="shipping-hub-accent"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-shipping-hub-card="prep"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-shipping-hub-card="history"]')).toBeTruthy();
  });

  it("does not show item conversion in the shipping hub", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    expect(container.querySelector('[data-shipping-hub-card="componentChange"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="shipping-hub-count-componentChange"]')).not.toBeInTheDocument();
  });
  it("keeps a single primary new-request action in the empty request list", async () => {
    vi.mocked(api.getShippingRequests).mockResolvedValue([]);
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");

    await waitFor(() => expect(screen.getByTestId("shipping-request-list-panel")).toBeInTheDocument());
    expect(container.querySelectorAll('[data-primary-action="new-shipping-request"]')).toHaveLength(1);
    expect(screen.getAllByText("출하 관리")).toHaveLength(1);
    expect(screen.queryByTestId("shipping-request-empty-action")).not.toBeInTheDocument();
  });

  it("opens a full-width wizard that shows one request task at a time", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);

    expect(await screen.findByTestId("shipping-wizard-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-request-work-shell")).toHaveClass("flex-1");
    expect(screen.queryByTestId("shipping-wizard-step-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shipping-wizard-step-4")).not.toBeInTheDocument();
  });

  it("uses a minimum-one stepper for shipping quantity", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);

    const quantityInput = await screen.findByRole("spinbutton", { name: "출하 수량" });
    expect(screen.getByRole("button", { name: "-10" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "-1" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "+1" }));
    expect(quantityInput).toHaveValue(2);
    fireEvent.click(screen.getByRole("button", { name: "+10" }));
    expect(quantityInput).toHaveValue(12);
    fireEvent.click(screen.getByRole("button", { name: "-10" }));
    expect(quantityInput).toHaveValue(2);
    fireEvent.click(screen.getByRole("button", { name: "-1" }));
    expect(quantityInput).toHaveValue(1);

    fireEvent.change(quantityInput, { target: { value: "0" } });
    expect(quantityInput).toHaveValue(1);
  });

  it("moves through all five steps and allows an empty invoice through PREPARING", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));

    nextStep(container);
    expect(await screen.findByTestId("shipping-wizard-step-2")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-bom-editor-pa")).toBeInTheDocument();
    expect(screen.queryByTestId("shipping-request-info-fields")).not.toBeInTheDocument();
    await addCompanionItem();

    nextStep(container);
    expect(await screen.findByTestId("shipping-wizard-step-3")).toBeInTheDocument();
    await waitFor(() => expect(api.matchShippingBom).toHaveBeenCalled());
    fireEvent.change(await screen.findByTestId("shipping-new-pf-name"), { target: { value: "Custom PF" } });

    nextStep(container);
    expect(await screen.findByTestId("shipping-wizard-step-4")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-request-info-fields")).toBeInTheDocument();

    nextStep(container);
    expect(await screen.findByTestId("shipping-wizard-step-5")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("shipping-send-to-prep"));

    await waitFor(() => {
      expect(api.createShippingRequest).toHaveBeenCalledWith(expect.objectContaining({ custom_pf_name: "Custom PF", invoice_number: null }));
      expect(api.sendShippingToPrep).toHaveBeenCalledWith("new-1");
    });
  });

  it("opens existing request edits directly on the BOM step", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openRequestById(container, "requested-1");
    expect(await screen.findByTestId("shipping-request-detail")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("shipping-edit-request"));
    expect(await screen.findByTestId("shipping-wizard-step-2")).toBeInTheDocument();
  });

  it("does not show a duplicate preparing notice while a request is edited", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openRequestById(container, "req-1");
    fireEvent.click(await screen.findByTestId("shipping-edit-request"));

    expect(screen.queryByTestId("shipping-edit-scope-notice")).not.toBeInTheDocument();
  });

  it("shows PF and PA BOM groups, then carries excluded lines into send-to-prep save", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openRequestById(container, "requested-1");
    fireEvent.click(await screen.findByTestId("shipping-edit-request"));

    expect(await screen.findByTestId("shipping-wizard-step-2")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-bom-editor-pf")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-bom-editor-pa")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Cable Set/ }));
    expect(container.querySelector('[data-bom-line-child="acc-1"][data-bom-line-included="false"]')).toBeTruthy();
    fireEvent.change(screen.getByTestId("shipping-bom-search-pa"), { target: { value: "Bracket" } });
    fireEvent.click(await screen.findByTestId("shipping-bom-add-pa-bracket-1"));
    expect(container.querySelector('[data-bom-line-child="bracket-1"][data-bom-line-origin="CUSTOM"]')).toBeTruthy();
    await addCompanionItem();

    nextStep(container);
    fireEvent.change(await screen.findByTestId("shipping-new-pf-name"), { target: { value: "Custom PF" } });
    nextStep(container);
    nextStep(container);
    fireEvent.click(screen.getByTestId("shipping-send-to-prep"));

    await waitFor(() => {
      expect(api.updateShippingRequest).toHaveBeenCalledWith(
        "requested-1",
        expect.objectContaining({
          custom_pf_name: "Custom PF",
          bom_lines: expect.arrayContaining([
            expect.objectContaining({ child_item_id: "acc-1", included: false, origin: "DEFAULT" }),
          ]),
        }),
      );
      expect(api.sendShippingToPrep).toHaveBeenCalledWith("requested-1");
    });
  });

  it("opens prep detail as a desktop summary without checklist controls", async () => {
    navigationMock.search = "tab=shipping&shippingView=prepWork&shippingRequestId=req-1";
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    const detail = await screen.findByTestId("shipping-prep-detail");
    await waitFor(() => expect(detail).toHaveTextContent("출하 수량"));
    expect(screen.getByTestId("shipping-prep-requirements")).toHaveClass("min-h-0", "flex-1");
    expect(screen.getByTestId("shipping-prep-actions")).toHaveClass("shrink-0");
    expect(detail).toHaveTextContent("총 1대 출하");
    expect(detail).toHaveTextContent("1대 기준 2 EA");
    expect(detail).toHaveTextContent("총 필요 2 EA");
    expect(screen.queryByTestId("shipping-check-acc-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shipping-clear-checklist")).not.toBeInTheDocument();
    expect(api.updateShippingChecklist).not.toHaveBeenCalled();
    expect(api.clearShippingChecklist).not.toHaveBeenCalled();
    expect(container.querySelector('[data-shipping-hub-card="prep"]')).not.toBeInTheDocument();
  });

  it("does not expose the abolished linked IO action on a preparing shipping request", async () => {
    navigationMock.search = "tab=shipping&shippingView=prepWork&shippingRequestId=req-1";
    const onStartPrepareWork = vi.fn();
    const legacyProps = {
      onStatusChange: () => {},
      onStartPrepareWork,
    } as ComponentProps<typeof DesktopShippingView>;
    render(
      <DesktopShippingView {...legacyProps} />,
    );

    const detail = await screen.findByTestId("shipping-prep-detail");
    await waitFor(() => expect(detail).toHaveTextContent("Standard PF"));
    expect(screen.queryByRole("button", { name: "준비 작업 시작" })).not.toBeInTheDocument();
    expect(onStartPrepareWork).not.toHaveBeenCalled();
  });

  it("shows stock shortages in prep detail without hiding prep actions", async () => {
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({
        request_id: "prep-short-1",
        status: "PREPARING",
        companion_lines: [
          {
            line_id: "companion-1",
            item_id: "carton-1",
            item_name: "Carton Box",
            mes_code: "R-BOX",
            process_type_code: "R",
            quantity: 1,
            unit: "EA",
          },
        ],
        stock_shortages: [
          {
            item_id: "pf-1",
            item_name: "Standard PF",
            mes_code: "PF-001",
            process_type_code: "PF",
            department: "출하",
            required_quantity: 1,
            current_quantity: 0,
            allocated_quantity: 0,
            available_quantity: 0,
            shortage_quantity: 1,
            phase: "PREPARE",
          },
          {
            item_id: "pa-1",
            item_name: "Short PA",
            mes_code: "PA-001",
            process_type_code: "PA",
            department: "출하",
            required_quantity: 2,
            current_quantity: 0,
            allocated_quantity: 0,
            available_quantity: 0,
            shortage_quantity: 2,
            phase: "PREPARE",
          },
          {
            item_id: "acc-1",
            item_name: "Cable Set",
            mes_code: "R-001",
            process_type_code: "R",
            department: "출하",
            required_quantity: 2,
            current_quantity: 0,
            allocated_quantity: 0,
            available_quantity: 0,
            shortage_quantity: 2,
            phase: "PREPARE",
          },
          {
            item_id: "carton-1",
            item_name: "Carton Box",
            mes_code: "R-BOX",
            process_type_code: "R",
            department: "출하",
            required_quantity: 1,
            current_quantity: 0,
            allocated_quantity: 0,
            available_quantity: 0,
            shortage_quantity: 1,
            phase: "PREPARE",
          },
        ],
      }),
    ]);
    navigationMock.search = "tab=shipping&shippingView=prepWork&shippingRequestId=prep-short-1";
    render(<DesktopShippingView onStatusChange={() => {}} />);

    const warning = await screen.findByTestId("shipping-stock-shortages");
    expect(warning).toHaveTextContent("Short PA");
    expect(screen.getByTestId("shipping-shortage-summary-pf-1")).toHaveTextContent("출하품");
    expect(screen.getByTestId("shipping-shortage-summary-pa-1")).toHaveTextContent("PF 구성품");
    expect(screen.getByTestId("shipping-shortage-summary-acc-1")).toHaveTextContent("PA 구성품");
    expect(screen.getByTestId("shipping-shortage-summary-carton-1")).toHaveTextContent("동반 출하품");
    expect(screen.getByTestId("shipping-prep-line-pa-1")).toHaveAttribute("data-shortage", "true");
    expect(screen.getByTestId("shipping-shortage-kind-pa-1")).toHaveTextContent("PF 구성품");
    expect(screen.getByTestId("shipping-shortage-badge-pa-1")).toHaveTextContent("2 EA 부족");
    expect(warning).not.toHaveTextContent("필요 2");
    expect(warning).not.toHaveTextContent("가용 0");
  });


  it("opens shipping history details with linked transaction logs", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="history"]')).toBeTruthy());
    await openHubCard(container, "history");
    expect(await screen.findByTestId("shipping-history-list")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Standard PF/ }));

    expect(await screen.findByTestId("shipping-history-detail")).toBeInTheDocument();
    expect(screen.queryByText("SHIP-req")).not.toBeInTheDocument();
    expect(screen.getAllByText("픽업 완료").length).toBeGreaterThan(0);
  });

  it("refreshes the current shipping history page when the first realtime snapshot arrives", async () => {
    const picked = request({
      request_id: "realtime-history",
      status: "PICKED_UP",
      invoice_number: "INV-BEFORE",
      picked_up_at: "2026-06-26T01:00:00Z",
    });
    navigationMock.search = "tab=shipping&shippingView=historyList&shippingHistoryStatus=PICKED_UP";
    vi.mocked(api.getShippingRequests).mockResolvedValue([]);
    vi.mocked(api.getShippingHistory).mockResolvedValue({ requests: [picked], next_cursor: null, has_more: false });
    realtimeMock.revision = null;
    const { rerender } = render(<DesktopShippingView onStatusChange={() => {}} />);

    expect(await screen.findByTestId("shipping-history-list")).toBeInTheDocument();
    await waitFor(() => expect(api.getShippingHistoryMonths).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.getShippingHistory).toHaveBeenCalledTimes(1));

    await act(async () => {
      realtimeMock.revision = 2;
      rerender(<DesktopShippingView onStatusChange={() => {}} />);
    });

    await waitFor(() => expect(api.getShippingHistoryMonths).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.getShippingHistory).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("shipping-history-list")).toBeInTheDocument();
  });

  it("keeps an applied history search and avoids a duplicate overview fetch on realtime refresh", async () => {
    navigationMock.search = "tab=shipping&shippingView=historyList&shippingHistoryStatus=PICKED_UP";
    const initial = request({ request_id: "search-initial", status: "PICKED_UP", invoice_number: "INV-INITIAL", picked_up_at: "2026-07-01T01:00:00Z" });
    const searched = request({ request_id: "search-kept", status: "PICKED_UP", invoice_number: "INV-KEEP", picked_up_at: "2026-07-02T01:00:00Z" });
    const refreshed = request({ request_id: "search-fresh", status: "PICKED_UP", invoice_number: "INV-KEEP-FRESH", picked_up_at: "2026-07-03T01:00:00Z" });
    const revisionSearch = deferred<{ requests: ShippingRequest[]; next_cursor: null; has_more: false }>();
    let searchLoads = 0;
    vi.mocked(api.getShippingHistoryMonths).mockResolvedValue([{ year: 2026, month: 7, count: 1 }]);
    vi.mocked(api.getShippingHistory).mockImplementation(async (params?: any) => {
      if (params?.q === "INV-KEEP") {
        searchLoads += 1;
        return searchLoads === 1
          ? { requests: [searched], next_cursor: null, has_more: false }
          : revisionSearch.promise;
      }
      return { requests: [initial], next_cursor: null, has_more: false };
    });
    const { rerender } = render(<DesktopShippingView onStatusChange={() => {}} />);

    expect(await screen.findByText(/INV-INITIAL/)).toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "출하 이력 검색" });
    fireEvent.change(search, { target: { value: "INV-KEEP" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(await screen.findByText(/INV-KEEP/)).toBeInTheDocument();

    realtimeMock.revision = 2;
    rerender(<DesktopShippingView onStatusChange={() => {}} />);
    await waitFor(() => expect(searchLoads).toBe(2));
    await act(async () => {
      revisionSearch.resolve({ requests: [refreshed], next_cursor: null, has_more: false });
      await revisionSearch.promise;
      await Promise.resolve();
    });

    expect(screen.getByRole("searchbox", { name: "출하 이력 검색" })).toHaveValue("INV-KEEP");
    expect(screen.getByText(/INV-KEEP-FRESH/)).toBeInTheDocument();
    expect(api.getShippingHistoryMonths).toHaveBeenCalledTimes(1);
    expect(api.getShippingHistory).toHaveBeenCalledTimes(3);
  });

  it("keeps the selected history month and avoids a duplicate overview fetch on realtime refresh", async () => {
    navigationMock.search = "tab=shipping&shippingView=historyList&shippingHistoryStatus=PICKED_UP";
    vi.mocked(api.getShippingHistoryMonths).mockResolvedValue([
      { year: 2026, month: 7, count: 1 },
      { year: 2026, month: 6, count: 1 },
    ]);
    vi.mocked(api.getShippingHistory).mockImplementation(async (params?: any) => ({
      requests: [request({
        request_id: `history-${params?.month ?? "overview"}`,
        status: "PICKED_UP",
        invoice_number: `INV-${params?.month ?? "OVERVIEW"}`,
        picked_up_at: params?.month === 6 ? "2026-06-20T01:00:00Z" : "2026-07-20T01:00:00Z",
      })],
      next_cursor: null,
      has_more: false,
    }));
    const { rerender } = render(<DesktopShippingView onStatusChange={() => {}} />);

    const june = await screen.findByText("6월 · 1건", { selector: "summary" });
    fireEvent.click(june);
    await waitFor(() => expect(june.closest("details")).toHaveAttribute("open"));
    await waitFor(() => expect(api.getShippingHistory).toHaveBeenCalledTimes(2));

    await act(async () => {
      realtimeMock.revision = 2;
      rerender(<DesktopShippingView onStatusChange={() => {}} />);
      await Promise.resolve();
    });
    await waitFor(() => expect(api.getShippingHistory).toHaveBeenCalledTimes(3));

    expect(screen.getByText("6월 · 1건", { selector: "summary" }).closest("details")).toHaveAttribute("open");
    expect(api.getShippingHistoryMonths).toHaveBeenCalledTimes(2);
    expect(api.getShippingHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "PICKED_UP", year: 2026, month: 6, limit: 50 }),
    );
  });

  it("keeps a realtime history detail request alive while the refreshed page resolves", async () => {
    const stale = request({ request_id: "detail-race", status: "PICKED_UP", invoice_number: "INV-STALE", picked_up_at: "2026-07-20T01:00:00Z" });
    const pageRefresh = deferred<{ requests: ShippingRequest[]; next_cursor: null; has_more: false }>();
    const detailRefresh = deferred<ShippingRequest>();
    let detailSignal: AbortSignal | undefined;
    navigationMock.search = "tab=shipping&shippingView=historyWork&shippingRequestId=detail-race&shippingHistoryStatus=PICKED_UP";
    vi.mocked(api.getShippingRequests).mockResolvedValue([stale]);
    vi.mocked(api.getShippingHistoryMonths).mockResolvedValue([{ year: 2026, month: 7, count: 1 }]);
    vi.mocked(api.getShippingHistory).mockImplementation(() => (
      realtimeMock.revision === 2
        ? pageRefresh.promise
        : Promise.resolve({ requests: [stale], next_cursor: null, has_more: false })
    ));
    vi.mocked(api.getShippingRequest).mockImplementation((_requestId, options) => {
      if (realtimeMock.revision === 2) {
        detailSignal = options?.signal;
        return detailRefresh.promise;
      }
      return Promise.resolve(stale);
    });
    const { rerender } = render(<DesktopShippingView onStatusChange={() => {}} />);

    const detail = await screen.findByTestId("shipping-history-detail");
    expect(await within(detail).findByRole("textbox", { name: "인보이스 번호" })).toHaveValue("INV-STALE");
    const historyCallsBeforeRevision = vi.mocked(api.getShippingHistory).mock.calls.length;
    const detailCallsBeforeRevision = vi.mocked(api.getShippingRequest).mock.calls.length;

    realtimeMock.revision = 2;
    rerender(<DesktopShippingView onStatusChange={() => {}} />);
    await waitFor(() => expect(api.getShippingRequest).toHaveBeenCalledTimes(detailCallsBeforeRevision + 1));
    await waitFor(() => expect(api.getShippingHistory).toHaveBeenCalledTimes(historyCallsBeforeRevision + 1));

    await act(async () => pageRefresh.resolve({ requests: [stale], next_cursor: null, has_more: false }));
    expect(detailSignal?.aborted).toBe(false);
    await act(async () => detailRefresh.resolve({ ...stale, invoice_number: "INV-FRESH" }));

    expect(within(detail).getByRole("textbox", { name: "인보이스 번호" })).toHaveValue("INV-FRESH");
    expect(screen.getByTestId("shipping-history-detail")).toBeInTheDocument();
  });

  it("shows shipping management and history as the only shipping hub choices", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());

    expect(container.querySelector('[data-shipping-hub-card="request"]')).toHaveTextContent("출하 관리");
    expect(container.querySelector('[data-shipping-hub-card="history"]')).toHaveTextContent("출하 이력");
    expect(container.querySelector('[data-shipping-hub-card="prep"]')).not.toBeInTheDocument();
  });

  it("does not expose request ids in request list or detail text", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await waitFor(() => expect(screen.getByTestId("shipping-request-list-panel")).toBeInTheDocument());
    expect(screen.queryByText(/requested-1/)).not.toBeInTheDocument();

    await openRequestById(container, "requested-1");
    expect(await screen.findByTestId("shipping-request-detail")).toBeInTheDocument();
    expect(screen.queryByText(/requested-1/)).not.toBeInTheDocument();
  });

  it("emphasizes parsed summary-code kinds and aligns quantities in request detail", async () => {
    const codedRequest = request({
      request_id: "detail-codes",
      bom_lines: request().bom_lines.map((line) => (
        line.line_id === "bom-1" ? { ...line, mes_code: "34-PR-0051" } :
          line.line_id === "bom-2" ? { ...line, mes_code: "3-AF-0018" } :
            line.line_id === "bom-3" ? { ...line, mes_code: "9-PF-0007" } : line
      )),
    });
    vi.mocked(api.getShippingRequests).mockResolvedValue([codedRequest]);
    navigationMock.search = "tab=shipping&shippingView=requestDetail&shippingRequestId=detail-codes";

    render(<DesktopShippingView onStatusChange={() => {}} />);

    expect(await screen.findByTestId("shipping-summary-code-bom-1-PF-kind")).toHaveTextContent("PR");
    expect(screen.getByTestId("shipping-summary-code-bom-2-PA-kind")).toHaveTextContent("AF");
    expect(screen.getByTestId("shipping-summary-code-bom-3-PA-kind")).toHaveTextContent("PF");
    expect(screen.getByTestId("shipping-summary-code-bom-1-PF-kind")).toHaveStyle({ color: "var(--c-process-pr)" });
    expect(screen.getByTestId("shipping-summary-code-bom-2-PA-kind")).toHaveStyle({ color: "var(--c-process-af)" });
    expect(screen.getByTestId("shipping-summary-code-bom-3-PA-kind")).toHaveStyle({ color: "var(--c-process-pf)" });
    expect(screen.getByTestId("shipping-summary-quantity-bom-1-PF")).toHaveTextContent("1 EA");
    expect(screen.getByTestId("shipping-summary-quantity-bom-1-PF")).toHaveClass("tabular-nums");
  });

  it("can send an existing requested detail to prep", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openRequestById(container, "requested-1");

    fireEvent.click(await screen.findByTestId("shipping-detail-send-to-prep"));

    await waitFor(() => {
      expect(api.sendShippingToPrep).toHaveBeenCalledWith("requested-1");
    });
  });

  it("can delete an existing requested detail after confirmation", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openRequestById(container, "requested-1");

    fireEvent.click(await screen.findByTestId("shipping-delete-request"));
    fireEvent.click(await screen.findByRole("button", { name: "확인 후 실행" }));

    await waitFor(() => {
      expect(api.deleteShippingRequest).toHaveBeenCalledWith("requested-1");
      expect(screen.getByTestId("shipping-request-list-panel")).toBeInTheDocument();
    });
  });
  it("locks prepared requests in detail view", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openRequestById(container, "prepared-1");

    expect(await screen.findByTestId("shipping-request-detail")).toBeInTheDocument();
    expect(screen.queryByTestId("shipping-edit-request")).not.toBeInTheDocument();
  });
  it("syncs shipping subviews to URL history", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");

    await waitFor(() => {
      expect(navigationMock.push).toHaveBeenCalledWith(expect.stringContaining("shippingView=requestList"), expect.any(Object));
    });

    await openRequestById(container, "requested-1");

    await waitFor(() => {
      expect(navigationMock.push).toHaveBeenCalledWith(expect.stringContaining("shippingView=requestDetail"), expect.any(Object));
      expect(navigationMock.push).toHaveBeenCalledWith(expect.stringContaining("shippingRequestId=requested-1"), expect.any(Object));
    });
  });

  it("uses PICKED_UP in the detail URL when pickup completes from cancelled history state", async () => {
    navigationMock.search = "tab=shipping&shippingView=historyList&shippingHistoryStatus=CANCELLED";
    vi.mocked(api.completeShippingPickup).mockResolvedValue(request({
      request_id: "prepared-1",
      status: "PICKED_UP",
      picked_up_at: "2026-07-24T01:00:00Z",
    }));
    vi.mocked(api.getShippingHistory).mockResolvedValue({ requests: [], next_cursor: null, has_more: false });
    const { container, rerender } = render(<DesktopShippingView onStatusChange={() => {}} />);

    expect(await screen.findByRole("button", { name: "요청 취소" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "작업 선택으로 돌아가기" }));
    await openHubCard(container, "request");
    await openRequestById(container, "prepared-1");
    fireEvent.click(await screen.findByTestId("shipping-pickup-from-detail"));
    fireEvent.click(await screen.findByRole("button", { name: "확인 후 실행" }));

    await waitFor(() => expect(api.completeShippingPickup).toHaveBeenCalledWith("prepared-1"));
    const detailUrls = navigationMock.push.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes("shippingView=historyWork") && url.includes("shippingRequestId=prepared-1"));
    expect(detailUrls.at(-1)).toContain("shippingHistoryStatus=PICKED_UP");
    rerender(<DesktopShippingView onStatusChange={() => {}} />);
    expect(detailUrls.some((url) => url.includes("shippingHistoryStatus=CANCELLED"))).toBe(false);
  });

  it("normalizes a mismatched history detail URL to the request status once", async () => {
    navigationMock.search = "tab=shipping&shippingView=historyWork&shippingRequestId=hist-picked&shippingHistoryStatus=CANCELLED";
    const picked = request({
      request_id: "hist-picked",
      status: "PICKED_UP",
      picked_up_at: "2026-07-24T01:00:00Z",
    });
    vi.mocked(api.getShippingRequests).mockResolvedValue([picked]);
    vi.mocked(api.getShippingHistory).mockResolvedValue({ requests: [picked], next_cursor: null, has_more: false });
    const { rerender } = render(<DesktopShippingView onStatusChange={() => {}} />);

    expect(await screen.findByTestId("shipping-history-detail")).toBeInTheDocument();
    await waitFor(() => expect(navigationMock.replace).toHaveBeenCalledWith(
      expect.stringContaining("shippingHistoryStatus=PICKED_UP"),
      { scroll: false },
    ));
    const normalizedCalls = navigationMock.replace.mock.calls.filter(([url]) =>
      String(url).includes("shippingView=historyWork") && String(url).includes("shippingHistoryStatus=PICKED_UP"),
    );
    expect(normalizedCalls).toHaveLength(1);

    rerender(<DesktopShippingView onStatusChange={() => {}} />);
    await waitFor(() => expect(navigationMock.replace.mock.calls.filter(([url]) =>
      String(url).includes("shippingView=historyWork") && String(url).includes("shippingHistoryStatus=PICKED_UP"),
    )).toHaveLength(1));
  });

  it("opens the warehouse transfer with the shortage item, department, and manual intent", async () => {
    navigationMock.search = "tab=shipping&shippingView=prepWork&shippingRequestId=req-1";
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({
        stock_shortages: [{
          item_id: "pa-1",
          item_name: "Standard PA",
          mes_code: "PA-001",
          process_type_code: "PA",
          department: "조립",
          required_quantity: 1,
          current_quantity: 0,
          allocated_quantity: 0,
          available_quantity: 0,
          shortage_quantity: 1,
          phase: "PREPARE",
        }],
      }),
    ]);
    const onGoToWarehouse = vi.fn();

    render(<DesktopShippingView onStatusChange={() => {}} onGoToWarehouse={onGoToWarehouse} />);

    fireEvent.click(await screen.findByTestId("shipping-shortage-pull-pa-1"));

    await waitFor(() => expect(onGoToWarehouse).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: "pa-1" }),
      {
        workType: "warehouse_io",
        subType: "warehouse_to_dept",
        toDepartment: "조립",
        forceManualItem: true,
      },
    ));
  });

  it("cancels a picked-up history entry and returns to its preparation work", async () => {
    navigationMock.search = "tab=shipping&shippingView=historyWork&shippingRequestId=hist-picked&shippingHistoryStatus=PICKED_UP";
    const picked = request({
      request_id: "hist-picked",
      status: "PICKED_UP",
      prepared_at: "2026-07-24T00:00:00Z",
      picked_up_at: "2026-07-24T01:00:00Z",
    });
    vi.mocked(api.getShippingRequests).mockResolvedValue([picked]);
    vi.mocked(api.getShippingHistory).mockResolvedValue({ requests: [picked], next_cursor: null, has_more: false });
    vi.mocked(api.getShippingRequest).mockResolvedValue(picked);
    vi.mocked(api.cancelShippingPickup).mockResolvedValue({ ...picked, status: "PREPARED", picked_up_at: null });

    render(<DesktopShippingView onStatusChange={() => {}} />);

    fireEvent.click(await screen.findByTestId("shipping-pickup-cancel-from-history"));
    fireEvent.click(await screen.findByRole("button", { name: "확인 후 실행" }));

    await waitFor(() => expect(api.cancelShippingPickup).toHaveBeenCalledWith("hist-picked"));
    expect(navigationMock.push).toHaveBeenCalledWith(
      expect.stringContaining("shippingView=prepWork"),
      { scroll: false },
    );
    expect(navigationMock.push).toHaveBeenCalledWith(
      expect.stringContaining("shippingRequestId=hist-picked"),
      { scroll: false },
    );
  });

  it("opens shipping subviews from URL query", async () => {
    navigationMock.search = "tab=shipping&shippingView=requestDetail&shippingRequestId=requested-1";
    render(<DesktopShippingView onStatusChange={() => {}} />);

    expect(await screen.findByTestId("shipping-request-detail")).toBeInTheDocument();
    expect(screen.queryByText(/requested-1/)).not.toBeInTheDocument();
  });

  it("uses the logged-in operator as the requester for new requests", async () => {
    const operator = { name: "김현우", department: "조립" } as any;
    const { container } = render(<DesktopShippingView operator={operator} onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);
    await addCompanionItem();
    nextStep(container);
    fireEvent.change(await screen.findByTestId("shipping-new-pf-name"), { target: { value: "Custom PF" } });
    nextStep(container);
    expect(await screen.findByTestId("shipping-request-info-fields")).toHaveTextContent("김현우");
    nextStep(container);
    fireEvent.click(screen.getByTestId("shipping-send-to-prep"));

    await waitFor(() => {
      expect(api.createShippingRequest).toHaveBeenCalledWith(expect.objectContaining({ requested_by_name: "김현우" }));
    });
  });

  it("uses app-style selectors and one work header in the request editor", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);

    expect(await screen.findByTestId("shipping-work-title")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="shipping-work-title"]')).toHaveLength(1);
    expect(within(screen.getByTestId("shipping-work-title")).queryByText("출하 요청", { exact: true })).not.toBeInTheDocument();
    expect(container.querySelector("select")).not.toBeInTheDocument();
  });

  it("keeps request list column bodies on the same height rhythm", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");

    expect(await screen.findByTestId("shipping-request-column-body-REQUESTED")).toHaveClass("flex-1");
    expect(screen.getByTestId("shipping-request-column-body-PREPARING")).toHaveClass("flex-1");
    expect(screen.getByTestId("shipping-request-column-body-PREPARED")).toHaveClass("flex-1");
  });

  it("removes the request list outer frame and lets the three status columns fill the workspace", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");

    const panel = await screen.findByTestId("shipping-request-list-panel");
    expect(panel).not.toHaveClass("rounded-[24px]");
    expect(panel).not.toHaveClass("border");
    expect(panel).not.toHaveClass("p-4");
    expect(screen.getByTestId("shipping-request-list-grid")).toHaveClass("flex-1");
  });

  it("puts the new-request action inside the shipping request column", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");

    const requestedBody = await screen.findByTestId("shipping-request-column-body-REQUESTED");
    const requestedColumn = requestedBody.closest("section");
    expect(requestedColumn).toHaveTextContent("출하 요청");
    expect(requestedColumn).toHaveTextContent("새 요청 만들기");
    expect(screen.queryByText("요청됨")).not.toBeInTheDocument();
  });

  it("shows delete for preparing details and prepare-cancel for prepared details", async () => {
    navigationMock.search = "tab=shipping&shippingView=requestDetail&shippingRequestId=req-1";
    const { container, unmount } = render(<DesktopShippingView onStatusChange={() => {}} />);

    expect(await screen.findByTestId("shipping-request-detail")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-delete-request")).toBeInTheDocument();
    expect(screen.queryByTestId("shipping-detail-send-to-prep")).not.toBeInTheDocument();
    unmount();

    navigationMock.search = "tab=shipping&shippingView=requestDetail&shippingRequestId=prepared-1";
    render(<DesktopShippingView onStatusChange={() => {}} />);
    expect(await screen.findByTestId("shipping-request-detail")).toBeInTheDocument();
    const detailHeader = screen.getByTestId("shipping-request-detail-header");
    const editLock = screen.getByTestId("shipping-detail-edit-lock");
    expect(detailHeader).toContainElement(editLock);
    expect(editLock).toHaveTextContent("수정 잠김");
    expect(editLock).toHaveTextContent("준비 완료 취소 후 수정 가능");
    expect(screen.getAllByText("수정 잠김")).toHaveLength(1);
    expect(screen.getByTestId("shipping-pickup-from-detail")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-prepare-cancel-from-detail")).toBeInTheDocument();
    expect(screen.queryByTestId("shipping-delete-request")).not.toBeInTheDocument();
  });

  it("completes preparation from a preparing request detail when an invoice exists", async () => {
    navigationMock.search = "tab=shipping&shippingView=requestDetail&shippingRequestId=req-1";
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({ invoice_number: "DEX" }),
    ]);

    render(<DesktopShippingView onStatusChange={() => {}} />);

    const prepareButton = await screen.findByTestId("shipping-prepare-from-detail");
    expect(prepareButton).toBeEnabled();
    fireEvent.click(prepareButton);
    fireEvent.change(await screen.findByLabelText("완제품 SN"), { target: { value: "DETAIL-SN" } });
    fireEvent.click(await screen.findByRole("button", { name: "확인 후 실행" }));

    await waitFor(() => {
      expect(api.prepareShippingComplete).toHaveBeenCalledWith("req-1", { serial_numbers: "DETAIL-SN" });
    });
  });

  it("requires a non-blank product serial number and sends multiline input from preparation work", async () => {
    navigationMock.search = "tab=shipping&shippingView=prepWork&shippingRequestId=req-1";
    vi.mocked(api.getShippingRequests).mockResolvedValue([request({ invoice_number: "INV-READY" })]);

    render(<DesktopShippingView onStatusChange={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "준비 완료" }));
    const serialNumbers = await screen.findByLabelText("완제품 SN");
    const confirm = screen.getByRole("button", { name: "확인 후 실행" });
    expect(confirm).toBeDisabled();

    fireEvent.change(serialNumbers, { target: { value: "SN-001\nSN-002" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(api.prepareShippingComplete).toHaveBeenCalledWith("req-1", {
      serial_numbers: "SN-001\nSN-002",
    }));
  });

  it("prefills an existing serial number and sends its edited replacement", async () => {
    navigationMock.search = "tab=shipping&shippingView=requestDetail&shippingRequestId=req-1";
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({ invoice_number: "INV-READY", serial_numbers: "OLD-SN" }),
    ]);

    render(<DesktopShippingView onStatusChange={() => {}} />);

    fireEvent.click(await screen.findByTestId("shipping-prepare-from-detail"));
    const serialNumbers = await screen.findByLabelText("완제품 SN");
    expect(serialNumbers).toHaveValue("OLD-SN");
    fireEvent.change(serialNumbers, { target: { value: "NEW-SN" } });
    fireEvent.click(screen.getByRole("button", { name: "확인 후 실행" }));

    await waitFor(() => expect(api.prepareShippingComplete).toHaveBeenCalledWith("req-1", {
      serial_numbers: "NEW-SN",
    }));
  });

  it("shows product serial numbers in prepared and picked-up details, with a legacy fallback", async () => {
    const prepared = request({ request_id: "prepared-sn", status: "PREPARED", serial_numbers: "SN-A\nSN-B" });
    navigationMock.search = "tab=shipping&shippingView=requestDetail&shippingRequestId=prepared-sn";
    vi.mocked(api.getShippingRequests).mockResolvedValue([prepared]);

    const { unmount } = render(<DesktopShippingView onStatusChange={() => {}} />);

    expect(await screen.findByText(/SN-A\s+SN-B/)).toBeInTheDocument();

    const picked = request({ request_id: "picked-legacy-sn", status: "PICKED_UP", serial_numbers: null, picked_up_at: "2026-07-27T01:00:00Z" });
    unmount();
    navigationMock.search = "tab=shipping&shippingView=historyWork&shippingRequestId=picked-legacy-sn&shippingHistoryStatus=PICKED_UP";
    vi.mocked(api.getShippingRequests).mockResolvedValue([picked]);
    vi.mocked(api.getShippingHistory).mockResolvedValue({ requests: [picked], next_cursor: null, has_more: false });
    vi.mocked(api.getShippingRequest).mockResolvedValue(picked);
    render(<DesktopShippingView onStatusChange={() => {}} />);

    expect(await screen.findByText("미입력")).toBeInTheDocument();
  });

  it("shows a preparation failure inside the confirmation modal", async () => {
    navigationMock.search = "tab=shipping&shippingView=requestDetail&shippingRequestId=req-1";
    vi.mocked(api.getShippingRequests).mockResolvedValue([request({ invoice_number: "INV-READY" })]);
    vi.mocked(api.prepareShippingComplete).mockRejectedValue(new Error("SN 저장에 실패했습니다."));

    render(<DesktopShippingView onStatusChange={() => {}} />);

    fireEvent.click(await screen.findByTestId("shipping-prepare-from-detail"));
    fireEvent.change(await screen.findByLabelText("완제품 SN"), { target: { value: "SN-ERROR" } });
    fireEvent.click(screen.getByRole("button", { name: "확인 후 실행" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("SN 저장에 실패했습니다.");
  });

  it("uses the final PF as the request detail title and hides change-only BOM decoration", async () => {
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({
        request_id: "prepared-final",
        status: "PREPARED",
        base_pf_item_name: "Standard PF",
        final_pf_item_name: "Custom PF",
        final_pf_item_id: "pf-custom",
        final_pa_item_name: "Custom PA",
        bom_lines: [
          ...request().bom_lines,
          {
            line_id: "excluded-1",
            parent_stage: "PA",
            child_item_id: "bracket-1",
            item_name: "Bracket Kit",
            mes_code: "R-BR",
            process_type_code: "R",
            quantity: 1,
            unit: "EA",
            included: false,
            origin: "DEFAULT",
          },
          {
            line_id: "custom-1",
            parent_stage: "PA",
            child_item_id: "carton-1",
            item_name: "Carton Box",
            mes_code: "R-BOX",
            process_type_code: "R",
            quantity: 1,
            unit: "EA",
            included: true,
            origin: "CUSTOM",
          },
        ],
      }),
    ]);
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openRequestById(container, "prepared-final");

    const detail = await screen.findByTestId("shipping-request-detail");
    expect(detail).toHaveTextContent("Custom PF");
    expect(screen.queryByTestId("shipping-request-detail-summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Bracket Kit")).not.toBeInTheDocument();
    expect(screen.getByText("Carton Box")).toBeInTheDocument();
    expect(screen.queryByText("추가됨")).not.toBeInTheDocument();
    expect(screen.queryByText("제외됨")).not.toBeInTheDocument();
  });

  it("keeps request wizard tabs in the same header row and removes manual BOM buttons", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);

    const header = await screen.findByTestId("shipping-work-header");
    expect(header).toContainElement(screen.getByTestId("shipping-step-tabs"));
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);
    await addCompanionItem();
    nextStep(container);

    expect(await screen.findByTestId("shipping-wizard-step-3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /동일 BOM 확인/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /기본 BOM 다시 불러오기/ })).not.toBeInTheDocument();
  });

  it("adds BOM rows from search results without row selectors", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openRequestById(container, "requested-1");
    fireEvent.click(await screen.findByTestId("shipping-edit-request"));

    expect(await screen.findByTestId("shipping-wizard-step-2")).toBeInTheDocument();
    expect(screen.getAllByTestId("shipping-bom-readonly-item").length).toBeGreaterThan(0);
    expect(screen.queryByRole("combobox", { name: /품목 선택/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("shipping-add-pa-line")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("shipping-bom-search-pa"), { target: { value: "Bracket" } });
    fireEvent.click(await screen.findByTestId("shipping-bom-add-pa-bracket-1"));
    expect(screen.getAllByTestId("shipping-bom-readonly-item").some((node) => node.textContent?.includes("Bracket Kit"))).toBe(true);
    expect(screen.queryByRole("combobox", { name: /PA 구성품 추가 품목 선택/ })).not.toBeInTheDocument();
  });

  it("finds PF, BOM, and companion items without MES code delimiters", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await openHubCard(container, "request");
    await openNewRequest(container);

    fireEvent.change(await screen.findByTestId("shipping-pf-search"), { target: { value: "PF001" } });
    fireEvent.click(await screen.findByTestId("shipping-pf-option-pf-1"));
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);

    fireEvent.change(await screen.findByTestId("shipping-bom-search-pa"), { target: { value: "RBR" } });
    expect(await screen.findByTestId("shipping-bom-add-pa-bracket-1")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("shipping-companion-search"), { target: { value: "RBOX" } });
    expect(await screen.findByTestId("shipping-companion-add-carton-1")).toBeInTheDocument();
  });

  it("uses defect-style shipping hub cards without duplicate open buttons", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());

    expect(screen.queryByText("바로 열기")).not.toBeInTheDocument();
    const badge = screen.getByTestId("shipping-hub-count-request");
    expect(badge).toHaveTextContent(/\d+/);
    expect(badge.className).toContain("min-h-12");
    expect(screen.getByText("요청 생성부터 준비 체크, 픽업 완료까지 이어서 처리합니다.")).toBeInTheDocument();
  });

  it("balances the request-list header and labels request metadata explicitly", async () => {
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({ request_id: "requested-meta", status: "REQUESTED", requested_by_name: "김건호" }),
      request({ request_id: "requested-missing", status: "REQUESTED", requested_by_name: null }),
    ]);
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await openHubCard(container, "request");

    const panel = await screen.findByTestId("shipping-request-list-panel");
    expect(within(panel).queryByText(/진행 중 출하/)).not.toBeInTheDocument();
    expect(within(panel).getByText("출하 관리")).toHaveClass("text-xl");

    const named = container.querySelector('[data-shipping-request-id="requested-meta"]') as HTMLElement;
    expect(named).toHaveTextContent("요청 일시:");
    expect(named).toHaveTextContent("요청자: 김건호");
    expect(named).not.toHaveTextContent("· 김건호");

    const missing = container.querySelector('[data-shipping-request-id="requested-missing"]') as HTMLElement;
    expect(missing).toHaveTextContent("요청자: 요청자 없음");
  });

  it("keeps wizard step labels on one line and blocks invalid next navigation", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);

    expect(await screen.findByText("1. 기준 PF 선택")).toBeInTheDocument();
    expect(screen.getByText("5. 저장 및 전환")).toBeInTheDocument();
    expect(screen.queryByText("출하할 최종 PF를 먼저 선택하면 기본 PF/PA 구성이 준비됩니다.")).not.toBeInTheDocument();
    expect(screen.getByTestId("shipping-pf-search")).toBeInTheDocument();

    const next = screen.getByTestId("shipping-wizard-next") as HTMLButtonElement;
    expect(next).toBeDisabled();
    nextStep(container);
    expect(screen.getByTestId("shipping-wizard-step-1")).toBeInTheDocument();

    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    expect(screen.getByTestId("shipping-wizard-next")).not.toBeDisabled();
  });

  it("uses the step-one action bar for quantity and keeps the PF workspace unframed", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);

    const header = await screen.findByTestId("shipping-work-header");
    const tabs = screen.getByTestId("shipping-step-tabs");
    const actionBar = screen.getByTestId("shipping-wizard-action-bar");
    expect(screen.getByTestId("shipping-request-work-shell").firstElementChild).toBe(header);
    expect(header).toHaveClass("xl:grid-cols-[auto_minmax(0,1fr)_auto]");
    expect(tabs).toHaveClass("gap-1");
    expect(screen.getByTestId("shipping-wizard-content-frame")).not.toHaveClass("border");
    expect(screen.getByTestId("shipping-wizard-step-1")).not.toHaveClass("border");
    expect(actionBar).toContainElement(screen.getByRole("spinbutton", { name: "출하 수량" }));
    expect(actionBar).not.toHaveTextContent("기준 PF를 먼저 선택하세요.");
  });

  it("uses event types to repair garbled shipping history messages", async () => {
    navigationMock.search = "tab=shipping&shippingView=historyWork&shippingRequestId=hist-1";
    const eventRequest = request({
        request_id: "hist-1",
        status: "PICKED_UP",
        events: [
          {
            event_id: "event-1",
            event_type: "REQUEST_CREATED",
            message: "異쒗븯 ?붿껌 ?앹꽦",
            created_at: "2026-07-02T02:25:00Z",
          },
        ],
      });
    vi.mocked(api.getShippingRequests).mockResolvedValue([eventRequest]);
    vi.mocked(api.getShippingHistory).mockResolvedValue({ requests: [eventRequest], next_cursor: null, has_more: false });

    render(<DesktopShippingView onStatusChange={() => {}} />);

    const detail = await screen.findByTestId("shipping-history-detail");
    await waitFor(() => expect(detail).toHaveTextContent("출하 요청 생성"));
    expect(detail).not.toHaveTextContent("異쒗븯 ?붿껌 ?앹꽦");
  });

  it("shows requester as read-only information and gives memo the main request-info space", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} operator={{ name: "김현우", role: "조립" }} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);
    await addCompanionItem();
    nextStep(container);
    fireEvent.change(await screen.findByTestId("shipping-new-pf-name"), { target: { value: "Custom PF" } });
    nextStep(container);

    expect(await screen.findByTestId("shipping-request-info-fields")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-requester-summary")).toHaveTextContent("김현우");
    expect(screen.queryByLabelText("요청자")).not.toBeInTheDocument();
    expect(screen.getByLabelText("요청 메모")).toHaveClass("flex-1");
  });

  it("moves quantity changes from later steps back to step one and focuses the quantity field", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);
    await addCompanionItem();
    nextStep(container);

    expect(await screen.findByTestId("shipping-wizard-step-3")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("shipping-quantity-change"));
    expect(await screen.findByTestId("shipping-wizard-step-1")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("spinbutton", { name: "출하 수량" })).toHaveFocus());
  });

  it("prefills required PA/PF naming from the base items in the matching action bar", async () => {
    vi.mocked(api.matchShippingBom).mockResolvedValue({
      matched_pa_item_id: null,
      matched_pf_item_id: null,
      matched_pa_item_name: null,
      matched_pf_item_name: null,
      requires_pa_name: true,
      requires_pf_name: true,
      preview_pa_mes_code: "4-PA-0004",
      preview_pf_mes_code: "4-PF-0005",
    });
    const onStatusChange = vi.fn();
    const { container } = render(<DesktopShippingView onStatusChange={onStatusChange} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);

    expect(await screen.findByTestId("shipping-wizard-step-2")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-bom-editor-pa")).toHaveTextContent("Standard PF · PA 구성품");
    expect(screen.getByTestId("shipping-bom-editor-pf")).toHaveTextContent("Standard PF · PF 구성품");
    expect(screen.getByTestId("shipping-bom-title-stage-pa")).toHaveStyle({ color: "var(--c-process-pa)" });
    expect(screen.getByTestId("shipping-bom-title-stage-pf")).toHaveStyle({ color: "var(--c-process-pf)" });
    expect(screen.queryByTestId("shipping-new-pf-name")).not.toBeInTheDocument();
    expect(screen.getByTestId("shipping-wizard-action-bar")).not.toHaveTextContent("새 PA/PF 이름을 입력하세요.");

    nextStep(container);

    const paSummary = await screen.findByTestId("shipping-final-pa-summary");
    const pfSummary = await screen.findByTestId("shipping-final-pf-summary");
    await waitFor(() => expect(paSummary).toHaveTextContent("새 PA 생성 예정"));
    expect(paSummary).toHaveTextContent("Standard PA");
    expect(paSummary).toHaveTextContent("4-PA-0004");
    expect(paSummary).not.toHaveTextContent("예상 코드 · 저장 시 변경 가능");
    expect(pfSummary).toHaveTextContent("새 PF 생성 예정");
    expect(pfSummary).toHaveTextContent("Standard PF");
    expect(pfSummary).toHaveTextContent("4-PF-0005");
    expect(pfSummary).not.toHaveTextContent("예상 코드 · 저장 시 변경 가능");
    expect(screen.getByTestId("shipping-final-pa-summary-label")).toHaveStyle({ color: "var(--c-process-pa)" });
    expect(screen.getByTestId("shipping-final-pf-summary-label")).toHaveStyle({ color: "var(--c-process-pf)" });
    expect(screen.getByTestId("shipping-match-summary")).not.toHaveTextContent("기본 BOM 유지");
    const actionBar = screen.getByTestId("shipping-wizard-action-bar");
    const paNameInput = screen.getByTestId("shipping-new-pa-name");
    const pfNameInput = screen.getByTestId("shipping-new-pf-name");
    expect(actionBar).toContainElement(paNameInput);
    expect(actionBar).toContainElement(pfNameInput);
    expect(paNameInput).toHaveValue("Standard PA");
    expect(pfNameInput).toHaveValue("Standard PF");
    expect(paNameInput).toHaveAttribute("data-name-state", "reference");
    expect(pfNameInput).toHaveAttribute("data-name-state", "reference");
    const nextButton = screen.getByTestId("shipping-wizard-next");
    expect(nextButton).not.toBeDisabled();
    expect(nextButton).toHaveAttribute("aria-disabled", "false");
    expect(nextButton).toHaveAttribute("data-name-validation", "pending");

    onStatusChange.mockClear();
    fireEvent.click(nextButton);
    const validationNotice = screen.getByTestId("shipping-name-validation-notice");
    expect(validationNotice).toHaveClass("status-target-notice");
    expect(validationNotice).toHaveAttribute("role", "status");
    expect(validationNotice).toHaveAttribute("aria-live", "polite");
    expect(validationNotice).toHaveTextContent("새 PA/PF 품명을 수정하세요.");
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("shipping-wizard-step-3")).toBeInTheDocument();

    fireEvent.animationEnd(validationNotice);
    expect(onStatusChange).toHaveBeenCalledWith("새 PA/PF 품명을 수정하세요.");
    expect(screen.queryByTestId("shipping-name-validation-notice")).not.toBeInTheDocument();

    fireEvent.change(paNameInput, { target: { value: "Custom PA" } });
    fireEvent.change(pfNameInput, { target: { value: "Custom PF" } });
    expect(paNameInput).toHaveValue("Custom PA");
    expect(pfNameInput).toHaveValue("Custom PF");
    expect(paNameInput).toHaveAttribute("data-name-state", "edited");
    expect(pfNameInput).toHaveAttribute("data-name-state", "edited");
    expect(nextButton).toHaveAttribute("aria-disabled", "false");
    expect(nextButton).toHaveAttribute("data-name-validation", "ready");

    fireEvent.click(nextButton);
    expect(await screen.findByTestId("shipping-wizard-step-4")).toBeInTheDocument();
  });

  it("shows a new PA first inside the final PF list when both new item names are entered", async () => {
    vi.mocked(api.matchShippingBom).mockResolvedValue({
      matched_pa_item_id: null,
      matched_pf_item_id: null,
      matched_pa_item_name: null,
      matched_pf_item_name: null,
      requires_pa_name: true,
      requires_pf_name: true,
      preview_pa_mes_code: "4-PA-0004",
      preview_pf_mes_code: "4-PF-0005",
    });
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-2");
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-3");

    fireEvent.change(await screen.findByTestId("shipping-new-pa-name"), { target: { value: "새 PA" } });
    fireEvent.change(screen.getByTestId("shipping-new-pf-name"), { target: { value: "새 PF" } });

    expect(screen.queryByTestId("shipping-new-pf-pa-link-notice")).not.toBeInTheDocument();
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-4");
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-5");

    const newPa = screen.getByTestId("shipping-final-new-pa-link");
    const pfGroup = screen.getByTestId("shipping-final-group-pf");
    expect(pfGroup).toContainElement(newPa);
    expect(screen.getByTestId("shipping-final-group-list-pf").firstElementChild).toBe(newPa);
    expect(newPa).toHaveTextContent("새 PA");
    expect(newPa).toHaveTextContent("4-PA-0004");
    expect(newPa).not.toHaveTextContent("예상 코드 · 저장 시 변경 가능");
    expect(screen.queryByTestId("shipping-final-new-pf-link")).not.toBeInTheDocument();
    expect(screen.getByTestId("shipping-final-code-meta-new-pa")).toHaveClass("flex", "items-center", "whitespace-nowrap");
    expect(screen.getByTestId("shipping-final-group-title-pa")).toHaveTextContent("4-PA-0004");
    expect(screen.getByTestId("shipping-final-group-title-pf")).toHaveTextContent("4-PF-0005");
    expect(screen.getByTestId("shipping-final-group-title-pa")).toHaveStyle({ color: "var(--c-process-pa)" });
    expect(screen.getByTestId("shipping-final-group-title-pf")).toHaveStyle({ color: "var(--c-process-pf)" });
    expect(screen.getByTestId("shipping-final-group-title-pa")).toHaveClass("justify-between");
    expect(screen.getByTestId("shipping-shipment-hero")).toHaveTextContent("4-PF-0005");
    expect(screen.getByTestId("shipping-shipment-hero")).not.toHaveTextContent("예상 코드 · 저장 시 변경 가능");
    expect(screen.getByTestId("shipping-final-group-pa").firstElementChild).toHaveTextContent("새 PA");
  });

  it("hides the new PF-to-PA relationship when either item is reused", async () => {
    vi.mocked(api.matchShippingBom).mockResolvedValue({
      matched_pa_item_id: "pa-1",
      matched_pf_item_id: null,
      matched_pa_item_name: "Standard PA",
      matched_pf_item_name: null,
      requires_pa_name: false,
      requires_pf_name: true,
    });
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-2");
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-3");

    expect(screen.queryByTestId("shipping-new-pf-pa-link-notice")).not.toBeInTheDocument();
    fireEvent.change(await screen.findByTestId("shipping-new-pf-name"), { target: { value: "새 PF" } });
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-4");
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-5");

    expect(screen.queryByTestId("shipping-final-new-pa-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shipping-final-new-pf-link")).not.toBeInTheDocument();
    expect(screen.getByTestId("shipping-final-group-list-pf")).toContainElement(screen.getByTestId("shipping-final-line-pf-pa-1"));
  });

  it("returns a preparing request to the three-column request list after saving", async () => {
    vi.mocked(api.matchShippingBom).mockResolvedValue({
      matched_pa_item_id: "pa-1",
      matched_pf_item_id: "pf-1",
      matched_pa_item_name: "Standard PA",
      matched_pf_item_name: "Standard PF",
      requires_pa_name: false,
      requires_pf_name: false,
    });
    vi.mocked(api.updateShippingRequest).mockResolvedValue(request());
    const onStatusChange = vi.fn();
    const { container } = render(<DesktopShippingView onStatusChange={onStatusChange} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openRequestById(container, "req-1");
    fireEvent.click(await screen.findByTestId("shipping-edit-request"));
    await screen.findByTestId("shipping-wizard-step-2");
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-3");
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-4");
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-5");
    fireEvent.click(screen.getByTestId("shipping-send-to-prep"));

    await waitFor(() => {
      expect(api.updateShippingRequest).toHaveBeenCalledWith("req-1", expect.any(Object));
      expect(screen.getByTestId("shipping-request-list-panel")).toBeInTheDocument();
    });
    expect(screen.getByTestId("shipping-request-column-body-PREPARING")).toHaveTextContent("Standard PF");
    expect(onStatusChange).toHaveBeenCalledWith("출하 요청을 수정했습니다.");
  });

  it("refetches a warm revision cache after a general request edit", async () => {
    navigationMock.search = "tab=shipping&shippingView=requestDetail&shippingRequestId=req-1";
    const oldRevision = {
      revision_id: "revision-old", request_id: "req-1", edited_by_employee_id: "old",
      edited_by_name: "이전 담당자", summary: "요청 메모 수정", affects_preparation: false,
      changes: [{ field: "notes", before: null, after: "이전" }], created_at: "2026-07-24T00:00:00Z",
    };
    const latestRevision = { ...oldRevision, revision_id: "revision-latest", edited_by_employee_id: "latest", edited_by_name: "최신 담당자", created_at: "2026-07-24T01:00:00Z" };
    vi.mocked(api.getShippingRequests).mockResolvedValue([request()]);
    vi.mocked(api.updateShippingRequest).mockResolvedValue(request({ notes: "수정됨" }));
    vi.mocked(api.getShippingRevisions).mockResolvedValue([latestRevision, oldRevision]);
    const client = makeClient({ gcTime: 5 * 60_000, staleTime: 5 * 60_000 });
    client.setQueryData(queryKeys.shipping.revisions("req-1"), [oldRevision]);
    expect(client.getQueryData(queryKeys.shipping.revisions("req-1"))).toEqual([oldRevision]);
    const { container } = rtlRender(<DesktopShippingView onStatusChange={() => {}} />, {
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });

    const revisionHistory = await screen.findByTestId("shipping-revision-history");
    expect(client.getQueryData(queryKeys.shipping.revisions("req-1"))).toEqual([oldRevision]);
    expect(revisionHistory).toHaveTextContent("1건");
    expect(screen.getByText(/이전 담당자/)).toBeInTheDocument();
    fireEvent.click(await screen.findByTestId("shipping-edit-request"));
    await screen.findByTestId("shipping-wizard-step-2");
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-3");
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-4");
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-5");
    fireEvent.click(await screen.findByTestId("shipping-send-to-prep"));
    await waitFor(() => expect(screen.getByTestId("shipping-request-list-panel")).toBeInTheDocument());
    await openRequestById(container, "req-1");

    await waitFor(() => expect(api.getShippingRevisions).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/최신 담당자/)).toBeInTheDocument();
  });

  it("removes repeated headers from wizard steps two through five", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));

    nextStep(container);
    expect(await screen.findByTestId("shipping-wizard-step-2")).not.toHaveTextContent("BOM·동반품");

    nextStep(container);
    expect(await screen.findByTestId("shipping-wizard-step-3")).not.toHaveTextContent("재사용 확인");

    nextStep(container);
    expect(await screen.findByTestId("shipping-wizard-step-4")).not.toHaveTextContent("요청자와 메모를 확인합니다.");

    nextStep(container);
    expect(await screen.findByTestId("shipping-wizard-step-5")).not.toHaveTextContent("최종 확인");
  });

  it("uses direct workspaces for matching, request information, and final review", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));

    nextStep(container);
    nextStep(container);

    const matchStep = await screen.findByTestId("shipping-wizard-step-3");
    expect(matchStep).not.toHaveClass("border");
    expect(matchStep).not.toHaveTextContent("BOM 상태");
    expect(screen.getByTestId("shipping-match-summary").parentElement).toHaveClass("gap-4");
    expect(screen.getByTestId("shipping-match-summary")).toHaveClass("md:grid-cols-2");
    expect(screen.getByTestId("shipping-match-summary").children).toHaveLength(2);

    nextStep(container);
    expect(await screen.findByTestId("shipping-wizard-step-4")).not.toHaveClass("border");

    nextStep(container);
    expect(await screen.findByTestId("shipping-wizard-step-5")).not.toHaveClass("border");
  });

  it("moves final request information into the action bar", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);
    nextStep(container);
    fireEvent.change(await screen.findByTestId("shipping-new-pf-name"), { target: { value: "Custom PF" } });
    nextStep(container);
    fireEvent.change(screen.getByRole("textbox", { name: "요청 메모" }), { target: { value: "현장 확인 메모" } });
    nextStep(container);

    const finalSummary = await screen.findByTestId("shipping-final-summary");
    const actionBar = screen.getByTestId("shipping-wizard-action-bar");
    expect(finalSummary).toHaveClass("grid-rows-[auto_minmax(0,1fr)]");
    expect(screen.getByTestId("shipping-final-requirements")).toHaveClass("h-full", "min-h-0");
    expect(screen.getByTestId("shipping-final-requirements")).not.toHaveClass("h-[364px]");
    expect(finalSummary).not.toHaveTextContent("요청 정보");
    expect(actionBar).toContainElement(screen.getByTestId("shipping-final-request-summary"));
    expect(screen.getByTestId("shipping-final-request-summary")).toHaveClass("md:grid-cols-[minmax(112px,0.45fr)_minmax(0,1fr)]");
    expect(actionBar).toHaveTextContent("현장 확인 메모");
    expect(actionBar).not.toHaveTextContent("현재 출하 수량 1대");
  });

  it("summarizes new or reused PA/PF names and item codes on the final step", async () => {
    vi.mocked(api.getItems).mockResolvedValue(items.map((current) => (
      current.item_id === "acc-1" ? { ...current, mes_code: "348-PR-0037" } : current
    )));
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    fireEvent.click(await screen.findByRole("button", { name: "+1" }));
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);
    await addCompanionItem();
    nextStep(container);
    fireEvent.change(await screen.findByTestId("shipping-new-pf-name"), { target: { value: "Custom PF" } });
    nextStep(container);
    nextStep(container);

    const finalSummary = await screen.findByTestId("shipping-final-summary");
    const hero = await screen.findByTestId("shipping-shipment-hero");
    expect(hero).toHaveClass("py-2");
    expect(screen.getByTestId("shipping-shipment-hero-row")).toHaveClass("items-center");
    expect(screen.queryByTestId("shipping-shipment-quantity")).not.toBeInTheDocument();
    const shipmentName = screen.getByTestId("shipping-shipment-name");
    const shipmentCode = screen.getByTestId("shipping-shipment-code-meta");
    expect(shipmentName).not.toHaveClass("flex-1");
    expect(shipmentName).toHaveClass("shrink", "truncate");
    expect(shipmentName.nextElementSibling).toBe(shipmentCode);
    expect(shipmentCode).toHaveClass("flex", "items-center", "whitespace-nowrap");
    expect(screen.getByTestId("shipping-final-action-quantity")).toHaveTextContent("출하 수량 2대");
    expect(hero).toHaveTextContent("Custom PF");
    expect(hero).not.toHaveTextContent("Standard PF");
    expect(finalSummary).toHaveTextContent("Standard PA");
    expect(finalSummary).toHaveTextContent("Custom PF");
    expect(screen.getByTestId("shipping-final-group-pa")).toContainElement(screen.getByTestId("shipping-final-line-pa-acc-1"));
    expect(screen.getByTestId("shipping-final-group-pf")).toContainElement(screen.getByTestId("shipping-final-line-pf-pa-1"));
    expect(screen.getByTestId("shipping-final-group-companion")).toContainElement(screen.getByTestId("shipping-final-line-companion-carton-1"));
    expect(finalSummary).toHaveTextContent("품목코드는 저장/준비 완료 시 자동 생성 예정");
    expect(screen.getByTestId("shipping-final-line-pa-acc-1")).toHaveTextContent("Cable Set");
    expect(screen.getByTestId("shipping-final-line-pa-acc-1")).toHaveClass("flex", "items-center");
    expect(screen.getByTestId("shipping-final-code-pa-acc-1-kind")).toHaveTextContent("PR");
    expect(screen.getByTestId("shipping-final-quantity-pa-acc-1")).toHaveClass("self-center", "tabular-nums");
    expect(screen.getByTestId("shipping-final-quantity-pa-acc-1")).toHaveTextContent("4 EA");
    expect(screen.getByTestId("shipping-final-line-companion-carton-1")).toHaveTextContent("Carton Box");
  });

  it("moves final save and send actions into the bottom action bar", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);
    await addCompanionItem();
    nextStep(container);
    fireEvent.change(await screen.findByTestId("shipping-new-pf-name"), { target: { value: "Custom PF" } });
    nextStep(container);
    nextStep(container);

    expect(screen.queryByText("마지막 단계입니다.")).not.toBeInTheDocument();
    const actionBar = screen.getByTestId("shipping-wizard-action-bar");
    expect(screen.queryByText("요청 저장")).not.toBeInTheDocument();
    expect(screen.queryByText("준비 중으로 보내기")).not.toBeInTheDocument();
    expect(actionBar).toContainElement(screen.getByRole("button", { name: /출하 요청/ }));
    expect(actionBar).toContainElement(screen.getByTestId("shipping-send-to-prep"));
  });


  it("allows leaving the BOM step without a companion item", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);

    expect(await screen.findByTestId("shipping-wizard-step-2")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-wizard-next")).not.toBeDisabled();
    expect(screen.queryByTestId("shipping-companion-required-message")).not.toBeInTheDocument();
    expect(screen.getByText(/선택\s*0개/)).toBeInTheDocument();

    nextStep(container);
    expect(await screen.findByTestId("shipping-wizard-step-3")).toBeInTheDocument();
  });

  it("shows a detailed BOM change table on the matching step", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openRequestById(container, "requested-1");
    fireEvent.click(await screen.findByTestId("shipping-edit-request"));

    expect(await screen.findByTestId("shipping-wizard-step-2")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Cable Set/ }));
    fireEvent.change(screen.getByTestId("shipping-bom-search-pa"), { target: { value: "Bracket" } });
    fireEvent.click(await screen.findByTestId("shipping-bom-add-pa-bracket-1"));
    await addCompanionItem();
    nextStep(container);

    const table = await screen.findByTestId("shipping-bom-change-table");
    expect(table).toHaveTextContent("Cable Set");
    expect(table).toHaveTextContent("Bracket Kit");
    expect(table).toHaveTextContent("R-BR");
  });

  it("keeps BOM and companion line controls aligned without horizontal overflow", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);

    const paEditor = await screen.findByTestId("shipping-bom-editor-pa");
    const bomQuantity = paEditor.querySelector('input[type="number"]');
    expect(bomQuantity).toHaveClass("h-full", "text-center");

    await addCompanionItem();
    const companionEditor = screen.getByTestId("shipping-companion-editor");
    expect(companionEditor).toHaveClass("overflow-x-hidden");
    expect(screen.getByTestId("shipping-companion-line-carton-1")).toBeInTheDocument();
  });

  it("keeps one-line BOM controls on the item title row and enlarges the matching quantity area", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);

    const bomLine = screen.getAllByTestId("shipping-bom-readonly-item")[0].closest("[data-bom-line-child]");
    expect(bomLine).toBeTruthy();
    expect(bomLine?.querySelector('[data-testid="shipping-bom-line-controls"]')).toHaveClass("self-stretch", "lg:row-start-1");
    expect(bomLine?.querySelector('[data-testid="shipping-bom-line-meta"]')).toHaveClass("lg:row-start-2");

    nextStep(container);
    expect(await screen.findByTestId("shipping-match-quantity")).toHaveClass("min-h-[120px]");
  });

  it("keeps typed MES code emphasis consistent from PF selection through BOM editing", async () => {
    vi.mocked(api.getItems).mockResolvedValue(items.map((current) => {
      const mesCode = current.item_id === "pf-1"
        ? "3-PF-0001"
        : current.item_id === "pa-1"
          ? "3-PA-0002"
          : current.item_id === "af-1"
            ? "3-AF-0003"
            : current.item_id === "acc-1"
              ? "3-PR-0004"
              : current.mes_code;
      return { ...current, mes_code: mesCode };
    }));
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await openHubCard(container, "request");
    await openNewRequest(container);
    const search = await screen.findByTestId("shipping-pf-search");
    fireEvent.change(search, { target: { value: "Standard" } });
    expect(screen.getByTestId("shipping-pf-option-code-pf-1-kind")).toHaveTextContent("PF");
    expect(screen.getByTestId("shipping-pf-option-code-pf-1-kind")).toHaveStyle({ color: "var(--c-process-pf)" });

    fireEvent.click(screen.getByTestId("shipping-pf-option-pf-1"));
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);

    expect(await screen.findByTestId("shipping-bom-code-af-1-kind")).toHaveStyle({ color: "var(--c-process-af)" });
    expect(screen.getByTestId("shipping-bom-code-pa-1-kind")).toHaveStyle({ color: "var(--c-process-pa)" });
    expect(screen.getByTestId("shipping-bom-code-acc-1-kind")).toHaveStyle({ color: "var(--c-process-pr)" });
  });

  it("reorders a newly added AF BOM item before later BOM stages", async () => {
    vi.mocked(api.getItems).mockResolvedValue([
      ...items,
      item("af-new", "Added AF", "AF", "3-AF-0000"),
    ]);
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);

    fireEvent.change(await screen.findByTestId("shipping-bom-search-pa"), { target: { value: "Added AF" } });
    fireEvent.click(await screen.findByTestId("shipping-bom-add-pa-af-new"));

    const paLineIds = Array.from(screen.getByTestId("shipping-bom-editor-pa").querySelectorAll("[data-bom-line-child]"))
      .map((line) => line.getAttribute("data-bom-line-child"));
    expect(paLineIds).toEqual(["af-new", "af-1", "acc-1"]);
  });

  it("moves the no-change notice into the matching action bar and leaves request information blank", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);
    nextStep(container);

    const actionCenter = screen.getByTestId("shipping-wizard-action-center");
    expect(actionCenter).toHaveTextContent("BOM 변경 없음");
    expect(actionCenter).not.toHaveTextContent("현재 출하 수량 1대");
    expect(screen.queryByTestId("shipping-bom-change-table")).not.toBeInTheDocument();

    nextStep(container);
    expect(screen.getByTestId("shipping-wizard-action-center")).toBeEmptyDOMElement();
  });

  it("fills the remaining final-step height with the BOM card and scrolls changed items after one two-column row", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openRequestById(container, "requested-1");
    fireEvent.click(await screen.findByTestId("shipping-edit-request"));
    fireEvent.click(await screen.findByRole("button", { name: /Cable Set/ }));
    fireEvent.change(screen.getByTestId("shipping-bom-search-pa"), { target: { value: "Bracket" } });
    fireEvent.click(await screen.findByTestId("shipping-bom-add-pa-bracket-1"));
    nextStep(container);
    expect(screen.getByTestId("shipping-wizard-action-center")).toBeEmptyDOMElement();
    fireEvent.change(await screen.findByTestId("shipping-new-pf-name"), { target: { value: "Custom PF" } });
    nextStep(container);
    nextStep(container);

    const finalSummary = await screen.findByTestId("shipping-final-summary");
    expect(finalSummary).toHaveClass("grid-rows-[auto_minmax(0,1fr)_auto]", "content-start", "overflow-hidden");
    expect(screen.getByTestId("shipping-final-requirements")).toHaveClass("h-full", "min-h-0");
    expect(screen.getByTestId("shipping-final-requirements")).not.toHaveClass("h-[432px]", "shrink-0");
    expect(screen.getByTestId("shipping-final-requirements-list")).toHaveClass("overflow-y-auto");
    expect(screen.getByTestId("shipping-final-bom-changes")).toHaveClass("shrink-0");
    expect(screen.getByTestId("shipping-final-bom-change-list")).toHaveClass("h-[58px]", "grid-cols-2", "overflow-x-hidden", "overflow-y-auto");
    expect(screen.getAllByTestId("shipping-final-bom-change-row")[0]).toHaveClass("h-[58px]", "overflow-hidden", "rounded-[12px]", "border", "px-3", "py-2");
    expect(screen.queryByText("세부 목록", { exact: true })).not.toBeInTheDocument();
  });

  it("keeps the invoice field above PF selection and includes it in request creation", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await openHubCard(container, "request");
    await openNewRequest(container);

    const invoiceInput = await screen.findByRole("textbox", { name: "인보이스 번호" });
    const pfSearch = screen.getByTestId("shipping-pf-search");
    expect(invoiceInput.compareDocumentPosition(pfSearch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(invoiceInput, { target: { value: " inv-001 " } });

    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);
    nextStep(container);
    fireEvent.change(await screen.findByTestId("shipping-new-pf-name"), { target: { value: "Custom PF" } });
    nextStep(container);
    nextStep(container);
    fireEvent.click(screen.getByTestId("shipping-send-to-prep"));

    await waitFor(() => expect(api.createShippingRequest).toHaveBeenCalledWith(
      expect.objectContaining({ invoice_number: "inv-001" }),
    ));
  });

  it("preserves a typed invoice when the shipping request cache updates", async () => {
    navigationMock.search = "tab=shipping&shippingView=requestWork";
    const client = makeClient({ staleTime: 5 * 60_000 });
    client.setQueryData(queryKeys.shipping.requests(), [
      request({ request_id: "cache-initial", status: "REQUESTED" }),
    ]);
    const { container } = rtlRender(<DesktopShippingView onStatusChange={() => {}} />, {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });

    const invoiceInput = await screen.findByRole("textbox", { name: "인보이스 번호" });
    fireEvent.change(invoiceInput, { target: { value: "INV-CACHE-001" } });

    await act(async () => {
      client.setQueryData(queryKeys.shipping.requests(), [
        request({ request_id: "cache-refresh", status: "REQUESTED" }),
      ]);
    });

    await waitFor(() => expect(invoiceInput).toHaveValue("INV-CACHE-001"));

    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);
    nextStep(container);
    fireEvent.change(await screen.findByTestId("shipping-new-pf-name"), { target: { value: "Custom PF" } });
    nextStep(container);
    nextStep(container);
    fireEvent.click(screen.getByTestId("shipping-send-to-prep"));

    await waitFor(() => {
      expect(api.createShippingRequest).toHaveBeenCalledWith(
        expect.objectContaining({ invoice_number: "INV-CACHE-001" }),
      );
      expect(api.sendShippingToPrep).toHaveBeenCalledWith("new-1");
    });
    expect(await screen.findByTestId("shipping-prep-detail")).toBeInTheDocument();
  });

  it("edits invoice from detail using the normalized response and discloses revisions", async () => {
    navigationMock.search = "tab=shipping&shippingView=requestDetail&shippingRequestId=requested-1";
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({ request_id: "requested-1", status: "REQUESTED", invoice_number: "OLD-1" }),
    ]);
    vi.mocked(api.updateShippingInvoice).mockResolvedValue(
      request({ request_id: "requested-1", status: "REQUESTED", invoice_number: "INV-001" }),
    );
    const revisions = [
      {
        revision_id: "rev-1",
        request_id: "requested-1",
        edited_by_employee_id: "employee-1",
        edited_by_name: "홍길동",
        summary: "인보이스 번호 수정",
        affects_preparation: false,
        changes: [{ field: "invoice_number", before: "OLD-1", after: "INV-001" }],
        created_at: "2026-07-24T01:00:00Z",
      },
      {
        revision_id: "rev-2",
        request_id: "requested-1",
        edited_by_employee_id: "employee-1",
        edited_by_name: "홍길동",
        summary: "출하 요청 수정: bom_lines",
        affects_preparation: true,
        changes: [{
          field: "bom_lines",
          before: [
            { parent_stage: "PA", child_item_id: "af-1", item_name: "당시 AF", mes_code: "AF-OLD", quantity: 1, unit: "EA", included: true },
            { parent_stage: "PF", child_item_id: "deleted-uuid", item_name: "삭제된 과거 품목", mes_code: "OLD-777", quantity: 3, unit: "EA", included: true },
          ],
          after: [
            { parent_stage: "PA", child_item_id: "af-1", quantity: 2, unit: "EA", included: true },
            { parent_stage: "PF", child_item_id: "unknown-uuid", quantity: 4, unit: "EA", included: true },
          ],
        }],
        created_at: "2026-07-24T00:30:00Z",
      },
    ];
    vi.mocked(api.getShippingRevisions).mockResolvedValueOnce([]).mockResolvedValue(revisions);

    render(<DesktopShippingView onStatusChange={() => {}} />);

    const input = await screen.findByRole("textbox", { name: "인보이스 번호" });
    fireEvent.change(input, { target: { value: " inv-001 " } });
    fireEvent.click(screen.getByRole("button", { name: "인보이스 번호 저장" }));

    await waitFor(() => expect(api.updateShippingInvoice).toHaveBeenCalledWith("requested-1", "inv-001"));
    await waitFor(() => expect(input).toHaveValue("INV-001"));
    const revision = await screen.findByRole("button", { name: /인보이스 번호 수정/ });
    fireEvent.click(revision);
    const revisionHistory = screen.getByTestId("shipping-revision-history");
    expect(within(revisionHistory).getByText("인보이스 번호", { selector: "span" })).toBeInTheDocument();
    expect(within(revisionHistory).getByText(/OLD-1.*INV-001/)).toBeInTheDocument();
    const bomRevision = within(revisionHistory).getByRole("button", { name: /BOM 구성 수정/ });
    expect(bomRevision).not.toHaveTextContent("bom_lines");
    fireEvent.click(bomRevision);
    expect(within(revisionHistory).getByText(/PA · 당시 AF \(AF-OLD\) × 1 EA/)).toBeInTheDocument();
    expect(within(revisionHistory).getByText(/PF · 삭제된 과거 품목 \(OLD-777\) × 3 EA/)).toBeInTheDocument();
    expect(within(revisionHistory).getByText(/PA · AF Main \(AF-001\) × 2 EA/)).toBeInTheDocument();
    expect(within(revisionHistory).getByText(/PF · unknown-uuid × 4 EA/)).toBeInTheDocument();
    expect(within(revisionHistory).queryByText(/deleted-uuid/)).not.toBeInTheDocument();
  });

  it.each([
    { status: "PREPARED" as const, view: "prepWork", events: [], preparedAt: null },
    { status: "PICKED_UP" as const, view: "historyWork", events: [], preparedAt: null },
    {
      status: "CANCELLED" as const,
      view: "historyWork",
      events: [{ event_id: "event-prepared", event_type: "PREPARED", message: "출하 준비 완료", created_at: "2026-07-20T00:00:00Z" }],
      preparedAt: null,
    },
    { status: "CANCELLED" as const, view: "historyWork", events: [], preparedAt: "2026-07-20T00:00:00Z" },
    { status: "PREPARING" as const, view: "prepWork", events: [], preparedAt: "2026-07-20T00:00:00Z" },
  ])("prevents clearing an existing invoice after preparation history ($status)", async ({ status, view, events, preparedAt }) => {
    const protectedRequest = request({
      request_id: `protected-${status.toLowerCase()}`,
      status,
      invoice_number: "INV-LOCKED",
      events,
      prepared_at: preparedAt,
      picked_up_at: status === "PICKED_UP" ? "2026-07-20T01:00:00Z" : null,
      cancelled_at: status === "CANCELLED" ? "2026-07-20T02:00:00Z" : null,
    });
    navigationMock.search = `tab=shipping&shippingView=${view}&shippingRequestId=${protectedRequest.request_id}${view === "historyWork" ? `&shippingHistoryStatus=${status}` : ""}`;
    vi.mocked(api.getShippingRequests).mockResolvedValue([protectedRequest]);
    vi.mocked(api.getShippingHistory).mockResolvedValue({ requests: [protectedRequest], next_cursor: null, has_more: false });

    render(<DesktopShippingView onStatusChange={() => {}} />);

    const input = await screen.findByRole("textbox", { name: "인보이스 번호" });
    fireEvent.change(input, { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "인보이스 번호 저장" })).toBeDisabled();
    expect(screen.getByText("준비 완료 이력이 있어 기존 인보이스 번호를 비울 수 없습니다.")).toBeInTheDocument();
    expect(api.updateShippingInvoice).not.toHaveBeenCalled();
  });

  it("allows clearing a cancelled request that never reached prepared", async () => {
    const cancelled = request({
      request_id: "cancelled-before-prepared",
      status: "CANCELLED",
      invoice_number: "INV-REMOVABLE",
      events: [],
      cancelled_at: "2026-07-20T02:00:00Z",
    });
    navigationMock.search = "tab=shipping&shippingView=historyWork&shippingRequestId=cancelled-before-prepared&shippingHistoryStatus=CANCELLED";
    vi.mocked(api.getShippingRequests).mockResolvedValue([cancelled]);
    vi.mocked(api.getShippingHistory).mockResolvedValue({ requests: [cancelled], next_cursor: null, has_more: false });
    vi.mocked(api.updateShippingInvoice).mockResolvedValue({ ...cancelled, invoice_number: null });

    render(<DesktopShippingView onStatusChange={() => {}} />);

    fireEvent.change(await screen.findByRole("textbox", { name: "인보이스 번호" }), { target: { value: "" } });
    const saveButton = screen.getByRole("button", { name: "인보이스 번호 저장" });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateShippingInvoice).toHaveBeenCalledWith("cancelled-before-prepared", null));
  });

  it("allows saving an invoice number already used by another request", async () => {
    navigationMock.search = "tab=shipping&shippingView=requestDetail&shippingRequestId=requested-1";
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({ request_id: "requested-1", status: "REQUESTED", invoice_number: "OLD-1" }),
    ]);
    vi.mocked(api.updateShippingInvoice).mockResolvedValue(
      request({ request_id: "requested-1", status: "REQUESTED", invoice_number: "DUPLICATE" }),
    );

    render(<DesktopShippingView onStatusChange={() => {}} />);

    const input = await screen.findByRole("textbox", { name: "인보이스 번호" });
    fireEvent.change(input, { target: { value: "DUPLICATE" } });
    fireEvent.click(screen.getByRole("button", { name: "인보이스 번호 저장" }));

    await waitFor(() => expect(api.updateShippingInvoice).toHaveBeenCalledWith("requested-1", "DUPLICATE"));
    expect(input).toHaveValue("DUPLICATE");
    expect(screen.queryByText("이미 사용 중인 인보이스 번호입니다.")).not.toBeInTheDocument();
  });

  it("blocks preparation without an invoice and enables it after invoice save", async () => {
    navigationMock.search = "tab=shipping&shippingView=prepWork&shippingRequestId=req-1";
    vi.mocked(api.getShippingRequests).mockResolvedValue([request({ invoice_number: null })]);
    vi.mocked(api.updateShippingInvoice).mockResolvedValue(request({ invoice_number: "INV-READY" }));

    render(<DesktopShippingView onStatusChange={() => {}} />);

    expect(await screen.findByRole("textbox", { name: "인보이스 번호" })).toBeInTheDocument();
    expect(screen.getByText(/인보이스 번호를 입력해야 준비 완료/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "준비 완료" })).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "인보이스 번호" }), { target: { value: "inv-ready" } });
    fireEvent.click(screen.getByRole("button", { name: "인보이스 번호 저장" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "준비 완료" })).toBeEnabled());
  });

  it("loads endpoint-backed history by status, month, search, and cursor", async () => {
    const picked = request({ request_id: "hist-picked", status: "PICKED_UP", invoice_number: "INV-P", picked_up_at: "2026-06-26T01:00:00Z" });
    const cancelled = request({ request_id: "hist-cancelled", status: "CANCELLED", invoice_number: "INV-C", cancelled_at: "2026-07-01T15:30:00Z" });
    vi.mocked(api.getShippingHistoryMonths).mockImplementation(async (params?: any) =>
      params?.status === "CANCELLED" ? [{ year: 2026, month: 7, count: 1 }] : [{ year: 2026, month: 6, count: 2 }],
    );
    vi.mocked(api.getShippingHistory).mockImplementation(async (params?: any) => {
      if (params?.cursor === "cursor-1") return { requests: [request({ ...picked, request_id: "hist-picked-2" })], next_cursor: null, has_more: false };
      if (params?.status === "CANCELLED") return { requests: [cancelled], next_cursor: null, has_more: false };
      return { requests: [picked], next_cursor: "cursor-1", has_more: true };
    });
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await openHubCard(container, "history");
    const yearDisclosure = await screen.findByText("2026년", { selector: "summary" });
    expect(yearDisclosure.closest("details")).toHaveAttribute("open");
    const monthDisclosure = screen.getByText("6월 · 2건", { selector: "summary" });
    expect(monthDisclosure.closest("details")).toHaveAttribute("open");
    await waitFor(() => expect(api.getShippingHistory).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PICKED_UP", year: 2026, month: 6, limit: 50 }),
    ));

    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    await waitFor(() => expect(api.getShippingHistory).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "cursor-1" }),
    ));

    fireEvent.click(screen.getByRole("button", { name: "요청 취소" }));
    expect(await screen.findByText("7월 · 1건", { selector: "summary" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "출하 이력 검색" }), { target: { value: "INV-C" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    await waitFor(() => expect(api.getShippingHistory).toHaveBeenCalledWith(
      expect.objectContaining({ status: "CANCELLED", q: "INV-C" }),
    ));
    expect(await screen.findByText("7월 · 1건", { selector: "summary" })).toBeInTheDocument();
    expect(await screen.findByText(/인보이스 번호 · INV-C/)).toBeInTheDocument();
    expect(screen.getByText(/요청 취소 07/)).toBeInTheDocument();
  });

  it("uses semantic history colors, a balanced title, and controlled month disclosure", async () => {
    navigationMock.search = "tab=shipping&shippingView=historyList&shippingHistoryStatus=PICKED_UP";
    vi.mocked(api.getShippingHistoryMonths).mockResolvedValue([
      { year: 2026, month: 7, count: 1 },
      { year: 2026, month: 6, count: 2 },
      { year: 2025, month: 12, count: 3 },
    ]);
    vi.mocked(api.getShippingHistory).mockImplementation(async (params?: any) => ({
      requests: [request({
        request_id: `history-${params?.month ?? "search"}`,
        status: params?.status ?? "PICKED_UP",
        picked_up_at: "2026-07-20T01:00:00Z",
      })],
      next_cursor: null,
      has_more: false,
    }));

    render(<DesktopShippingView onStatusChange={() => {}} />);

    const historyPanel = await screen.findByTestId("shipping-history-list");
    expect(within(historyPanel).queryByText("상태와 연월 폴더로 찾거나 전체 기간을 검색합니다.")).not.toBeInTheDocument();
    expect(within(historyPanel).getByText("출하 이력")).toHaveClass("text-xl");

    const complete = within(historyPanel).getByRole("button", { name: "출하 완료" });
    const statusGroup = complete.parentElement;
    expect(statusGroup).toHaveAttribute("data-selection-depth", "soft");
    expect(complete).toHaveStyle({ color: LEGACY_COLORS.green });

    const june = await within(historyPanel).findByText("6월 · 2건", { selector: "summary" });
    const callsBeforeJune = vi.mocked(api.getShippingHistory).mock.calls.length;
    fireEvent.click(june);
    await waitFor(() => expect(june.closest("details")).toHaveAttribute("open"));
    await waitFor(() => expect(api.getShippingHistory).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PICKED_UP", year: 2026, month: 6, limit: 50 }),
    ));
    expect(vi.mocked(api.getShippingHistory).mock.calls.length).toBe(callsBeforeJune + 1);
    expect(june).toHaveStyle({ color: LEGACY_COLORS.blue });

    fireEvent.click(june);
    expect(june.closest("details")).toHaveAttribute("open");
    expect(vi.mocked(api.getShippingHistory).mock.calls.length).toBe(callsBeforeJune + 1);

    const year2025 = within(historyPanel).getByText("2025년", { selector: "summary" });
    const year2026 = within(historyPanel).getByText("2026년", { selector: "summary" });
    const callsBeforeYearChange = vi.mocked(api.getShippingHistory).mock.calls.length;
    fireEvent.click(year2025);
    expect(year2025.closest("details")).toHaveAttribute("open");
    expect(year2026.closest("details")).not.toHaveAttribute("open");
    expect(vi.mocked(api.getShippingHistory).mock.calls.length).toBe(callsBeforeYearChange);

    const december = within(historyPanel).getByText("12월 · 3건", { selector: "summary" });
    fireEvent.click(december);
    await waitFor(() => expect(
      within(historyPanel).getByText("12월 · 3건", { selector: "summary" }).closest("details"),
    ).toHaveAttribute("open"));
    expect(vi.mocked(api.getShippingHistory).mock.calls.length).toBe(callsBeforeYearChange + 1);
    fireEvent.click(within(historyPanel).getByText("2025년", { selector: "summary" }));
    expect(within(historyPanel).getByText("2025년", { selector: "summary" }).closest("details")).toHaveAttribute("open");
    expect(vi.mocked(api.getShippingHistory).mock.calls.length).toBe(callsBeforeYearChange + 1);
    fireEvent.click(within(historyPanel).getByText("2026년", { selector: "summary" }));
    expect(within(historyPanel).getByText("2025년", { selector: "summary" }).closest("details")).not.toHaveAttribute("open");
    expect(within(historyPanel).getByText("2026년", { selector: "summary" }).closest("details")).toHaveAttribute("open");
    expect(vi.mocked(api.getShippingHistory).mock.calls.length).toBe(callsBeforeYearChange + 1);

    fireEvent.click(within(historyPanel).getByRole("button", { name: "요청 취소" }));
    expect(within(historyPanel).getByRole("button", { name: "요청 취소" })).toHaveStyle({ color: LEGACY_COLORS.red });
  });

  it("ignores an older completed-history response after switching to cancelled", async () => {
    const pickedMonths = deferred<ShippingHistoryMonth[]>();
    const picked = request({ request_id: "race-picked", status: "PICKED_UP", invoice_number: "INV-RACE-P", picked_up_at: "2026-06-24T01:00:00Z" });
    const cancelled = request({ request_id: "race-cancelled", status: "CANCELLED", invoice_number: "INV-RACE-C", cancelled_at: "2026-07-24T01:00:00Z" });
    vi.mocked(api.getShippingHistoryMonths).mockImplementation(async (params?: any) =>
      params?.status === "PICKED_UP" ? pickedMonths.promise : [{ year: 2026, month: 7, count: 1 }],
    );
    vi.mocked(api.getShippingHistory).mockImplementation(async (params?: any) => params?.status === "CANCELLED"
      ? { requests: [cancelled], next_cursor: null, has_more: false }
      : { requests: [picked], next_cursor: null, has_more: false },
    );
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await openHubCard(container, "history");
    await waitFor(() => expect(api.getShippingHistoryMonths).toHaveBeenCalledWith({ status: "PICKED_UP" }));
    fireEvent.click(screen.getByRole("button", { name: "요청 취소" }));
    expect(await screen.findByText(/인보이스 번호 · INV-RACE-C/)).toBeInTheDocument();
    await act(async () => {
      pickedMonths.resolve([{ year: 2026, month: 6, count: 1 }]);
      await pickedMonths.promise;
      await Promise.resolve();
    });

    expect(screen.getByText("7월 · 1건", { selector: "summary" })).toBeInTheDocument();
    expect(screen.getByText(/인보이스 번호 · INV-RACE-C/)).toBeInTheDocument();
    expect(screen.queryByText(/INV-RACE-P/)).not.toBeInTheDocument();
  });

  it("keeps the newest history search when responses complete in reverse order", async () => {
    navigationMock.search = "tab=shipping&shippingView=historyList&shippingHistoryStatus=PICKED_UP";
    const olderSearch = deferred<{ requests: ShippingRequest[]; next_cursor: null; has_more: false }>();
    const initial = request({ request_id: "search-initial", status: "PICKED_UP", invoice_number: "INV-INITIAL", picked_up_at: "2026-07-01T01:00:00Z" });
    const older = request({ request_id: "search-older", status: "PICKED_UP", invoice_number: "INV-OLDER", picked_up_at: "2026-07-02T01:00:00Z" });
    const newest = request({ request_id: "search-newest", status: "PICKED_UP", invoice_number: "INV-NEWEST", picked_up_at: "2026-07-03T01:00:00Z" });
    vi.mocked(api.getShippingHistoryMonths).mockResolvedValue([{ year: 2026, month: 7, count: 1 }]);
    vi.mocked(api.getShippingHistory).mockImplementation(async (params?: any) => {
      if (params?.q === "INV-OLDER") return olderSearch.promise;
      if (params?.q === "INV-NEWEST") return { requests: [newest], next_cursor: null, has_more: false };
      return { requests: [initial], next_cursor: null, has_more: false };
    });
    render(<DesktopShippingView onStatusChange={() => {}} />);

    expect(await screen.findByText(/인보이스 번호 · INV-INITIAL/)).toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "출하 이력 검색" });
    fireEvent.change(search, { target: { value: "INV-OLDER" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    await waitFor(() => expect(api.getShippingHistory).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PICKED_UP", q: "INV-OLDER" }),
    ));
    fireEvent.change(search, { target: { value: "INV-NEWEST" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(await screen.findByText(/인보이스 번호 · INV-NEWEST/)).toBeInTheDocument();

    await act(async () => {
      olderSearch.resolve({ requests: [older], next_cursor: null, has_more: false });
      await olderSearch.promise;
      await Promise.resolve();
    });

    expect(screen.getByText(/인보이스 번호 · INV-NEWEST/)).toBeInTheDocument();
    expect(screen.queryByText(/INV-OLDER/)).not.toBeInTheDocument();
  });

  it("restores a cancelled history detail from its URL without loading completed history", async () => {
    navigationMock.search = "tab=shipping&shippingView=historyWork&shippingRequestId=cancelled-1&shippingHistoryStatus=CANCELLED";
    const cancelled = request({ request_id: "cancelled-1", status: "CANCELLED", cancelled_at: "2026-07-20T01:00:00Z" });
    vi.mocked(api.getShippingRequests).mockResolvedValue([cancelled]);
    vi.mocked(api.getShippingHistoryMonths).mockResolvedValue([{ year: 2026, month: 7, count: 1 }]);
    vi.mocked(api.getShippingHistory).mockResolvedValue({ requests: [cancelled], next_cursor: null, has_more: false });

    render(<DesktopShippingView onStatusChange={() => {}} />);

    const detail = await screen.findByTestId("shipping-history-detail");
    await waitFor(() => expect(api.getShippingHistory).toHaveBeenCalledWith(
      expect.objectContaining({ status: "CANCELLED", year: 2026, month: 7, limit: 50 }),
    ));
    expect(vi.mocked(api.getShippingHistory).mock.calls.some(([params]) => params?.status === "PICKED_UP")).toBe(false);
    expect(detail).toHaveTextContent("요청 취소");
  });

  it("loads an old cancelled request directly when it is absent from current lists", async () => {
    navigationMock.search = "tab=shipping&shippingView=historyWork&shippingRequestId=old-cancelled";
    const oldCancelled = request({
      request_id: "old-cancelled",
      status: "CANCELLED",
      base_pf_item_name: "오래된 취소 PF",
      cancelled_at: "2025-01-03T01:00:00Z",
    });
    const otherCancelled = request({
      request_id: "other-cancelled",
      status: "CANCELLED",
      base_pf_item_name: "다른 취소 PF",
      cancelled_at: "2026-07-20T01:00:00Z",
    });
    vi.mocked(api.getShippingRequests).mockResolvedValue([request({ request_id: "active-1", status: "REQUESTED" })]);
    vi.mocked(api.getShippingRequest).mockResolvedValue(oldCancelled);
    vi.mocked(api.getShippingHistoryMonths).mockResolvedValue([{ year: 2026, month: 7, count: 1 }]);
    vi.mocked(api.getShippingHistory).mockResolvedValue({ requests: [otherCancelled], next_cursor: null, has_more: false });

    render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(api.getShippingRequest).toHaveBeenCalledWith(
      "old-cancelled",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    const detail = await screen.findByTestId("shipping-history-detail");
    await waitFor(() => expect(detail).toHaveTextContent("오래된 취소 PF"));
    expect(detail).not.toHaveTextContent("다른 취소 PF");
    await waitFor(() => expect(api.getShippingHistory).toHaveBeenCalledWith(
      expect.objectContaining({ status: "CANCELLED" }),
    ));
  });

  it("does not show the first history row when a direct history URL returns 404", async () => {
    navigationMock.search = "tab=shipping&shippingView=historyWork&shippingRequestId=missing-history";
    const unrelated = request({
      request_id: "unrelated-history",
      status: "PICKED_UP",
      base_pf_item_name: "관계없는 첫 행 PF",
      picked_up_at: "2026-07-20T01:00:00Z",
    });
    vi.mocked(api.getShippingRequests).mockResolvedValue([]);
    vi.mocked(api.getShippingRequest).mockRejectedValue(Object.assign(new Error("출하 요청을 찾을 수 없습니다."), { status: 404 }));
    vi.mocked(api.getShippingHistory).mockResolvedValue({ requests: [unrelated], next_cursor: null, has_more: false });

    render(<DesktopShippingView onStatusChange={() => {}} />);

    const detail = await screen.findByTestId("shipping-history-detail");
    expect(await within(detail).findByText("출하 요청을 찾을 수 없습니다.")).toBeInTheDocument();
    expect(detail).not.toHaveTextContent("관계없는 첫 행 PF");
  });

  it("aborts a direct history lookup when the detail view unmounts", async () => {
    navigationMock.search = "tab=shipping&shippingView=historyWork&shippingRequestId=slow-history";
    let requestSignal: AbortSignal | undefined;
    vi.mocked(api.getShippingRequests).mockResolvedValue([]);
    vi.mocked(api.getShippingRequest).mockImplementation((_requestId, opts) => {
      requestSignal = opts?.signal;
      return new Promise<ShippingRequest>(() => {});
    });

    const { unmount } = render(<DesktopShippingView onStatusChange={() => {}} />);
    await waitFor(() => expect(api.getShippingRequest).toHaveBeenCalledWith(
      "slow-history",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));

    unmount();

    expect(requestSignal?.aborted).toBe(true);
  });

  it("highlights sales-review items on wizard steps two and five", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await openHubCard(container, "request");
    await openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);

    const stepTwoLine = container.querySelector('[data-bom-line-child="af-1"]');
    expect(stepTwoLine).toHaveAttribute("data-sales-review", "true");
    expect(within(stepTwoLine as HTMLElement).getByText("영업 확인")).toBeInTheDocument();

    nextStep(container);
    fireEvent.change(await screen.findByTestId("shipping-new-pf-name"), { target: { value: "Custom PF" } });
    nextStep(container);
    nextStep(container);

    const stepFiveLine = screen.getByTestId("shipping-final-line-pa-af-1");
    expect(stepFiveLine).toHaveAttribute("data-sales-review", "true");
    expect(within(stepFiveLine).getByText("영업 확인")).toBeInTheDocument();
  });

  it("탭 재마운트 시(같은 QueryClient) 캐시 히트로 재요청 없음 — flicker 회귀 방지", async () => {
    const client = makeClient({ gcTime: 5 * 60_000, staleTime: 5 * 60_000 });
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    const { container, unmount } = rtlRender(<DesktopShippingView onStatusChange={() => {}} />, { wrapper: Wrapper });
    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    const callCountAfterFirstMount = vi.mocked(api.getShippingRequests).mock.calls.length;

    unmount();

    const { container: container2 } = rtlRender(<DesktopShippingView onStatusChange={() => {}} />, { wrapper: Wrapper });
    await waitFor(() => expect(container2.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    expect(vi.mocked(api.getShippingRequests).mock.calls.length).toBe(callCountAfterFirstMount);
  });

});
