import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  item("af-1", "AF Main", "AF", "AF-001"),
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
    transaction_count: 0,
    ...overrides,
  };
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
  function openHubCard(container: HTMLElement, id: "request" | "prep" | "history") {
    const button = container.querySelector(`[data-shipping-hub-card="${id}"]`);
    expect(button).toBeTruthy();
    fireEvent.click(button as HTMLElement);
  }

  function openNewRequest(container: HTMLElement) {
    const button = container.querySelector('[data-primary-action="new-shipping-request"]');
    expect(button).toBeTruthy();
    fireEvent.click(button as HTMLElement);
  }

  function openRequestById(container: HTMLElement, requestId: string) {
    const button = container.querySelector(`[data-shipping-request-id="${requestId}"]`);
    expect(button).toBeTruthy();
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
  it("loads PF candidates separately and delays the full item list until PF selection", async () => {
    vi.mocked(api.getItems).mockImplementation(async (params?: any) => {
      if (params?.process_type_code === "PF") return [items[0]];
      if (params?.limit === 2000) return items;
      return items;
    });
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    await waitFor(() => expect(screen.getByTestId("shipping-request-list-panel")).toBeInTheDocument());
    openNewRequest(container);

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
    openHubCard(container, "request");
    openNewRequest(container);

    expect(await screen.findByText("PF 후보를 불러오는 중입니다.")).toBeInTheDocument();

    resolvePfItems([items[0]]);

    expect(await screen.findByTestId("shipping-pf-option-pf-1")).toBeInTheDocument();
  });

  it("renders full-height hub cards", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    const requestCard = container.querySelector('[data-shipping-hub-card="request"]') as HTMLElement;
    expect(requestCard.className).toContain("h-full");
    expect(requestCard.className).toContain("min-h-0");
    expect(requestCard.className).not.toContain("min-h-[360px]");
    expect(screen.queryByText("작업 선택")).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="shipping-hub-accent"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-shipping-hub-card="prep"]')).toBeTruthy();
    expect(container.querySelector('[data-shipping-hub-card="history"]')).toBeTruthy();
  });

  it("keeps a single primary new-request action in the empty request list", async () => {
    vi.mocked(api.getShippingRequests).mockResolvedValue([]);
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");

    await waitFor(() => expect(screen.getByTestId("shipping-request-list-panel")).toBeInTheDocument());
    expect(container.querySelectorAll('[data-primary-action="new-shipping-request"]')).toHaveLength(1);
    expect(screen.getAllByText("요청 목록")).toHaveLength(1);
    expect(screen.queryByTestId("shipping-request-empty-action")).not.toBeInTheDocument();
  });

  it("opens a full-width wizard that shows one request task at a time", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openNewRequest(container);

    expect(await screen.findByTestId("shipping-wizard-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-request-work-shell")).toHaveClass("flex-1");
    expect(screen.queryByTestId("shipping-wizard-step-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shipping-wizard-step-4")).not.toBeInTheDocument();
  });

  it("moves through PF, BOM, match, request info, and final send steps", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openNewRequest(container);
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
    openHubCard(container, "request");
    openRequestById(container, "requested-1");
    expect(await screen.findByTestId("shipping-request-detail")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("shipping-edit-request"));
    expect(await screen.findByTestId("shipping-wizard-step-2")).toBeInTheDocument();
  });

  it("shows PF and PA BOM groups, then carries excluded lines into send-to-prep save", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openRequestById(container, "requested-1");
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
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="prep"]')).toBeTruthy());
    openHubCard(container, "prep");
    expect(await screen.findByTestId("shipping-prep-list")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Standard PF/ })[0]);

    const detail = await screen.findByTestId("shipping-prep-detail");
    expect(detail).toHaveTextContent("출하 수량");
    expect(detail).toHaveTextContent("총 1대 출하");
    expect(detail).toHaveTextContent("1대 기준 2 EA");
    expect(detail).toHaveTextContent("총 필요 2 EA");
    expect(screen.queryByTestId("shipping-check-acc-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shipping-clear-checklist")).not.toBeInTheDocument();
    expect(api.updateShippingChecklist).not.toHaveBeenCalled();
    expect(api.clearShippingChecklist).not.toHaveBeenCalled();
  });
  it("opens shipping history details with linked transaction logs", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="history"]')).toBeTruthy());
    openHubCard(container, "history");
    expect(await screen.findByTestId("shipping-history-list")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Standard PF/ }));

    expect(await screen.findByTestId("shipping-history-detail")).toBeInTheDocument();
    expect(screen.getAllByText("SHIP-req").length).toBeGreaterThan(0);
  });

  it("does not expose request ids in request list or detail text", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    await waitFor(() => expect(screen.getByTestId("shipping-request-list-panel")).toBeInTheDocument());
    expect(screen.queryByText(/requested-1/)).not.toBeInTheDocument();

    openRequestById(container, "requested-1");
    expect(await screen.findByTestId("shipping-request-detail")).toBeInTheDocument();
    expect(screen.queryByText(/requested-1/)).not.toBeInTheDocument();
  });

  it("can send an existing requested detail to prep", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openRequestById(container, "requested-1");

    fireEvent.click(await screen.findByTestId("shipping-detail-send-to-prep"));

    await waitFor(() => {
      expect(api.sendShippingToPrep).toHaveBeenCalledWith("requested-1");
    });
  });

  it("can delete an existing requested detail after confirmation", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openRequestById(container, "requested-1");

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
    openHubCard(container, "request");
    openRequestById(container, "prepared-1");

    expect(await screen.findByTestId("shipping-request-detail")).toBeInTheDocument();
    expect(screen.queryByTestId("shipping-edit-request")).not.toBeInTheDocument();
  });
  it("syncs shipping subviews to URL history", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");

    await waitFor(() => {
      expect(navigationMock.push).toHaveBeenCalledWith(expect.stringContaining("shippingView=requestList"), expect.any(Object));
    });

    openRequestById(container, "requested-1");

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
    openHubCard(container, "request");
    openNewRequest(container);
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
    openHubCard(container, "request");
    openNewRequest(container);

    expect(await screen.findByTestId("shipping-work-title")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="shipping-work-title"]')).toHaveLength(1);
    expect(container.querySelector("select")).not.toBeInTheDocument();
  });

  it("keeps request list column bodies on the same height rhythm", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");

    expect(await screen.findByTestId("shipping-request-column-body-REQUESTED")).toHaveClass("flex-1");
    expect(screen.getByTestId("shipping-request-column-body-PREPARING")).toHaveClass("flex-1");
    expect(screen.getByTestId("shipping-request-column-body-PREPARED")).toHaveClass("flex-1");
  });
  it("puts the new-request action inside the shipping request column", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");

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
    expect(screen.getByTestId("shipping-prepare-cancel-from-detail")).toBeInTheDocument();
    expect(screen.queryByTestId("shipping-delete-request")).not.toBeInTheDocument();
  });

  it("uses compact request detail summary instead of large metric cards", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openRequestById(container, "req-1");

    const summary = await screen.findByTestId("shipping-request-detail-summary");
    expect(summary).toHaveTextContent("기준 PF");
    expect(summary).toHaveTextContent("최종 PA");
    expect(summary).toHaveTextContent("최종 PF");
    expect(screen.getByTestId("shipping-detail-actions")).toBeInTheDocument();
  });

  it("keeps request wizard tabs in the same header row and removes manual BOM buttons", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openNewRequest(container);

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
    openHubCard(container, "request");
    openRequestById(container, "requested-1");
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
    expect(screen.getByText("요청 목록을 확인하고 BOM을 수정합니다.")).toBeInTheDocument();
  });

  it("keeps wizard step labels on one line and blocks invalid next navigation", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openNewRequest(container);

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

  it("shows requester as read-only information and gives memo the main request-info space", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} operator={{ name: "김현우", role: "조립" }} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openNewRequest(container);
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
    expect(screen.getByLabelText("요청 메모")).toHaveClass("min-h-[300px]");
  });

  it("summarizes new or reused PA/PF names and item codes on the final step", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);
    await addCompanionItem();
    nextStep(container);
    fireEvent.change(await screen.findByTestId("shipping-new-pf-name"), { target: { value: "Custom PF" } });
    nextStep(container);
    nextStep(container);

    const finalSummary = await screen.findByTestId("shipping-final-summary");
    expect(finalSummary).toHaveTextContent("PF-001");
    expect(finalSummary).toHaveTextContent("Standard PF");
    expect(finalSummary).toHaveTextContent("기존 PA 재사용");
    expect(finalSummary).toHaveTextContent("Standard PA");
    expect(finalSummary).toHaveTextContent("새 PF 생성 예정");
    expect(finalSummary).toHaveTextContent("Custom PF");
    expect(finalSummary).toHaveTextContent("품목코드는 저장/준비 완료 시 자동 생성 예정");
  });

  it("moves final save and send actions into the bottom action bar", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openNewRequest(container);
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


  it("requires at least one companion item before leaving the BOM step", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openNewRequest(container);
    await selectBasePf();
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));
    nextStep(container);

    expect(await screen.findByTestId("shipping-wizard-step-2")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-wizard-next")).toBeDisabled();
    expect(screen.getByTestId("shipping-companion-required-message")).toBeInTheDocument();

    await addCompanionItem();
    expect(screen.getByTestId("shipping-wizard-next")).not.toBeDisabled();
  });

  it("shows a detailed BOM change table on the matching step", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openRequestById(container, "requested-1");
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

});
