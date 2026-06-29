import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DesktopShippingView } from "../DesktopShippingView";
import type { Item, ShippingRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    getItems: vi.fn(),
    getBOM: vi.fn(),
    getShippingRequests: vi.fn(),
    getShippingHistory: vi.fn(),
    createShippingRequest: vi.fn(),
    updateShippingRequest: vi.fn(),
    sendShippingToPrep: vi.fn(),
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
  vi.mocked(api.getItems).mockResolvedValue(items);
  vi.mocked(api.getShippingRequests).mockResolvedValue([
    request({ request_id: "requested-1", status: "REQUESTED" }),
    request(),
    request({ request_id: "prepared-1", status: "PREPARED", prepared_at: "2026-06-26T01:00:00Z" }),
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
  vi.mocked(api.sendShippingToPrep).mockResolvedValue(request({ status: "PREPARING" }));
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

  function nextStep(container: HTMLElement) {
    const button = container.querySelector('[data-testid="shipping-wizard-next"]');
    expect(button).toBeTruthy();
    fireEvent.click(button as HTMLElement);
  }

  it("renders full-height hub cards", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    const requestCard = container.querySelector('[data-shipping-hub-card="request"]') as HTMLElement;
    expect(requestCard.className).toContain("h-full");
    expect(requestCard.className).toContain("min-h-0");
    expect(requestCard.className).not.toContain("min-h-[360px]");
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
    expect(screen.queryByTestId("shipping-request-empty-action")).not.toBeInTheDocument();
  });

  it("opens a full-width wizard that shows one request task at a time", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openNewRequest(container);

    expect(await screen.findByTestId("shipping-wizard-step-1")).toBeInTheDocument();
    expect(screen.queryByTestId("shipping-wizard-step-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shipping-wizard-step-4")).not.toBeInTheDocument();
  });

  it("moves through PF, BOM, match, request info, and final send steps", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    openNewRequest(container);
    fireEvent.change(await screen.findByLabelText("기준 PF"), { target: { value: "pf-1" } });
    await waitFor(() => expect(api.getBOM).toHaveBeenCalledWith("pa-1"));

    nextStep(container);
    expect(await screen.findByTestId("shipping-wizard-step-2")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-bom-editor-pa")).toBeInTheDocument();
    expect(screen.queryByTestId("shipping-request-info-fields")).not.toBeInTheDocument();

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
    fireEvent.click(await screen.findByRole("button", { name: /requested-1/ }));
    expect(await screen.findByTestId("shipping-request-detail")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("shipping-edit-request"));
    expect(await screen.findByTestId("shipping-wizard-step-2")).toBeInTheDocument();
  });

  it("shows PF and PA BOM groups, then carries excluded lines into send-to-prep save", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    fireEvent.click(await screen.findByRole("button", { name: /requested-1/ }));
    fireEvent.click(await screen.findByTestId("shipping-edit-request"));

    expect(await screen.findByTestId("shipping-wizard-step-2")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-bom-editor-pf")).toBeInTheDocument();
    expect(screen.getByTestId("shipping-bom-editor-pa")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Cable Set/ }));
    expect(container.querySelector('[data-bom-line-child="acc-1"][data-bom-line-included="false"]')).toBeTruthy();
    fireEvent.click(screen.getByTestId("shipping-add-pa-line"));
    expect(container.querySelector('[data-bom-line-origin="CUSTOM"]')).toBeTruthy();

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

  it("opens prep detail and supports checklist updates", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="prep"]')).toBeTruthy());
    openHubCard(container, "prep");
    expect(await screen.findByTestId("shipping-prep-list")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Standard PF/ })[0]);

    expect(await screen.findByTestId("shipping-prep-detail")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("shipping-check-acc-1"));

    await waitFor(() => {
      expect(api.updateShippingChecklist).toHaveBeenCalledWith("req-1", {
        checks: [{ item_id: "acc-1", checked: true }],
      });
    });

    fireEvent.click(screen.getByTestId("shipping-clear-checklist"));
    await waitFor(() => {
      expect(api.clearShippingChecklist).toHaveBeenCalledWith("req-1");
    });
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

  it("locks prepared requests in detail view", async () => {
    const { container } = render(<DesktopShippingView onStatusChange={() => {}} />);

    await waitFor(() => expect(container.querySelector('[data-shipping-hub-card="request"]')).toBeTruthy());
    openHubCard(container, "request");
    fireEvent.click(await screen.findByRole("button", { name: /prepared-1/ }));

    expect(await screen.findByTestId("shipping-request-detail")).toBeInTheDocument();
    expect(screen.queryByTestId("shipping-edit-request")).not.toBeInTheDocument();
  });
});
