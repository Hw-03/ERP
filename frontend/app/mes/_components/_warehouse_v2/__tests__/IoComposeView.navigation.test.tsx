import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item, ItemConversionResult } from "@/lib/api";
import { api } from "@/lib/api";
import { IoComposeView } from "../IoComposeView";

const routerPush = vi.fn();
const setAuditScreen = vi.hoisted(() => vi.fn());
const sendClientEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/activity-audit-context", () => ({ setAuditScreen }));
vi.mock("@/lib/client-events", () => ({ sendClientEvent }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/mes",
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams("tab=warehouse"),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getAllBOM: vi.fn(),
    getItems: vi.fn(),
    preview: vi.fn(),
    saveDraft: vi.fn(),
    getDraft: vi.fn(),
    deleteDraft: vi.fn(),
    submit: vi.fn(),
    submitDraft: vi.fn(),
    getItemConversionPreview: vi.fn(),
    executeItemConversion: vi.fn(),
  },
}));

vi.mock("../IoBundleCart", () => ({
  IoBundleCart: ({ onAdvance }: { onAdvance: () => void }) => (
    <button type="button" data-testid="draft-step-advance" onClick={onAdvance}>advance</button>
  ),
}));

vi.mock("../IoConfirmStep", () => ({
  IoConfirmStep: ({
    onSaveDraft,
    onSubmit,
  }: {
    onSaveDraft: () => void;
    onSubmit: () => void;
  }) => (
    <>
      <button type="button" data-testid="draft-save" onClick={onSaveDraft}>save</button>
      <button type="button" data-testid="confirm-submit" onClick={onSubmit}>submit</button>
    </>
  ),
}));

const operator = {
  employee_id: "op-1",
  name: "operator",
  department: "조립",
  warehouse_role: "none",
};

function conversionItem(id: string, name: string, quantity: number): Item {
  return {
    item_id: id,
    item_name: name,
    unit: "EA",
    quantity,
    warehouse_qty: quantity,
    production_total: 0,
    defective_total: 0,
    pending_quantity: 0,
    available_quantity: quantity,
    last_reserver_name: null,
    location: null,
    locations: [],
    legacy_part: null,
    legacy_item_type: null,
    supplier: null,
    min_stock: null,
    mes_code: id,
    model_symbol: null,
    model_slots: [],
    process_type_code: "AF",
    serial_no: null,
    bom_completed_at: "2026-07-10T00:00:00Z",
    deleted_at: null,
    created_at: "2026-07-10T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
    department: null,
  };
}

const conversionItems = [
  conversionItem("af-1", "소스 AF", 5),
  conversionItem("af-2", "대상 AF", 0),
];

const conversionResult: ItemConversionResult = {
  request_id: null,
  requested_mode: "BOM",
  resolved_mode: "BOM",
  executable: true,
  blocking_reason: null,
  source_item_id: "af-1",
  source_item_name: "소스 AF",
  source_mes_code: "af-1",
  target_item_id: "af-2",
  target_item_name: "대상 AF",
  target_mes_code: "af-2",
  quantity: 1,
  source_department: "assembly",
  source_current_quantity: 5,
  source_available_quantity: 5,
  source_shortage_quantity: 0,
  reference_no: "ITEM-CONV-1",
  memo: "전환 사유",
  completed_at: "2026-07-10T00:00:00Z",
  lines: [],
  transactions: [],
};

function renderCompose(items: Item[] = [], currentOperator = operator) {
  return render(
    <IoComposeView
      globalSearch=""
      operator={currentOperator}
      employees={[]}
      items={items}
      productModels={[]}
      setItems={() => {}}
      onStatusChange={() => {}}
    />,
  );
}

function workTypeCards(): HTMLButtonElement[] {
  return screen.getAllByRole("button").filter((button): button is HTMLButtonElement => button.hasAttribute("aria-pressed"));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAllBOM).mockResolvedValue([]);
  vi.mocked(api.getItems).mockResolvedValue([]);
  vi.mocked(api.saveDraft).mockImplementation(async (payload) => ({
    batch_id: payload.batch_id,
  } as never));
  vi.mocked(api.getItemConversionPreview).mockResolvedValue(conversionResult);
  vi.mocked(api.executeItemConversion).mockResolvedValue(conversionResult);
  routerPush.mockClear();
  setAuditScreen.mockClear();
  sendClientEvent.mockClear();
});

describe("IoComposeView navigation chrome", () => {
  it("작성 중으로 복귀한 작업의 반려 사유를 조합 화면 상단에 표시하지 않는다", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
      <IoComposeView
        globalSearch=""
        operator={operator}
        employees={[]}
        items={[]}
        productModels={[]}
        setItems={() => {}}
        onStatusChange={() => {}}
        restoreDraft={{
          batch_id: "rejected-draft", work_type: "process", sub_type: "adjust_in", status: "draft",
          requester_employee_id: operator.employee_id, requester_name: operator.name,
          requester_department: operator.department, approver_employee_id: null, approver_name: null,
          from_department: null, to_department: "조립", requires_approval: true,
          stock_request_id: null, reference_no: "ADJ-1", notes: "재확인", created_at: "2026-08-04T00:00:00Z",
          updated_at: "2026-08-04T00:00:00Z", submitted_at: null, completed_at: null, bundles: [],
          stock_requests: [
            {
              stock_request_id: "old", request_code: "SR-old", status: "rejected", from_bucket: "none",
              from_department: null, approval_kind: "department", requires_warehouse_approval: false,
              requires_department_approval: true, approver_employee_id: null, approver_name: null,
              rejected_by_name: "이전 결재자", rejected_at: "2026-08-04T00:05:00Z", rejected_reason: "이전 사유",
            },
            {
              stock_request_id: "new", request_code: "SR-new", status: "rejected", from_bucket: "none",
              from_department: null, approval_kind: "department", requires_warehouse_approval: false,
              requires_department_approval: true, approver_employee_id: null, approver_name: null,
              rejected_by_name: "최신 결재자", rejected_at: "2026-08-04T01:05:00Z", rejected_reason: "최신 사유",
            },
          ],
        }}
      />
      </QueryClientProvider>
    );

    expect(screen.queryByText("반려 사유: 최신 사유")).not.toBeInTheDocument();
    expect(screen.queryByText(/최신 결재자.*2026년 08월 04일 10시 05분/)).not.toBeInTheDocument();
    expect(screen.queryByText("반려 사유: 이전 사유")).not.toBeInTheDocument();
  });

  it("records detailed warehouse workflow screen arrivals and step moves", async () => {
    renderCompose();

    expect(setAuditScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: "warehouse.io.receive.receive_supplier.step1" }),
      { priority: "workflow" },
    );
    expect(sendClientEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      event: "ui_nav",
      from: "desktop.warehouse",
      to: "warehouse.io.receive.receive_supplier.step1",
      screen_key: "warehouse.io.receive.receive_supplier.step1",
      screen_label: expect.any(String),
      source: "desktop",
    }));

    fireEvent.click(workTypeCards()[1]);

    await waitFor(() => {
      expect(sendClientEvent).toHaveBeenLastCalledWith(expect.objectContaining({
        event: "ui_nav",
        to: expect.stringContaining(".step2"),
        source: "desktop",
      }));
    });
  });

  it("ignores a legacy linked shipping request intent", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <IoComposeView
          globalSearch=""
          operator={operator}
          employees={[]}
          items={[]}
          productModels={[]}
          setItems={() => {}}
          onStatusChange={() => {}}
          entryIntent={{
            workType: "process",
            direction: "in",
            shippingPrepare: {
              shippingRequestId: "req-1",
              requestLabel: "Standard PF",
            },
          } as never}
        />
      </QueryClientProvider>,
    );

    expect(screen.queryByTestId("io-shipping-prepare-context")).not.toBeInTheDocument();
    expect(screen.queryByText("출하 준비 연결")).not.toBeInTheDocument();
  });

  it("waits to publish draft status until the success notice reaches the status target", async () => {
    const onStatusChange = vi.fn();
    vi.mocked(api.saveDraft).mockResolvedValue({ batch_id: "draft-save" } as never);

    render(
      <IoComposeView
        globalSearch=""
        operator={operator}
        employees={[]}
        items={[]}
        productModels={[]}
        setItems={() => {}}
        onStatusChange={onStatusChange}
        restoreDraft={{
          batch_id: "draft-save",
          work_type: "warehouse_io",
          sub_type: "warehouse_to_dept",
          from_department: "조립",
          to_department: "조립",
          bundles: [{
            bundle_id: "bundle-1",
            source_kind: "direct_item",
            title: "test",
            source_item_id: "item-1",
            source_mes_code: "ITEM-1",
            quantity: 1,
            expanded_level: 0,
            lines: [{
              line_id: "line-1",
              item_id: "item-1",
              item_name: "test",
              mes_code: "ITEM-1",
              unit: "EA",
              direction: "out",
              from_bucket: "warehouse",
              from_department: null,
              to_bucket: "production",
              to_department: "조립",
              quantity: 1,
              bom_expected: null,
              included: true,
              origin: "direct",
              edited: false,
              has_children: false,
              shortage: 0,
              exclusion_note: null,
            }],
          }],
        } as never}
      />,
    );

    await screen.findByTestId("draft-step-advance");
    onStatusChange.mockClear();
    fireEvent.click(screen.getByTestId("draft-step-advance"));
    fireEvent.click(await screen.findByTestId("draft-save"));

    const notice = await screen.findByTestId("io-draft-save-notice");
    expect(onStatusChange).not.toHaveBeenCalled();
    fireEvent.animationEnd(notice);
    expect(onStatusChange).toHaveBeenCalledWith(expect.stringMatching(/^저장됨 · \d{2}:\d{2}$/));
  });

  it("shows a location-based success title after multiple internal-use approval requests", async () => {
    vi.mocked(api.submitDraft).mockResolvedValue({
      batch: {},
      status: "submitted",
      requires_approval: true,
      stock_request_id: null,
      stock_requests: [
        { approval_kind: "warehouse" },
        { approval_kind: "department" },
      ],
      message: "위치별 결재 요청이 생성되었습니다.",
    } as never);

    render(
      <IoComposeView
        globalSearch=""
        operator={{ ...operator, department: "AS" }}
        employees={[]}
        items={[]}
        productModels={[]}
        setItems={() => {}}
        onStatusChange={() => {}}
        restoreStep={5}
        restoreDraft={{
          batch_id: "draft-mixed-location",
          work_type: "internal_use",
          sub_type: "internal_use_out",
          from_department: null,
          to_department: "AS",
          reference_no: null,
          notes: null,
          bundles: [{
            bundle_id: "bundle-mixed-location",
            source_kind: "direct_item",
            title: "위치별 사용출고",
            source_item_id: "warehouse-item",
            source_mes_code: "8-TR-0001",
            quantity: 1,
            expanded_level: 0,
            lines: [
              {
                line_id: "warehouse-line",
                item_id: "warehouse-item",
                item_name: "창고 품목",
                mes_code: "8-TR-0001",
                unit: "EA",
                direction: "out",
                from_bucket: "warehouse",
                from_department: null,
                to_bucket: "none",
                to_department: "AS",
                quantity: 1,
                bom_expected: null,
                included: true,
                origin: "direct",
                edited: false,
                has_children: false,
                shortage: 0,
                exclusion_note: null,
              },
              {
                line_id: "department-line",
                item_id: "department-item",
                item_name: "부서 품목",
                mes_code: "8-TR-0002",
                unit: "EA",
                direction: "out",
                from_bucket: "production",
                from_department: "튜브",
                to_bucket: "none",
                to_department: "AS",
                quantity: 1,
                bom_expected: null,
                included: true,
                origin: "direct",
                edited: false,
                has_children: false,
                shortage: 0,
                exclusion_note: null,
              },
            ],
          }],
        } as never}
      />,
    );

    fireEvent.click(await screen.findByTestId("confirm-submit"));

    expect(await screen.findByText("위치별 결재 요청 완료")).toBeInTheDocument();
    expect(screen.queryByText("원본별 결재 요청 완료")).not.toBeInTheDocument();
  });

  it("작업자가 바뀐 뒤에는 현재 작업자 ID로 기존 초안을 제출한다", async () => {
    vi.mocked(api.submitDraft).mockResolvedValue({
      batch: {},
      status: "submitted",
      requires_approval: true,
      stock_request_id: null,
      stock_requests: [{ approval_kind: "department" }],
      message: "부서 결재 요청이 생성되었습니다.",
    } as never);
    const previousOperator = { ...operator, employee_id: "dept-approver" };
    const currentOperator = { ...operator, employee_id: "assembly-staff" };
    const restoreDraft = {
      batch_id: "operator-switch-draft",
      work_type: "process",
      sub_type: "produce",
      from_department: "조립",
      to_department: "조립",
      reference_no: null,
      notes: null,
      bundles: [],
    } as never;
    const { rerender } = render(
      <IoComposeView
        globalSearch=""
        operator={previousOperator}
        employees={[]}
        items={[]}
        productModels={[]}
        setItems={() => {}}
        onStatusChange={() => {}}
        restoreStep={5}
        restoreDraft={restoreDraft}
      />,
    );

    await screen.findByTestId("confirm-submit");
    rerender(
      <IoComposeView
        globalSearch=""
        operator={currentOperator}
        employees={[]}
        items={[]}
        productModels={[]}
        setItems={() => {}}
        onStatusChange={() => {}}
        restoreStep={5}
        restoreDraft={restoreDraft}
      />,
    );
    fireEvent.click(await screen.findByTestId("confirm-submit"));

    await waitFor(() => {
      expect(api.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
        requester_employee_id: currentOperator.employee_id,
        batch_id: "operator-switch-draft",
        work_type: "process",
        sub_type: "produce",
        bundles: [],
      }));
      expect(api.submitDraft).toHaveBeenCalledWith(
        "operator-switch-draft",
        currentOperator.employee_id,
      );
    });
  });

  it("복원 draft의 최종 편집 snapshot을 같은 batch에 저장한 뒤 한 번만 제출한다", async () => {
    const save = deferred<{ batch_id: string }>();
    vi.mocked(api.saveDraft).mockImplementation(() => save.promise as never);
    vi.mocked(api.submitDraft).mockResolvedValue({
      batch: {}, status: "submitted", requires_approval: false, stock_request_id: null,
      stock_requests: [], message: "완료",
    } as never);
    const finalBundles = [{
      bundle_id: "bundle-final",
      source_kind: "direct_item",
      title: "추가·제외·삭제 후 최종 구성",
      source_item_id: "added-item",
      source_mes_code: "ADDED-1",
      quantity: 7,
      expanded_level: 0,
      lines: [
        {
          line_id: "added-line", item_id: "added-item", item_name: "추가 품목", mes_code: "ADDED-1", unit: "EA",
          direction: "out", from_bucket: "warehouse", from_department: null, to_bucket: "production", to_department: "조립",
          quantity: 7, bom_expected: null, included: true, origin: "direct", edited: true, has_children: false,
          shortage: 0, exclusion_note: null,
        },
        {
          line_id: "excluded-line", item_id: "bom-item", item_name: "제외 품목", mes_code: "BOM-1", unit: "EA",
          direction: "out", from_bucket: "warehouse", from_department: null, to_bucket: "production", to_department: "조립",
          quantity: 2, bom_expected: 2, included: false, origin: "bom", edited: true, has_children: false,
          shortage: 0, exclusion_note: "대체 품목 사용",
        },
      ],
    }] as never;

    render(
      <IoComposeView
        globalSearch=""
        operator={operator}
        employees={[]}
        items={[]}
        productModels={[]}
        setItems={() => {}}
        onStatusChange={() => {}}
        restoreStep={5}
        restoreDraft={{
          batch_id: "edited-desktop-draft", work_type: "warehouse_io", sub_type: "warehouse_to_dept",
          from_department: "원자재", to_department: "조립", reference_no: "EDIT-REF-7", notes: "최종 메모",
          bundles: finalBundles,
        } as never}
      />,
    );

    const submit = await screen.findByTestId("confirm-submit");
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => {
      expect(api.saveDraft).toHaveBeenCalledTimes(1);
    });
    expect(api.saveDraft).toHaveBeenCalledWith({
      requester_employee_id: operator.employee_id,
      work_type: "warehouse_io",
      sub_type: "warehouse_to_dept",
      from_department: "원자재",
      to_department: "조립",
      reference_no: "EDIT-REF-7",
      notes: "최종 메모",
      batch_id: "edited-desktop-draft",
      bundles: finalBundles,
    });
    expect(vi.mocked(api.saveDraft).mock.calls[0]?.[0]?.bundles[0]?.lines).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ line_id: "deleted-line" }),
    ]));
    expect(api.submitDraft).not.toHaveBeenCalled();

    await act(async () => {
      save.resolve({ batch_id: "edited-desktop-draft" });
      await save.promise;
    });

    await waitFor(() => {
      expect(api.submitDraft).toHaveBeenCalledTimes(1);
      expect(api.submitDraft).toHaveBeenCalledWith("edited-desktop-draft", operator.employee_id);
    });
  });

  it("AS 작업자에게 독립 사용출고 카드를 보이고 품목 전환은 숨긴다", async () => {
    renderCompose([], { ...operator, department: "AS" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /AS·연구 사용출고/ })).toBeInTheDocument();
      expect(screen.queryByTestId("warehouse-item-conversion-card")).not.toBeInTheDocument();
    });
  });

  it("AS·연구 사용출고의 부서 원본 선택을 미리보기 요청에 전달한다", async () => {
    const item = {
      ...conversionItem("item-1", "AS 사용품", 5),
      locations: [{
        department: "조립",
        status: "PRODUCTION",
        quantity: 5,
        pending_quantity: 1,
        available_quantity: 4,
      }],
    } as Item;
    vi.mocked(api.preview).mockResolvedValue({
      bundles: [{
        bundle_id: "bundle-department",
        source_kind: "manual",
        title: "AS 사용품",
        source_item_id: "item-1",
        source_mes_code: "item-1",
        quantity: 1,
        expanded_level: 0,
        lines: [{
          line_id: "line-department",
          item_id: "item-1",
          item_name: "AS 사용품",
          mes_code: "item-1",
          unit: "EA",
          direction: "out",
          from_bucket: "production",
          from_department: "조립",
          to_bucket: "none",
          to_department: "AS",
          quantity: 1,
          bom_expected: null,
          included: true,
          origin: "manual",
          edited: false,
          has_children: false,
          shortage: 0,
          exclusion_note: null,
        }],
      }],
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <IoComposeView
          globalSearch=""
          operator={{ ...operator, department: "AS" }}
          employees={[]}
          items={[item]}
          productModels={[]}
          setItems={() => {}}
          onStatusChange={() => {}}
          restoreStep={3}
          restoreDraft={{
            batch_id: "draft-internal-use",
            work_type: "internal_use",
            sub_type: "internal_use_out",
            from_department: null,
            to_department: "AS",
            reference_no: null,
            notes: null,
            bundles: [],
          } as never}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "조립 수량 4" }));
    fireEvent.click(screen.getByRole("button", { name: "부서 낱개" }));

    await waitFor(() => {
      expect(api.preview).toHaveBeenCalledWith(expect.objectContaining({
        work_type: "internal_use",
        sub_type: "internal_use_out",
        to_department: "AS",
        targets: [{
          source_kind: "manual",
          item_id: "item-1",
          quantity: 1,
          source_location: "department",
        }],
      }));
    });
  });

  it("keeps one five-step navigation row and removes duplicate active headers", async () => {
    renderCompose();

    expect(workTypeCards()).toHaveLength(2);
    expect(screen.queryByTestId("io-step-nav")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-active-step-number")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-active-step-title")).not.toBeInTheDocument();

    fireEvent.click(workTypeCards()[1]);

    await waitFor(() => {
      expect(screen.getByTestId("io-step-nav")).toBeInTheDocument();
    });
    const navItems = screen.getAllByTestId("io-step-nav-item");
    expect(navItems).toHaveLength(5);
    expect(within(screen.getByTestId("io-step-nav")).getByText("수량 조정")).toBeInTheDocument();
    expect(within(screen.getByTestId("io-step-nav")).queryByText("품목 확인")).not.toBeInTheDocument();
    expect(navItems[0]).toHaveClass("done");
    expect(navItems[1]).toHaveClass("a");
    expect(navItems.slice(2).every((item) => item.classList.contains("locked"))).toBe(true);
    expect(navItems[0]).not.toHaveAttribute("disabled");
    expect(navItems.slice(2).every((item) => item.hasAttribute("disabled"))).toBe(true);
    expect(screen.queryByTestId("wizard-active-step-number")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-active-step-title")).not.toBeInTheDocument();

    fireEvent.click(navItems[0]);

    await waitFor(() => {
      expect(screen.queryByTestId("io-step-nav")).not.toBeInTheDocument();
    });
    expect(workTypeCards()).toHaveLength(2);
  });

  it("hides the five-step navigation and passes the fullscreen handler to the real Step 3 picker", async () => {
    const onItemPickerFullscreenChange = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <IoComposeView
          globalSearch=""
          operator={operator}
          employees={[]}
          items={[conversionItem("item-1", "전체 화면 품목", 5)]}
          productModels={[]}
          setItems={() => {}}
          onStatusChange={() => {}}
          restoreStep={3}
          restoreDraft={{
            batch_id: "draft-fullscreen-step-3",
            work_type: "warehouse_io",
            sub_type: "warehouse_to_dept",
            from_department: null,
            to_department: "조립",
            bundles: [],
          } as never}
          itemPickerFullscreen
          onItemPickerFullscreenChange={onItemPickerFullscreenChange}
        />
      </QueryClientProvider>,
    );

    const exitButton = await screen.findByRole("button", { name: "전체 화면 해제" });

    expect(screen.queryByTestId("io-step-nav")).not.toBeInTheDocument();
    onItemPickerFullscreenChange.mockClear();
    fireEvent.click(exitButton);
    expect(onItemPickerFullscreenChange).toHaveBeenLastCalledWith(false);
  });

  it("does not show a preselected work type while choosing Step 1", async () => {
    renderCompose();

    expect(screen.queryByTestId("io-step-nav")).not.toBeInTheDocument();
    expect(workTypeCards()).toHaveLength(2);
    expect(workTypeCards().every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);

    fireEvent.click(workTypeCards()[1]);
    await waitFor(() => {
      expect(screen.getByTestId("io-step-nav")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTestId("io-step-nav-item")[0]);
    await waitFor(() => {
      expect(screen.queryByTestId("io-step-nav")).not.toBeInTheDocument();
    });

    expect(workTypeCards()).toHaveLength(2);
    expect(workTypeCards().every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("restores item conversion one step at a time from browser history", async () => {
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    renderCompose(conversionItems);

    fireEvent.click(screen.getByTestId("warehouse-item-conversion-card"));

    expect(pushStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ wic: 1 }),
      "",
      expect.any(String),
    );
    expect(screen.getByTestId("item-conversion-source-search")).toBeInTheDocument();
    expect(screen.getByTestId("item-conversion-quantity")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("item-conversion-source-option-af-1"));
    fireEvent.click(screen.getByTestId("item-conversion-target-option-af-2"));
    fireEvent.click(screen.getByTestId("item-conversion-next-button"));
    await screen.findByTestId("item-conversion-preview");
    expect(pushStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ wic: 2 }),
      "",
      expect.any(String),
    );

    fireEvent.change(screen.getByTestId("item-conversion-memo"), { target: { value: "history memo" } });
    fireEvent.click(screen.getByTestId("item-conversion-execute-next-button"));
    expect(screen.getByTestId("item-conversion-execute-step")).toBeInTheDocument();
    expect(pushStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ wic: 3 }),
      "",
      expect.any(String),
    );

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { wic: 2 } }));
    });
    await waitFor(() => {
      expect(screen.getByTestId("item-conversion-preview")).toBeInTheDocument();
    });
    expect(screen.getByTestId("item-conversion-memo")).toHaveValue("history memo");

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { wic: 1 } }));
    });
    await waitFor(() => {
      expect(screen.getByTestId("item-conversion-source-search")).toBeInTheDocument();
    });
    expect(screen.getByTestId("item-conversion-source-option-af-1")).toHaveTextContent(/./);

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { wic: 2 } }));
    });
    await waitFor(() => {
      expect(screen.getByTestId("item-conversion-preview")).toBeInTheDocument();
    });
    expect(screen.getByTestId("item-conversion-memo")).toHaveValue("history memo");

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("warehouse-item-conversion-card")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("item-conversion-source-search")).not.toBeInTheDocument();

    pushStateSpy.mockRestore();
  });

  it("returns directly to the work-type selection from the conversion navigation", async () => {
    const historyGoSpy = vi.spyOn(window.history, "go");
    renderCompose(conversionItems);

    fireEvent.click(screen.getByTestId("warehouse-item-conversion-card"));
    fireEvent.click(screen.getByTestId("item-conversion-source-option-af-1"));
    fireEvent.click(screen.getByTestId("item-conversion-target-option-af-2"));
    fireEvent.click(screen.getByTestId("item-conversion-next-button"));
    await screen.findByTestId("item-conversion-preview");
    fireEvent.change(screen.getByTestId("item-conversion-memo"), { target: { value: "history memo" } });
    fireEvent.click(screen.getByTestId("item-conversion-execute-next-button"));

    fireEvent.click(screen.getAllByTestId("item-conversion-step-nav-item")[0]);

    expect(historyGoSpy).toHaveBeenCalledWith(-3);
    expect(screen.getByTestId("warehouse-item-conversion-card")).toBeInTheDocument();
    historyGoSpy.mockRestore();
  });

  it("returns to work type selection after a confirmed item conversion", async () => {
    renderCompose(conversionItems);

    fireEvent.click(screen.getByTestId("warehouse-item-conversion-card"));
    fireEvent.click(screen.getByTestId("item-conversion-source-option-af-1"));
    fireEvent.click(screen.getByTestId("item-conversion-target-option-af-2"));
    fireEvent.click(screen.getByTestId("item-conversion-next-button"));

    await screen.findByTestId("item-conversion-preview");
    fireEvent.change(screen.getByTestId("item-conversion-memo"), { target: { value: "전환 사유" } });
    fireEvent.click(screen.getByTestId("item-conversion-execute-next-button"));
    fireEvent.click(screen.getByTestId("item-conversion-confirm-button"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "전환 실행" }));

    await waitFor(() => {
      expect(api.executeItemConversion).toHaveBeenCalledTimes(1);
    });
    expect(api.executeItemConversion).toHaveBeenCalledWith(
      expect.objectContaining({ requester_employee_id: operator.employee_id }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("warehouse-item-conversion-card")).toBeInTheDocument();
    });
    expect(screen.queryByText("품목 전환 완료")).not.toBeInTheDocument();
    expect(window.history.state?.wic).toBeUndefined();
  });
});
