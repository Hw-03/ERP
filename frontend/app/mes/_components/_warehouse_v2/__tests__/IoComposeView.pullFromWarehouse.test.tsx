import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { IoComposeView } from "../IoComposeView";

const dirtyRegistration = vi.hoisted(() => ({ dirty: false }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/mes",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tab=warehouse&section=compose&step=4"),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getAllBOM: vi.fn(),
    getItems: vi.fn(),
    preview: vi.fn(),
    saveDraft: vi.fn(),
    deleteDraft: vi.fn(),
    submit: vi.fn(),
    getItemConversionPreview: vi.fn(),
    executeItemConversion: vi.fn(),
  },
}));

vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => 0 }));
vi.mock("@/lib/activity-audit-context", () => ({ setAuditScreen: vi.fn() }));
vi.mock("@/lib/client-events", () => ({ sendClientEvent: vi.fn() }));
vi.mock("@/lib/ui/dirty-guard", () => ({
  useRegisterDirty: (_key: string, dirty: boolean) => {
    dirtyRegistration.dirty = dirty;
  },
}));
vi.mock("../IoTargetPicker", () => ({
  IoTargetPicker: ({
    filters,
    onFiltersChange,
    search,
    onSearchChange,
    onAdvance,
    onAddItem,
  }: {
    filters?: { department: string; model: string; stage: string };
    onFiltersChange?: (filters: { department: string; model: string; stage: string }) => void;
    search: string;
    onSearchChange: (search: string) => void;
    onAdvance: () => void;
    onAddItem: (item: never, sourceKind: "manual") => void;
  }) => (
    <>
      <output data-testid="picker-filter-state">
        {`${filters?.department}|${filters?.model}|${filters?.stage}|${search}`}
      </output>
      <button
        type="button"
        onClick={() => onFiltersChange?.({ department: "조립", model: "MODEL-1", stage: "DONE" })}
      >
        필터 적용
      </button>
      <button type="button" onClick={() => onSearchChange("검색어")}>검색 적용</button>
      <button
        type="button"
        onClick={() => {
          onFiltersChange?.({ department: "ALL", model: "전체", stage: "ALL" });
          onSearchChange("");
        }}
      >
        필터 초기화
      </button>
      <button
        type="button"
        onClick={() => onAddItem({ item_id: "new-source-item" } as never, "manual")}
      >
        새 작업 품목 추가
      </button>
      <button type="button" onClick={onAdvance}>수량 조정으로 이동</button>
    </>
  ),
}));
vi.mock("../IoConfirmStep", () => ({ IoConfirmStep: () => null }));
vi.mock("../IoSubmitModals", () => ({ IoSubmitModals: () => null }));
vi.mock("../IoWorkTypeStep", () => ({
  IoWorkTypeStep: () => null,
  IoSubTypeStep: ({ onFromDepartmentChange, onToDepartmentChange, onSubTypeChange, onDeptIoDirectionChange }: {
    onFromDepartmentChange: (department: string) => void;
    onToDepartmentChange: (department: string) => void;
    onSubTypeChange: (subType: "produce" | "disassemble") => void;
    onDeptIoDirectionChange: (direction: "in" | "out") => void;
  }) => (
    <>
      <button type="button" onClick={() => onFromDepartmentChange("튜브")}>출발 부서 변경</button>
      <button type="button" onClick={() => onToDepartmentChange("튜브")}>도착 부서 변경</button>
      <button type="button" onClick={() => onSubTypeChange("disassemble")}>세부 유형 변경</button>
      <button type="button" onClick={() => onDeptIoDirectionChange("out")}>방향 변경</button>
    </>
  ),
}));
vi.mock("../IoBundleCart", () => ({
  IoBundleCart: ({ bundles, subType, onPullFromWarehouse, onTogglePull, onQuantityChange, onSaveDraft, pulling }: {
    bundles: { bundle_id: string; lines: { line_id: string; quantity: number }[] }[];
    subType: string;
    onPullFromWarehouse: () => void;
    onTogglePull: (lineId: string) => void;
    onQuantityChange: (bundleId: string, lineId: string, quantity: number, shortage: number) => void;
    onSaveDraft: () => void;
    pulling: boolean;
  }) => (
    <>
      <output data-testid="pull-cart-state">{`${subType}:${bundles.map((bundle) => bundle.bundle_id).join(",")}`}</output>
      <output data-testid="pull-cart-quantity">{bundles[0]?.lines[0]?.quantity ?? "none"}</output>
      <output data-testid="pull-busy-state">{pulling ? "pulling" : "idle"}</output>
      <button type="button" onClick={() => onTogglePull("short-2")}>두 번째 부족 품목 선택</button>
      <button
        type="button"
        onClick={() => {
          const bundle = bundles[0];
          const line = bundle?.lines[0];
          if (bundle && line) onQuantityChange(bundle.bundle_id, line.line_id, 7, 0);
        }}
      >
        첫 품목 수량 변경
      </button>
      <button type="button" onClick={onPullFromWarehouse}>부족 품목 가져오기</button>
      <button type="button" onClick={onSaveDraft}>임시저장</button>
    </>
  ),
}));

const operator = {
  employee_id: "op-1",
  name: "작업자",
  department: "조립",
  warehouse_role: "none",
};

const sourceDraft = {
  batch_id: "source-draft",
  work_type: "process",
  sub_type: "produce",
  from_department: "조립",
  to_department: "조립",
  reference_no: null,
  notes: null,
  bundles: [
    {
      bundle_id: "source-bundle",
      source_kind: "direct_item",
      title: "원 작업",
      source_item_id: "source-item",
      source_mes_code: "source-item",
      quantity: 1,
      expanded_level: 0,
      lines: [
        {
          line_id: "short-1",
          item_id: "short-item-1",
          item_name: "부족 품목 1",
          mes_code: "short-item-1",
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
          shortage: 1,
          exclusion_note: null,
        },
        {
          line_id: "short-2",
          item_id: "short-item-2",
          item_name: "부족 품목 2",
          mes_code: "short-item-2",
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
          shortage: 1,
          exclusion_note: null,
        },
      ],
    },
  ],
} as never;

const replacementDraft = {
  ...sourceDraft,
  batch_id: "replacement-draft",
  bundles: [{
    ...sourceDraft.bundles[0],
    bundle_id: "replacement-bundle",
    title: "복원한 새 작업",
  }],
} as never;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function previewBundle(itemId: string) {
  return {
    bundles: [{
      bundle_id: `warehouse-${itemId}`,
      source_kind: "manual",
      title: itemId,
      source_item_id: itemId,
      source_mes_code: itemId,
      quantity: 1,
      expanded_level: 0,
      lines: [],
    }],
  } as never;
}

function renderCompose(onDraftSaved = vi.fn(), restoreStep = 4, onStatusChange = vi.fn()) {
  return render(
    <IoComposeView
      globalSearch=""
      operator={operator}
      employees={[]}
      items={[]}
      productModels={[]}
      setItems={() => {}}
      restoreDraft={sourceDraft}
      restoreNonce={1}
      restoreStep={restoreStep as 3 | 4}
      onStatusChange={onStatusChange}
      onDraftSaved={onDraftSaved}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dirtyRegistration.dirty = false;
  vi.mocked(api.getAllBOM).mockResolvedValue([]);
  vi.mocked(api.getItems).mockResolvedValue([]);
  vi.mocked(api.saveDraft).mockResolvedValue({ batch_id: "source-draft" } as never);
  vi.mocked(api.preview).mockImplementation(({ targets }) =>
    Promise.resolve(previewBundle(targets[0].item_id)),
  );
});

describe("IoComposeView 부족 품목 가져오기", () => {
  it("첫 클릭에서 원 초안 URL 복원을 끄고 새 창고 반출 카트를 표시한다", async () => {
    const onDraftSaved = vi.fn();
    renderCompose(onDraftSaved);

    await screen.findByTestId("pull-cart-state");
    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));

    await waitFor(() => {
      expect(screen.getByTestId("pull-cart-state")).toHaveTextContent(
        "warehouse_to_dept:warehouse-short-item-1,warehouse-short-item-2",
      );
    });
    expect(onDraftSaved).toHaveBeenCalledWith(
      "source-draft",
      4,
      false,
    );
    expect(api.preview).toHaveBeenCalledTimes(2);
  });

  it("선택한 부족 라인만 새 창고 반출 카트에 담는다", async () => {
    renderCompose();

    await screen.findByTestId("pull-cart-state");
    fireEvent.click(screen.getByRole("button", { name: "두 번째 부족 품목 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));

    await waitFor(() => {
      expect(screen.getByTestId("pull-cart-state")).toHaveTextContent(
        "warehouse_to_dept:warehouse-short-item-2",
      );
    });
    expect(api.preview).toHaveBeenCalledWith(expect.objectContaining({
      work_type: "warehouse_io",
      sub_type: "warehouse_to_dept",
      targets: [expect.objectContaining({ item_id: "short-item-2" })],
    }));
  });

  it("처리 중 중복 클릭은 원 초안 저장과 preview를 한 번만 실행한다", async () => {
    renderCompose();
    await screen.findByTestId("pull-cart-state");
    const button = screen.getByRole("button", { name: "부족 품목 가져오기" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(2));
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
  });

  it("원 초안 저장에 실패하면 원 작업을 유지하고 미리보기를 시작하지 않는다", async () => {
    vi.mocked(api.saveDraft).mockRejectedValue(new Error("초안 저장 실패"));
    renderCompose();

    await screen.findByTestId("pull-cart-state");
    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));

    await waitFor(() => {
      expect(screen.getByText("초안 저장 실패")).toBeInTheDocument();
    });
    expect(screen.getByTestId("pull-cart-state")).toHaveTextContent("produce:source-bundle");
    expect(api.preview).not.toHaveBeenCalled();
  });

  it("새 작업 미리보기에 실패하면 원 작업을 유지한다", async () => {
    vi.mocked(api.preview).mockRejectedValue(new Error("미리보기 실패"));
    const onDraftSaved = vi.fn();
    renderCompose(onDraftSaved);

    await screen.findByTestId("pull-cart-state");
    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));

    await waitFor(() => {
      expect(screen.getByText("미리보기 실패")).toBeInTheDocument();
    });
    expect(screen.getByTestId("pull-cart-state")).toHaveTextContent("produce:source-bundle");
    expect(onDraftSaved).not.toHaveBeenCalled();
  });

  it("복원 중인 새 작업에 늦은 창고 미리보기 결과를 적용하지 않는다", async () => {
    const pendingPreview = deferred<Awaited<ReturnType<typeof api.preview>>>();
    const onDraftSaved = vi.fn();
    vi.mocked(api.preview).mockReturnValueOnce(pendingPreview.promise);
    const view = renderCompose(onDraftSaved);

    await screen.findByTestId("pull-cart-state");
    fireEvent.click(screen.getByRole("button", { name: "두 번째 부족 품목 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1));

    view.rerender(
      <IoComposeView
        globalSearch=""
        operator={operator}
        employees={[]}
        items={[]}
        productModels={[]}
        setItems={() => {}}
        restoreDraft={replacementDraft}
        restoreNonce={2}
        restoreStep={4}
        onStatusChange={() => {}}
        onDraftSaved={onDraftSaved}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("pull-cart-state")).toHaveTextContent(
        "produce:replacement-bundle",
      );
    });

    await act(async () => {
      pendingPreview.resolve(previewBundle("short-item-2"));
      await pendingPreview.promise;
    });

    expect(screen.getByTestId("pull-cart-state")).toHaveTextContent(
      "produce:replacement-bundle",
    );
    expect(onDraftSaved).not.toHaveBeenCalledWith(
      "source-draft",
      4,
      false,
    );
  });

  it("복원 뒤 늦게 끝난 pull 저장이 새 draft ID와 저장 알림을 오염시키지 않는다", async () => {
    const pendingSave = deferred<Awaited<ReturnType<typeof api.saveDraft>>>();
    const onDraftSaved = vi.fn();
    vi.mocked(api.saveDraft)
      .mockReturnValueOnce(pendingSave.promise)
      .mockResolvedValueOnce({ batch_id: "replacement-draft" } as never);
    const view = renderCompose(onDraftSaved);

    await screen.findByTestId("pull-cart-state");
    fireEvent.click(screen.getByRole("button", { name: "두 번째 부족 품목 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));
    await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("pull-busy-state")).toHaveTextContent("pulling");

    view.rerender(
      <IoComposeView
        globalSearch=""
        operator={operator}
        employees={[]}
        items={[]}
        productModels={[]}
        setItems={() => {}}
        restoreDraft={replacementDraft}
        restoreNonce={2}
        restoreStep={4}
        onStatusChange={() => {}}
        onDraftSaved={onDraftSaved}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("pull-cart-state")).toHaveTextContent(
        "produce:replacement-bundle",
      );
    });

    await act(async () => {
      pendingSave.resolve({ batch_id: "stale-a-draft" } as never);
      await pendingSave.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId("pull-busy-state")).toHaveTextContent("idle");
    });
    const staleNotice = screen.queryByTestId("io-draft-save-notice");
    const staleUrlCalls = [...onDraftSaved.mock.calls];

    fireEvent.click(screen.getByRole("button", { name: "임시저장" }));
    await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.saveDraft).mock.calls[1][0]).toEqual(expect.objectContaining({
      batch_id: "replacement-draft",
    }));
    expect(staleNotice).not.toBeInTheDocument();
    expect(staleUrlCalls).toEqual([]);
    await waitFor(() => {
      expect(onDraftSaved).toHaveBeenCalledWith("replacement-draft", 4);
    });
  });

  it("pull 저장 대기 중 수량 편집을 보존하고 오래된 저장 부수효과를 버린다", async () => {
    const pendingSave = deferred<Awaited<ReturnType<typeof api.saveDraft>>>();
    const onDraftSaved = vi.fn();
    const onStatusChange = vi.fn();
    vi.mocked(api.saveDraft).mockReturnValueOnce(pendingSave.promise);
    renderCompose(onDraftSaved, 4, onStatusChange);

    await screen.findByTestId("pull-cart-state");
    onStatusChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "두 번째 부족 품목 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));
    await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "첫 품목 수량 변경" }));
    await waitFor(() => {
      expect(screen.getByTestId("pull-cart-quantity")).toHaveTextContent("7");
      expect(dirtyRegistration.dirty).toBe(true);
    });

    await act(async () => {
      pendingSave.resolve({ batch_id: "stale-content-draft" } as never);
      await pendingSave.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId("pull-busy-state")).toHaveTextContent("idle");
    });

    expect(screen.getByTestId("pull-cart-state")).toHaveTextContent("produce:source-bundle");
    expect(screen.getByTestId("pull-cart-quantity")).toHaveTextContent("7");
    expect(dirtyRegistration.dirty).toBe(true);
    expect(api.preview).not.toHaveBeenCalled();
    expect(onDraftSaved).not.toHaveBeenCalled();
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId("io-draft-save-notice")).not.toBeInTheDocument();
  });

  it("새 슬롯의 stale content 저장 응답 ID를 다음 일반 저장에서 재사용한다", async () => {
    const pendingSave = deferred<Awaited<ReturnType<typeof api.saveDraft>>>();
    const onDraftSaved = vi.fn();
    const onStatusChange = vi.fn();
    vi.mocked(api.preview).mockResolvedValueOnce({
      bundles: [sourceDraft.bundles[0]],
    } as never);
    vi.mocked(api.saveDraft)
      .mockReturnValueOnce(pendingSave.promise)
      .mockResolvedValueOnce({ batch_id: "stale-content-draft" } as never);
    renderCompose(onDraftSaved, 3, onStatusChange);

    await screen.findByTestId("picker-filter-state");
    fireEvent.click(screen.getAllByTestId("io-step-nav-item")[1]);
    fireEvent.click(screen.getByRole("button", { name: "세부 유형 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 단계로 →" }));
    await screen.findByTestId("picker-filter-state");
    fireEvent.click(screen.getByRole("button", { name: "새 작업 품목 추가" }));
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "수량 조정으로 이동" }));
    await screen.findByTestId("pull-cart-state");
    onStatusChange.mockClear();
    onDraftSaved.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));
    await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.saveDraft).mock.calls[0][0]).toEqual(expect.objectContaining({
      batch_id: null,
    }));
    fireEvent.click(screen.getByRole("button", { name: "첫 품목 수량 변경" }));
    await waitFor(() => {
      expect(screen.getByTestId("pull-cart-quantity")).toHaveTextContent("7");
    });

    await act(async () => {
      pendingSave.resolve({ batch_id: "stale-content-draft" } as never);
      await pendingSave.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId("pull-busy-state")).toHaveTextContent("idle");
    });
    const staleNotice = screen.queryByTestId("io-draft-save-notice");
    const staleUrlCalls = [...onDraftSaved.mock.calls];
    const staleStatusCalls = [...onStatusChange.mock.calls];

    fireEvent.click(screen.getByRole("button", { name: "임시저장" }));
    await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.saveDraft).mock.calls[1][0]).toEqual(expect.objectContaining({
      batch_id: "stale-content-draft",
    }));
    expect(staleNotice).not.toBeInTheDocument();
    expect(staleUrlCalls).toEqual([]);
    expect(staleStatusCalls).toEqual([]);
  });

  it("pull 미리보기 대기 중 수량 편집을 보존하고 오래된 전환을 버린다", async () => {
    const pendingPreview = deferred<Awaited<ReturnType<typeof api.preview>>>();
    const onDraftSaved = vi.fn();
    const onStatusChange = vi.fn();
    vi.mocked(api.preview).mockReturnValueOnce(pendingPreview.promise);
    renderCompose(onDraftSaved, 4, onStatusChange);

    await screen.findByTestId("pull-cart-state");
    onStatusChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "두 번째 부족 품목 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "첫 품목 수량 변경" }));
    await waitFor(() => {
      expect(screen.getByTestId("pull-cart-quantity")).toHaveTextContent("7");
      expect(dirtyRegistration.dirty).toBe(true);
    });

    await act(async () => {
      pendingPreview.resolve(previewBundle("short-item-2"));
      await pendingPreview.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId("pull-busy-state")).toHaveTextContent("idle");
    });

    expect(screen.getByTestId("pull-cart-state")).toHaveTextContent("produce:source-bundle");
    expect(screen.getByTestId("pull-cart-quantity")).toHaveTextContent("7");
    expect(dirtyRegistration.dirty).toBe(true);
    expect(onDraftSaved).not.toHaveBeenCalled();
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId("io-draft-save-notice")).not.toBeInTheDocument();
  });

  it("새 draft 복원 뒤 오래된 미리보기 실패를 새 화면에 표시하지 않는다", async () => {
    const pendingPreview = deferred<Awaited<ReturnType<typeof api.preview>>>();
    const onDraftSaved = vi.fn();
    const onStatusChange = vi.fn();
    vi.mocked(api.preview).mockReturnValueOnce(pendingPreview.promise);
    const view = renderCompose(onDraftSaved, 4, onStatusChange);

    await screen.findByTestId("pull-cart-state");
    fireEvent.click(screen.getByRole("button", { name: "두 번째 부족 품목 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "부족 품목 가져오기" }));
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1));

    view.rerender(
      <IoComposeView
        globalSearch=""
        operator={operator}
        employees={[]}
        items={[]}
        productModels={[]}
        setItems={() => {}}
        restoreDraft={replacementDraft}
        restoreNonce={2}
        restoreStep={4}
        onStatusChange={onStatusChange}
        onDraftSaved={onDraftSaved}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("pull-cart-state")).toHaveTextContent("produce:replacement-bundle");
    });

    await act(async () => {
      pendingPreview.reject(new Error("오래된 미리보기 실패"));
      await pendingPreview.promise.catch(() => undefined);
    });
    await waitFor(() => {
      expect(screen.getByTestId("pull-busy-state")).toHaveTextContent("idle");
    });

    expect(screen.getByTestId("pull-cart-state")).toHaveTextContent("produce:replacement-bundle");
    expect(screen.queryByText("오래된 미리보기 실패")).not.toBeInTheDocument();
    expect(onDraftSaved).not.toHaveBeenCalled();
  });

  it("Step 3 필터와 검색어를 Step 4 왕복 동안 유지하고 명시적 초기화에서만 지운다", async () => {
    renderCompose(vi.fn(), 3);

    await screen.findByTestId("picker-filter-state");
    fireEvent.click(screen.getByRole("button", { name: "필터 적용" }));
    fireEvent.click(screen.getByRole("button", { name: "검색 적용" }));
    expect(screen.getByTestId("picker-filter-state")).toHaveTextContent("조립|MODEL-1|DONE|검색어");

    fireEvent.click(screen.getByRole("button", { name: "수량 조정으로 이동" }));
    await screen.findByTestId("pull-cart-state");
    fireEvent.click(screen.getAllByTestId("io-step-nav-item")[2]);

    await waitFor(() => {
      expect(screen.getByTestId("picker-filter-state")).toHaveTextContent("조립|MODEL-1|DONE|검색어");
    });
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(screen.getByTestId("picker-filter-state")).toHaveTextContent("ALL|전체|ALL|");
  });

  it("같은 draft를 새 nonce로 재복원하면 Step 3 필터와 검색어를 초기화한다", async () => {
    const view = renderCompose(vi.fn(), 3);

    await screen.findByTestId("picker-filter-state");
    fireEvent.click(screen.getByRole("button", { name: "필터 적용" }));
    fireEvent.click(screen.getByRole("button", { name: "검색 적용" }));
    expect(screen.getByTestId("picker-filter-state")).toHaveTextContent("조립|MODEL-1|DONE|검색어");

    view.rerender(
      <IoComposeView
        globalSearch=""
        operator={operator}
        employees={[]}
        items={[]}
        productModels={[]}
        setItems={() => {}}
        restoreDraft={sourceDraft}
        restoreNonce={2}
        restoreStep={3}
        onStatusChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("picker-filter-state")).toHaveTextContent("ALL|전체|ALL|");
    });
  });

  it("출발 부서와 방향을 바꾸면 데스크톱 Step 3 필터를 초기화한다", async () => {
    renderCompose(vi.fn(), 3);
    await screen.findByTestId("picker-filter-state");
    fireEvent.click(screen.getByRole("button", { name: "필터 적용" }));
    fireEvent.click(screen.getByRole("button", { name: "검색 적용" }));
    fireEvent.click(screen.getAllByTestId("io-step-nav-item")[1]);
    fireEvent.click(screen.getByRole("button", { name: "출발 부서 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 단계로 →" }));

    await waitFor(() => expect(screen.getByTestId("picker-filter-state")).toHaveTextContent("ALL|전체|ALL|"));
    fireEvent.click(screen.getByRole("button", { name: "필터 적용" }));
    fireEvent.click(screen.getAllByTestId("io-step-nav-item")[1]);
    fireEvent.click(screen.getByRole("button", { name: "방향 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 단계로 →" }));

    await waitFor(() => expect(screen.getByTestId("picker-filter-state")).toHaveTextContent("ALL|전체|ALL|"));
  });

  it("도착 부서와 세부 유형을 바꾸면 데스크톱 Step 3 필터를 초기화한다", async () => {
    renderCompose(vi.fn(), 3);
    await screen.findByTestId("picker-filter-state");
    fireEvent.click(screen.getByRole("button", { name: "필터 적용" }));
    fireEvent.click(screen.getAllByTestId("io-step-nav-item")[1]);
    fireEvent.click(screen.getByRole("button", { name: "도착 부서 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 단계로 →" }));
    await waitFor(() => expect(screen.getByTestId("picker-filter-state")).toHaveTextContent("ALL|전체|ALL|"));

    fireEvent.click(screen.getByRole("button", { name: "필터 적용" }));
    fireEvent.click(screen.getAllByTestId("io-step-nav-item")[1]);
    fireEvent.click(screen.getByRole("button", { name: "세부 유형 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 단계로 →" }));
    await waitFor(() => expect(screen.getByTestId("picker-filter-state")).toHaveTextContent("ALL|전체|ALL|"));
  });
});
