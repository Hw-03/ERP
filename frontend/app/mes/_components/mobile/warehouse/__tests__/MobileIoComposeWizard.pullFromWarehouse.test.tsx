import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileIoComposeWizard } from "../MobileIoComposeWizard";

const state = vi.hoisted(() => ({
  step: 4,
  workType: "process",
  subType: "produce",
  deptIoDirection: "in",
  fromDepartment: "조립",
  toDepartment: "조립",
  bundles: [{
    bundle_id: "source-bundle",
    lines: [
      { line_id: "short-1", item_id: "short-item-1", included: true, shortage: 1, quantity: 1 },
      { line_id: "short-2", item_id: "short-item-2", included: true, shortage: 1, quantity: 1 },
    ],
  }] as { bundle_id: string; lines: { line_id: string; item_id: string; included: boolean; shortage: number; quantity?: number }[] }[],
  notes: "",
  referenceNo: "",
  includedLines: [],
  excludedLines: [],
  hasShortage: true,
  hasInvalidQuantity: false,
  hasMissingInternalUseBomMode: false,
  canAdvance: { 2: true, 4: false },
  setWorkType: vi.fn(),
  setSubType: vi.fn(),
  setToDepartment: vi.fn(),
  setBundles: vi.fn(),
  setNotes: vi.fn(),
  setReferenceNo: vi.fn(),
  setFromDepartment: vi.fn(),
  setDeptIoDirection: vi.fn(),
  goTo: vi.fn(),
  goPrev: vi.fn(),
  goNext: vi.fn(),
  reset: vi.fn(),
  removeLine: vi.fn(),
}));
const saveDraft = vi.hoisted(() => vi.fn());
const previewTarget = vi.hoisted(() => vi.fn());
const submit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ api: { getAllBOM: vi.fn(() => new Promise(() => {})), getItems: vi.fn(() => Promise.resolve([])) } }));
vi.mock("../../../_warehouse_v2/useIoWorkState", () => ({ useIoWorkState: () => state }));
vi.mock("../../../_warehouse_v2/useIoDraftRestore", () => ({ useIoDraftRestore: () => {} }));
vi.mock("../../../_warehouse_v2/useIoDraft", () => ({ useIoDraft: () => ({ drafting: false, saveDraft }) }));
vi.mock("../../../_warehouse_v2/useIoPreview", () => ({ useIoPreview: () => ({ previewing: false, previewTarget }) }));
vi.mock("../../../_warehouse_v2/useIoSubmit", () => ({
  useIoSubmit: () => ({ submitting: false, run: (work: () => Promise<unknown>) => work(), submit }),
}));
vi.mock("../MobileWorkTypeStep", () => ({
  MobileWorkTypeStep: () => null,
  MobileSubTypeStep: ({ onSubTypeChange }: { onSubTypeChange: (subType: "disassemble") => void }) => (
    <button type="button" onClick={() => onSubTypeChange("disassemble")}>모바일 세부 유형 변경</button>
  ),
}));
vi.mock("../../../_warehouse_v2/IoConfirmStep", () => ({
  IoConfirmStep: ({ onSubmit }: { onSubmit: () => void }) => (
    <button type="button" onClick={onSubmit}>모바일 제출</button>
  ),
}));
vi.mock("../../../_warehouse_v2/IoBundleCart", () => ({
  IoBundleCart: ({ bundles, onPullFromWarehouse, onQuantityChange, onSaveDraft, pulling }: {
    bundles: { bundle_id: string; lines: { line_id: string; quantity?: number }[] }[];
    onPullFromWarehouse: () => void;
    onQuantityChange: (bundleId: string, lineId: string, quantity: number, shortage: number) => void;
    onSaveDraft: () => void;
    pulling: boolean;
  }) => (
    <>
      <output data-testid="mobile-pull-cart-state">
        {`${bundles[0]?.bundle_id ?? "none"}:${bundles[0]?.lines[0]?.quantity ?? "none"}`}
      </output>
      <output data-testid="mobile-pull-busy-state">{pulling ? "pulling" : "idle"}</output>
      <button
        type="button"
        onClick={() => {
          const bundle = bundles[0];
          const line = bundle?.lines[0];
          if (bundle && line) onQuantityChange(bundle.bundle_id, line.line_id, 7, 0);
        }}
      >
        모바일 첫 품목 수량 변경
      </button>
      <button type="button" onClick={onPullFromWarehouse}>부족 품목 가져오기</button>
      <button type="button" onClick={onSaveDraft}>모바일 임시저장</button>
    </>
  ),
}));
vi.mock("../../../_warehouse_v2/IoTargetPicker", () => ({
  IoTargetPicker: ({ bundles, filters, onAddItem, onFiltersChange, search, onSearchChange }: {
    bundles: { source_kind?: string }[];
    filters: { department: string; model: string; stage: string };
    onAddItem: (item: { item_id: string; item_name: string }, sourceKind: "direct_item", subType: "produce") => void;
    onFiltersChange: (filters: { department: string; model: string; stage: string }) => void;
    search: string;
    onSearchChange: (search: string) => void;
  }) => (
    <>
      <output data-testid="mobile-picker-filter-state">{`${filters.department}|${filters.model}|${filters.stage}|${search}`}</output>
      <output data-testid="mobile-picker-bundle-kinds">{bundles.map((bundle) => bundle.source_kind).join(",")}</output>
      <button type="button" onClick={() => onAddItem({ item_id: "same-item", item_name: "BOM 품목" }, "direct_item", "produce")}>BOM 품목 추가</button>
      <button type="button" onClick={() => onFiltersChange({ department: "조립", model: "MODEL-1", stage: "DONE" })}>필터 적용</button>
      <button type="button" onClick={() => onSearchChange("검색어")}>검색 적용</button>
    </>
  ),
}));

const operator = { employee_id: "op-1", name: "작업자", department: "조립", warehouse_role: "none" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderWizard(onDraftSaved = vi.fn(), onStatusChange = vi.fn(), onDirtyChange = vi.fn()) {
  return render(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={onStatusChange} onDraftSaved={onDraftSaved} onDirtyChange={onDirtyChange} />);
}

function applyBundleUpdates() {
  state.setBundles.mockImplementation((next: unknown) => {
    state.bundles = typeof next === "function"
      ? (next as (previous: typeof state.bundles) => typeof state.bundles)(state.bundles)
      : next as typeof state.bundles;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.setBundles.mockReset();
  state.step = 4;
  state.workType = "process";
  state.subType = "produce";
  state.deptIoDirection = "in";
  state.bundles = [{
    bundle_id: "source-bundle",
    lines: [
      { line_id: "short-1", item_id: "short-item-1", included: true, shortage: 1, quantity: 1 },
      { line_id: "short-2", item_id: "short-item-2", included: true, shortage: 1, quantity: 1 },
    ],
  }];
  saveDraft.mockResolvedValue({ batch_id: "source-draft" });
  submit.mockResolvedValue({ requires_approval: false, message: "제출 완료" });
  previewTarget.mockReset();
  previewTarget.mockImplementation(({ target }: { target: { item_id: string } }) => Promise.resolve({ bundles: [{ bundle_id: `warehouse-${target.item_id}`, lines: [] }] }));
});

describe("MobileIoComposeWizard 부족 품목 가져오기", () => {
  it("process 단품 폼에서 picker로 전환해 기존 낱개를 보존한 채 BOM을 추가한다", async () => {
    state.step = 3;
    state.workType = "process";
    state.subType = "adjust_in";
    state.deptIoDirection = "in";
    state.bundles = [{
      bundle_id: "manual-bundle",
      source_kind: "manual",
      source_item_id: "same-item",
      title: "낱개 품목",
      quantity: 1,
      lines: [{ line_id: "manual-line", item_id: "same-item", included: true, quantity: 1 }],
    }];
    applyBundleUpdates();
    previewTarget.mockResolvedValueOnce({
      bundles: [{
        bundle_id: "bom-bundle",
        source_kind: "bom_parent",
        source_item_id: "same-item",
        title: "BOM 품목",
        quantity: 1,
        lines: [{ line_id: "bom-line", item_id: "same-item", included: true, quantity: 1 }],
      }],
    });
    const view = renderWizard();

    expect(screen.getByRole("button", { name: "증가" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /작성 중 저장/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /최종 검토/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "BOM·품목 더 담기" }));

    expect(screen.getByRole("button", { name: "BOM 품목 추가" })).toBeInTheDocument();
    expect(screen.getByTestId("mobile-picker-bundle-kinds")).toHaveTextContent("manual");
    fireEvent.click(screen.getByRole("button", { name: "BOM 품목 추가" }));
    await waitFor(() => expect(previewTarget).toHaveBeenCalledWith(expect.objectContaining({ subType: "produce" })));
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={vi.fn()} />);

    expect(screen.getByTestId("mobile-picker-bundle-kinds")).toHaveTextContent("manual,bom_parent");
  });

  it("warehouse_adjust는 기존 단품 폼을 유지하고 picker 전환을 노출하지 않는다", () => {
    state.step = 3;
    state.workType = "warehouse_adjust";
    state.subType = "warehouse_adjust_in";
    state.bundles = [];

    renderWizard();

    expect(screen.getByRole("button", { name: /작성 중 저장/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /최종 검토/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "BOM·품목 더 담기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "BOM 품목 추가" })).not.toBeInTheDocument();
  });

  it("process picker 전환은 새 세부작업을 시작하면 초기화한다", () => {
    state.step = 3;
    state.workType = "process";
    state.subType = "adjust_in";
    state.bundles = [{
      bundle_id: "manual-bundle",
      source_kind: "manual",
      source_item_id: "same-item",
      title: "낱개 품목",
      quantity: 1,
      lines: [{ line_id: "manual-line", item_id: "same-item", included: true, quantity: 1 }],
    }];
    const view = renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "BOM·품목 더 담기" }));
    expect(screen.getByRole("button", { name: "BOM 품목 추가" })).toBeInTheDocument();

    state.step = 2;
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "모바일 세부 유형 변경" }));

    state.step = 3;
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /작성 중 저장/ })).toBeInTheDocument();
  });

  it("저장 실패 시 원 작업을 유지하고 preview를 시작하지 않는다", async () => {
    saveDraft.mockRejectedValue(new Error("초안 저장 실패"));
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));

    await waitFor(() => expect(screen.getByText("초안 저장 실패")).toBeInTheDocument());
    expect(previewTarget).not.toHaveBeenCalled();
    expect(state.setWorkType).not.toHaveBeenCalled();
  });

  it("preview 하나라도 실패하면 부분 카트 전환과 원 draftId URL 제거를 하지 않는다", async () => {
    const onDraftSaved = vi.fn();
    previewTarget
      .mockResolvedValueOnce({ bundles: [{ bundle_id: "warehouse-short-item-1", lines: [] }] })
      .mockRejectedValueOnce(new Error("미리보기 실패"));
    renderWizard(onDraftSaved);

    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));

    await waitFor(() => expect(screen.getByText("미리보기 실패")).toBeInTheDocument());
    expect(state.setWorkType).not.toHaveBeenCalled();
    expect(state.setBundles).not.toHaveBeenCalled();
    expect(onDraftSaved).not.toHaveBeenCalled();
  });

  it("모든 preview 성공 뒤에만 원 draftId 제거를 요청하고 새 작업으로 전환한다", async () => {
    const onDraftSaved = vi.fn();
    renderWizard(onDraftSaved);

    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));

    await waitFor(() => expect(state.setWorkType).toHaveBeenCalledWith("warehouse_io"));
    expect(onDraftSaved).toHaveBeenCalledWith("source-draft", 4, false);
    expect(state.setBundles).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ bundle_id: "warehouse-short-item-1" }),
      expect.objectContaining({ bundle_id: "warehouse-short-item-2" }),
    ]));
  });

  it("새 composition 시작 뒤에는 늦은 창고 미리보기 결과를 적용하지 않는다", async () => {
    const pendingPreview = deferred<{ bundles: { bundle_id: string; lines: never[] }[] }>();
    const onDraftSaved = vi.fn();
    state.bundles = [{
      bundle_id: "source-bundle",
      lines: [{ line_id: "short-1", item_id: "short-item-1", included: true, shortage: 1 }],
    }];
    previewTarget.mockReturnValueOnce(pendingPreview.promise);
    const view = renderWizard(onDraftSaved);

    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));
    await waitFor(() => expect(previewTarget).toHaveBeenCalledTimes(1));

    state.step = 2;
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={vi.fn()} onDraftSaved={onDraftSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "모바일 세부 유형 변경" }));
    vi.mocked(state.setWorkType).mockClear();
    vi.mocked(state.setBundles).mockClear();
    vi.mocked(state.goTo).mockClear();

    await act(async () => {
      pendingPreview.resolve({ bundles: [{ bundle_id: "stale-warehouse-bundle", lines: [] }] });
      await pendingPreview.promise;
    });

    expect(state.setWorkType).not.toHaveBeenCalled();
    expect(state.setBundles).not.toHaveBeenCalled();
    expect(state.goTo).not.toHaveBeenCalledWith(4);
    expect(onDraftSaved).not.toHaveBeenCalled();
  });

  it("새 composition 뒤 늦게 끝난 pull 저장이 다음 저장 ID와 알림을 오염시키지 않는다", async () => {
    const pendingSave = deferred<{ batch_id: string }>();
    const onDraftSaved = vi.fn();
    const onStatusChange = vi.fn();
    state.bundles = [{
      bundle_id: "source-bundle",
      lines: [{ line_id: "short-1", item_id: "short-item-1", included: true, shortage: 1 }],
    }];
    saveDraft
      .mockReturnValueOnce(pendingSave.promise)
      .mockResolvedValueOnce({ batch_id: "new-draft" });
    const view = renderWizard(onDraftSaved, onStatusChange);

    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));

    state.step = 2;
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={onStatusChange} onDraftSaved={onDraftSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "모바일 세부 유형 변경" }));
    state.step = 4;
    state.bundles = [{
      bundle_id: "new-bundle",
      lines: [{ line_id: "new-line", item_id: "new-item", included: true, shortage: 0 }],
    }];
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={onStatusChange} onDraftSaved={onDraftSaved} />);

    await act(async () => {
      pendingSave.resolve({ batch_id: "stale-a-draft" });
      await pendingSave.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId("mobile-pull-busy-state")).toHaveTextContent("idle");
    });
    const staleStatusCalls = [...onStatusChange.mock.calls];
    const staleUrlCalls = [...onDraftSaved.mock.calls];

    fireEvent.click(screen.getByRole("button", { name: "모바일 임시저장" }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(2));
    expect(saveDraft.mock.calls[1][0]).toEqual(expect.objectContaining({ batchId: null }));
    expect(staleStatusCalls).toEqual([]);
    expect(staleUrlCalls).toEqual([]);
    await waitFor(() => expect(onDraftSaved).toHaveBeenCalledWith("new-draft", 4));
  });

  it("pull 저장 대기 중 수량 편집을 보존하고 오래된 저장 부수효과를 버린다", async () => {
    const pendingSave = deferred<{ batch_id: string }>();
    const onDraftSaved = vi.fn();
    const onStatusChange = vi.fn();
    const onDirtyChange = vi.fn();
    state.bundles = [{
      bundle_id: "source-bundle",
      lines: [{ line_id: "short-1", item_id: "short-item-1", included: true, shortage: 1, quantity: 1 }],
    }];
    applyBundleUpdates();
    saveDraft.mockReturnValueOnce(pendingSave.promise);
    const view = renderWizard(onDraftSaved, onStatusChange, onDirtyChange);

    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "모바일 첫 품목 수량 변경" }));
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={onStatusChange} onDraftSaved={onDraftSaved} onDirtyChange={onDirtyChange} />);
    expect(screen.getByTestId("mobile-pull-cart-state")).toHaveTextContent("source-bundle:7");

    await act(async () => {
      pendingSave.resolve({ batch_id: "stale-content-draft" });
      await pendingSave.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId("mobile-pull-busy-state")).toHaveTextContent("idle");
    });

    expect(screen.getByTestId("mobile-pull-cart-state")).toHaveTextContent("source-bundle:7");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(previewTarget).not.toHaveBeenCalled();
    expect(onDraftSaved).not.toHaveBeenCalled();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("새 슬롯의 stale content 저장 응답 ID를 다음 일반 저장에서 재사용한다", async () => {
    const pendingSave = deferred<{ batch_id: string }>();
    const onDraftSaved = vi.fn();
    const onStatusChange = vi.fn();
    state.bundles = [{
      bundle_id: "source-bundle",
      lines: [{ line_id: "short-1", item_id: "short-item-1", included: true, shortage: 1, quantity: 1 }],
    }];
    applyBundleUpdates();
    saveDraft
      .mockReturnValueOnce(pendingSave.promise)
      .mockResolvedValueOnce({ batch_id: "stale-content-draft" });
    const view = renderWizard(onDraftSaved, onStatusChange);

    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    expect(saveDraft.mock.calls[0][0]).toEqual(expect.objectContaining({ batchId: null }));
    fireEvent.click(screen.getByRole("button", { name: "모바일 첫 품목 수량 변경" }));
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={onStatusChange} onDraftSaved={onDraftSaved} />);
    expect(screen.getByTestId("mobile-pull-cart-state")).toHaveTextContent("source-bundle:7");

    await act(async () => {
      pendingSave.resolve({ batch_id: "stale-content-draft" });
      await pendingSave.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId("mobile-pull-busy-state")).toHaveTextContent("idle");
    });
    const staleUrlCalls = [...onDraftSaved.mock.calls];
    const staleStatusCalls = [...onStatusChange.mock.calls];

    fireEvent.click(screen.getByRole("button", { name: "모바일 임시저장" }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(2));
    expect(saveDraft.mock.calls[1][0]).toEqual(expect.objectContaining({
      batchId: "stale-content-draft",
    }));
    expect(staleUrlCalls).toEqual([]);
    expect(staleStatusCalls).toEqual([]);
  });

  it("pull 미리보기 대기 중 수량 편집을 보존하고 오래된 전환을 버린다", async () => {
    const pendingPreview = deferred<{ bundles: { bundle_id: string; lines: never[] }[] }>();
    const onDraftSaved = vi.fn();
    const onStatusChange = vi.fn();
    const onDirtyChange = vi.fn();
    state.bundles = [{
      bundle_id: "source-bundle",
      lines: [{ line_id: "short-1", item_id: "short-item-1", included: true, shortage: 1, quantity: 1 }],
    }];
    applyBundleUpdates();
    previewTarget.mockReturnValueOnce(pendingPreview.promise);
    const view = renderWizard(onDraftSaved, onStatusChange, onDirtyChange);

    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));
    await waitFor(() => expect(previewTarget).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "모바일 첫 품목 수량 변경" }));
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={onStatusChange} onDraftSaved={onDraftSaved} onDirtyChange={onDirtyChange} />);
    expect(screen.getByTestId("mobile-pull-cart-state")).toHaveTextContent("source-bundle:7");

    await act(async () => {
      pendingPreview.resolve({ bundles: [{ bundle_id: "stale-warehouse-bundle", lines: [] }] });
      await pendingPreview.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId("mobile-pull-busy-state")).toHaveTextContent("idle");
    });

    expect(screen.getByTestId("mobile-pull-cart-state")).toHaveTextContent("source-bundle:7");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(onDraftSaved).not.toHaveBeenCalled();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("새 composition 뒤 오래된 미리보기 실패를 새 화면에 표시하지 않는다", async () => {
    const pendingPreview = deferred<{ bundles: { bundle_id: string; lines: never[] }[] }>();
    const onDraftSaved = vi.fn();
    const onStatusChange = vi.fn();
    state.bundles = [{
      bundle_id: "source-bundle",
      lines: [{ line_id: "short-1", item_id: "short-item-1", included: true, shortage: 1, quantity: 1 }],
    }];
    previewTarget.mockReturnValueOnce(pendingPreview.promise);
    const view = renderWizard(onDraftSaved, onStatusChange);

    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));
    await waitFor(() => expect(previewTarget).toHaveBeenCalledTimes(1));
    state.step = 2;
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={onStatusChange} onDraftSaved={onDraftSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "모바일 세부 유형 변경" }));
    state.step = 4;
    state.bundles = [{
      bundle_id: "new-bundle",
      lines: [{ line_id: "new-line", item_id: "new-item", included: true, shortage: 0, quantity: 3 }],
    }];
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={onStatusChange} onDraftSaved={onDraftSaved} />);
    vi.mocked(state.setWorkType).mockClear();
    vi.mocked(state.setBundles).mockClear();
    vi.mocked(state.goTo).mockClear();
    onStatusChange.mockClear();
    onDraftSaved.mockClear();

    await act(async () => {
      pendingPreview.reject(new Error("오래된 모바일 미리보기 실패"));
      await pendingPreview.promise.catch(() => undefined);
    });
    await waitFor(() => {
      expect(screen.getByTestId("mobile-pull-busy-state")).toHaveTextContent("idle");
    });

    expect(screen.getByTestId("mobile-pull-cart-state")).toHaveTextContent("new-bundle:3");
    expect(screen.queryByText("오래된 모바일 미리보기 실패")).not.toBeInTheDocument();
    expect(state.setWorkType).not.toHaveBeenCalled();
    expect(state.goTo).not.toHaveBeenCalledWith(4);
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("모바일 Step 3 필터와 검색어는 Step 4 왕복 뒤에도 유지한다", () => {
    state.step = 3;
    const view = renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "필터 적용" }));
    fireEvent.click(screen.getByRole("button", { name: "검색 적용" }));
    expect(screen.getByTestId("mobile-picker-filter-state")).toHaveTextContent("조립|MODEL-1|DONE|검색어");

    state.step = 4;
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={vi.fn()} />);
    state.step = 3;
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={vi.fn()} />);

    expect(screen.getByTestId("mobile-picker-filter-state")).toHaveTextContent("조립|MODEL-1|DONE|검색어");
  });

  it("같은 draft를 새 nonce로 재복원하면 모바일 필터와 검색어를 초기화한다", async () => {
    state.step = 3;
    const sameDraft = { batch_id: "same-draft" } as never;
    const view = render(
      <MobileIoComposeWizard
        globalSearch=""
        operator={operator}
        items={[]}
        setItems={vi.fn()}
        restoreDraft={sameDraft}
        restoreNonce={1}
        onStatusChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "필터 적용" }));
    fireEvent.click(screen.getByRole("button", { name: "검색 적용" }));
    expect(screen.getByTestId("mobile-picker-filter-state")).toHaveTextContent("조립|MODEL-1|DONE|검색어");

    view.rerender(
      <MobileIoComposeWizard
        globalSearch=""
        operator={operator}
        items={[]}
        setItems={vi.fn()}
        restoreDraft={sameDraft}
        restoreNonce={2}
        onStatusChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mobile-picker-filter-state")).toHaveTextContent("ALL|전체|ALL|");
    });
  });

  it("모바일 세부 유형 변경과 제출 완료는 Step 3 필터를 초기화한다", async () => {
    state.step = 3;
    const view = renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "필터 적용" }));
    fireEvent.click(screen.getByRole("button", { name: "검색 적용" }));
    state.step = 2;
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "모바일 세부 유형 변경" }));
    state.step = 3;
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={vi.fn()} />);
    expect(screen.getByTestId("mobile-picker-filter-state")).toHaveTextContent("ALL|전체|ALL|");

    fireEvent.click(screen.getByRole("button", { name: "필터 적용" }));
    fireEvent.click(screen.getByRole("button", { name: "검색 적용" }));
    state.step = 5;
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "모바일 제출" }));
    await waitFor(() => expect(state.reset).toHaveBeenCalled());
    state.step = 3;
    view.rerender(<MobileIoComposeWizard globalSearch="" operator={operator} items={[]} setItems={vi.fn()} onStatusChange={vi.fn()} />);
    expect(screen.getByTestId("mobile-picker-filter-state")).toHaveTextContent("ALL|전체|ALL|");
  });
});
