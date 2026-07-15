import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { DesktopShippingView } from "../DesktopShippingView";
import type { Item, ShippingRequest } from "@/lib/api";

const navigationMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  search: "tab=shipping",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigationMock.push,
    replace: navigationMock.replace,
  }),
  useSearchParams: () => new URLSearchParams(navigationMock.search),
}));
vi.mock("@/lib/api", () => ({
  api: {
    getItems: vi.fn(),
    getBOM: vi.fn(),
    getShippingRequests: vi.fn(),
    getShippingHistory: vi.fn(),
    createShippingRequest: vi.fn(),
    updateShippingRequest: vi.fn(),
    sendShippingToPrep: vi.fn(),
    deleteShippingRequest: vi.fn(),
    updateShippingChecklist: vi.fn(),
    clearShippingChecklist: vi.fn(),
    prepareShippingComplete: vi.fn(),
    cancelShippingPrepare: vi.fn(),
    completeShippingPickup: vi.fn(),
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
    prepared_at: null,
    picked_up_at: null,
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

function render(ui: ReactElement) {
  const client = makeClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return rtlRender(ui, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
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
  vi.mocked(api.getShippingHistory).mockResolvedValue([
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

  it("clears a zero shipping quantity on focus so typing replaces it", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    await openHubCard(container, "request");
    await openNewRequest(container);

    const quantityInput = await screen.findByTestId("shipping-request-quantity");
    fireEvent.change(quantityInput, { target: { value: "0" } });
    expect(quantityInput).toHaveValue(0);

    fireEvent.focus(quantityInput);

    expect(quantityInput).toHaveValue(null);
  });

  it("moves through PF, BOM, match, request info, and final send steps", async () => {
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
      expect(api.createShippingRequest).toHaveBeenCalledWith(expect.objectContaining({ custom_pf_name: "Custom PF" }));
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
    fireEvent.click(screen.getByRole("button", { name: /Standard PF/ }));

    expect(await screen.findByTestId("shipping-history-detail")).toBeInTheDocument();
    expect(screen.queryByText("SHIP-req")).not.toBeInTheDocument();
    expect(screen.getAllByText("픽업 완료").length).toBeGreaterThan(0);
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
          line.line_id === "bom-2" ? { ...line, mes_code: "3-AF-0018" } : line
      )),
    });
    vi.mocked(api.getShippingRequests).mockResolvedValue([codedRequest]);
    navigationMock.search = "tab=shipping&shippingView=requestDetail&shippingRequestId=detail-codes";

    render(<DesktopShippingView onStatusChange={() => {}} />);

    expect(await screen.findByTestId("shipping-summary-code-bom-1-PF-kind")).toHaveTextContent("PR");
    expect(screen.getByTestId("shipping-summary-code-bom-2-PA-kind")).toHaveTextContent("AF");
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
    fireEvent.click(await screen.findByTestId("shipping-confirm-action"));

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

  it("uses defect-style shipping hub cards without duplicate open buttons", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());

    expect(screen.queryByText("바로 열기")).not.toBeInTheDocument();
    const badge = screen.getByTestId("shipping-hub-count-request");
    expect(badge).toHaveTextContent(/\d+/);
    expect(badge.className).toContain("min-h-12");
    expect(screen.getByText("요청 생성부터 준비 체크, 픽업 완료까지 이어서 처리합니다.")).toBeInTheDocument();
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
    expect(actionBar).toContainElement(screen.getByTestId("shipping-request-quantity"));
    expect(actionBar).not.toHaveTextContent("기준 PF를 먼저 선택하세요.");
  });

  it("uses event types to repair garbled shipping history messages", async () => {
    navigationMock.search = "tab=shipping&shippingView=historyWork&shippingRequestId=hist-1";
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({
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
      }),
    ]);

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
    await waitFor(() => expect(screen.getByTestId("shipping-request-quantity")).toHaveFocus());
  });

  it("prefills required PA/PF naming from the base items in the matching action bar", async () => {
    vi.mocked(api.matchShippingBom).mockResolvedValue({
      matched_pa_item_id: null,
      matched_pf_item_id: null,
      matched_pa_item_name: null,
      matched_pf_item_name: null,
      requires_pa_name: true,
      requires_pf_name: true,
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
    expect(screen.queryByTestId("shipping-new-pf-name")).not.toBeInTheDocument();
    expect(screen.getByTestId("shipping-wizard-action-bar")).not.toHaveTextContent("새 PA/PF 이름을 입력하세요.");

    nextStep(container);

    const paSummary = await screen.findByTestId("shipping-final-pa-summary");
    const pfSummary = await screen.findByTestId("shipping-final-pf-summary");
    await waitFor(() => expect(paSummary).toHaveTextContent("새 PA 생성 예정"));
    expect(paSummary).toHaveTextContent("Standard PA");
    expect(pfSummary).toHaveTextContent("새 PF 생성 예정");
    expect(pfSummary).toHaveTextContent("Standard PF");
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

  it("shows the new PA inside the final shipment BOM when both new item names are entered", async () => {
    vi.mocked(api.matchShippingBom).mockResolvedValue({
      matched_pa_item_id: null,
      matched_pf_item_id: null,
      matched_pa_item_name: null,
      matched_pf_item_name: null,
      requires_pa_name: true,
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

    fireEvent.change(await screen.findByTestId("shipping-new-pa-name"), { target: { value: "새 PA" } });
    fireEvent.change(screen.getByTestId("shipping-new-pf-name"), { target: { value: "새 PF" } });

    expect(screen.queryByTestId("shipping-new-pf-pa-link-notice")).not.toBeInTheDocument();
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-4");
    nextStep(container);
    await screen.findByTestId("shipping-wizard-step-5");

    const newPa = screen.getByTestId("shipping-final-new-pa-link");
    expect(screen.getByTestId("shipping-final-requirements-list")).toContainElement(newPa);
    expect(newPa).toHaveTextContent("새 PA");
    expect(newPa).toHaveTextContent("품목코드는 저장/준비 완료 시 자동 생성 예정");
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
    expect(screen.getByTestId("shipping-match-summary")).toHaveClass("md:grid-cols-3");
    expect(screen.getByTestId("shipping-match-summary").children).toHaveLength(3);

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

    const finalSummary = await screen.findByTestId("shipping-final-summary");
    const hero = await screen.findByTestId("shipping-shipment-hero");
    expect(hero).toHaveClass("py-2");
    expect(screen.getByTestId("shipping-shipment-hero-row")).toHaveClass("items-center");
    expect(screen.getByTestId("shipping-shipment-quantity")).toHaveClass("inline-flex", "items-baseline");
    expect(hero).toHaveTextContent("Custom PF");
    expect(hero).not.toHaveTextContent("Standard PF");
    expect(finalSummary).toHaveTextContent("Standard PA");
    expect(finalSummary).toHaveTextContent("Custom PF");
    expect(screen.getByTestId("shipping-final-group-pa")).toContainElement(screen.getByTestId("shipping-final-line-pa-acc-1"));
    expect(screen.getByTestId("shipping-final-group-pf")).toContainElement(screen.getByTestId("shipping-final-line-pf-pa-1"));
    expect(screen.getByTestId("shipping-final-group-companion")).toContainElement(screen.getByTestId("shipping-final-line-companion-carton-1"));
    expect(finalSummary).toHaveTextContent("품목코드는 저장/준비 완료 시 자동 생성 예정");
    expect(screen.getByTestId("shipping-final-line-pa-acc-1")).toHaveTextContent("Cable Set");
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

  it("keeps final BOM and changed-item panels at 369px with independent scrolling", async () => {
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
    expect(finalSummary).toHaveClass("grid-rows-[auto_369px_369px]", "overflow-y-auto");
    expect(screen.getByTestId("shipping-final-requirements")).toHaveClass("h-[369px]", "shrink-0");
    expect(screen.getByTestId("shipping-final-requirements-list")).toHaveClass("overflow-y-auto");
    expect(screen.getByTestId("shipping-final-bom-changes")).toHaveClass("h-[369px]", "shrink-0");
    expect(screen.getByTestId("shipping-final-bom-change-list")).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    expect(screen.getAllByTestId("shipping-final-bom-change-row")[0]).toHaveClass("rounded-[12px]", "border", "px-3", "py-2");
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
