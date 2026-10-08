import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierPickerStep } from "../SupplierPickerStep";

const api = vi.hoisted(() => ({
  listSuppliers: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api }));

const supplier = {
  supplier_id: "supplier-1",
  name: "덕스윈상사",
  is_active: true,
  created_at: "2026-09-21T00:00:00Z",
  updated_at: "2026-09-21T00:00:00Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function SnapshotNameHarness({ onSynced }: { onSynced: (nextName: string | null) => void }) {
  const [selected, setSelected] = useState<typeof supplier | null>({ ...supplier, name: "이전 스냅샷 이름" });
  return (
    <>
      <SupplierPickerStep
        employeeId="warehouse-1"
        selectedSupplierId={selected?.supplier_id ?? null}
        selectedSupplierName={selected?.name ?? null}
        onSelect={(next) => {
          onSynced(next?.name ?? null);
          setSelected(next);
        }}
        variant="desktop"
      />
      <span data-testid="selected-supplier-name">{selected?.name ?? "없음"}</span>
    </>
  );
}

describe("SupplierPickerStep", () => {
  it("튜브 범위로 조회하고 다른 범위의 선택을 해제한다", async () => {
    const onSelect = vi.fn();
    api.listSuppliers.mockResolvedValue([supplier, { ...supplier, supplier_id: "tube-1", name: "튜브 업체", scope: "tube" }]);
    render(<SupplierPickerStep employeeId="tube-employee" supplierScope="tube" selectedSupplierId="supplier-1" onSelect={onSelect} variant="desktop" />);
    await screen.findByRole("button", { name: "튜브 업체", exact: true });
    expect(api.listSuppliers).toHaveBeenCalledWith("tube-employee", true, "tube");
    expect(screen.queryByRole("button", { name: supplier.name, exact: true })).not.toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("범위 전환 후 도착한 이전 목록은 표시하지 않는다", async () => {
    const oldList = deferred<typeof supplier[]>();
    api.listSuppliers.mockReturnValueOnce(oldList.promise).mockResolvedValueOnce([{ ...supplier, name: "튜브 업체", scope: "tube" }]);
    const props = { employeeId: "employee-1", selectedSupplierId: null, onSelect: vi.fn(), variant: "mobile" as const };
    const { rerender } = render(<SupplierPickerStep {...props} />);
    rerender(<SupplierPickerStep {...props} supplierScope="tube" />);
    await screen.findByRole("button", { name: "튜브 업체", exact: true });
    await act(async () => { oldList.resolve([supplier]); });
    expect(screen.queryByRole("button", { name: supplier.name, exact: true })).not.toBeInTheDocument();
  });

  it("범위 전환 후 이전 범위의 업체 추가 결과를 선택하지 않는다", async () => {
    const oldCreate = deferred<typeof supplier>();
    const onSelect = vi.fn();
    api.createSupplier.mockReturnValueOnce(oldCreate.promise);
    api.listSuppliers.mockResolvedValueOnce([supplier]).mockResolvedValueOnce([{ ...supplier, name: "튜브 업체", scope: "tube" }]);
    const props = { employeeId: "employee-1", selectedSupplierId: null, onSelect, variant: "desktop" as const };
    const { rerender } = render(<SupplierPickerStep {...props} />);
    await screen.findByText(supplier.name);
    fireEvent.change(screen.getByPlaceholderText("업체명을 입력하세요"), { target: { value: "이전 범위 신규 업체" } });
    fireEvent.click(screen.getByRole("button", { name: "추가하고 선택" }));
    rerender(<SupplierPickerStep {...props} supplierScope="tube" />);
    await screen.findByRole("button", { name: "튜브 업체", exact: true });
    await act(async () => { oldCreate.resolve({ ...supplier, name: "이전 범위 신규 업체" }); });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByText("이전 범위 신규 업체")).not.toBeInTheDocument();
  });

  it.each(["name", "active"])("범위 전환 후 이전 범위의 %s 수정 결과를 무시한다", async (operation) => {
    const update = deferred<typeof supplier>();
    const onSelect = vi.fn();
    api.updateSupplier.mockReturnValueOnce(update.promise);
    api.listSuppliers.mockResolvedValueOnce([supplier]).mockResolvedValueOnce([{ ...supplier, name: "튜브 업체", scope: "tube" }]);
    const props = { employeeId: "employee-1", selectedSupplierId: null, onSelect, variant: "desktop" as const };
    const { rerender } = render(<SupplierPickerStep {...props} />);
    await screen.findByText(supplier.name);
    if (operation === "name") {
      fireEvent.click(screen.getByRole("button", { name: `${supplier.name} 이름 수정` }));
      fireEvent.change(screen.getByRole("textbox", { name: `${supplier.name} 이름 수정` }), { target: { value: "이전 수정명" } });
      fireEvent.click(screen.getByRole("button", { name: "이름 저장" }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: `${supplier.name} 숨김` }));
    }
    rerender(<SupplierPickerStep {...props} supplierScope="tube" />);
    await screen.findByRole("button", { name: "튜브 업체", exact: true });
    await act(async () => { update.resolve({ ...supplier, name: "이전 수정명", is_active: false }); });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "튜브 업체", exact: true })).toBeEnabled();
  });

  it("튜브 공급업체를 추가할 때 범위를 전달한다", async () => {
    api.listSuppliers.mockResolvedValue([]);
    api.createSupplier.mockResolvedValue({ ...supplier, scope: "tube" });
    render(<SupplierPickerStep employeeId="tube-employee" supplierScope="tube" selectedSupplierId={null} onSelect={vi.fn()} variant="desktop" />);
    await screen.findByText("등록된 공급업체가 없습니다.");
    fireEvent.change(screen.getByPlaceholderText("업체명을 입력하세요"), { target: { value: supplier.name } });
    fireEvent.click(screen.getByRole("button", { name: "추가하고 선택" }));
    await waitFor(() => expect(api.createSupplier).toHaveBeenCalledWith("tube-employee", supplier.name, "tube"));
  });

  it("모바일 공급업체 목록은 카드 밖 레일과 고정 프레임을 가진다", async () => {
    const { container } = render(<SupplierPickerStep variant="mobile" employeeId="warehouse-1" selectedSupplierId={null} onSelect={vi.fn()} />);
    await screen.findByRole("button", { name: "덕스윈상사", exact: true });
    expect(container.querySelector("[data-supplier-scroll-shell]")).toHaveStyle({ background: "var(--c-s1)" });
    const viewport = container.querySelector("[data-supplier-scroll-viewport]");
    expect(viewport).toHaveAttribute("data-keep-scroll");
    expect(viewport).not.toHaveStyle({ background: "var(--c-s1)" });
    expect(container.querySelector("[data-supplier-scroll-frame]")).toBeInTheDocument();
  });

  it("keeps mobile supplier rows while initial data is pending", () => {
    api.listSuppliers.mockReturnValueOnce(new Promise(() => {}));
    render(<SupplierPickerStep variant="mobile" employeeId="warehouse-1" selectedSupplierId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole("status", { name: "공급업체 목록 불러오는 중" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("선택할 수 있는 활성 공급업체가 없습니다.")).not.toBeInTheDocument();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    api.listSuppliers.mockResolvedValue([supplier]);
    api.updateSupplier.mockResolvedValue(supplier);
  });

  it("영문 ABC 다음 한글 가나다 순으로 정렬하고 ㈜는 정렬에서만 제외한다", async () => {
    api.listSuppliers.mockResolvedValue([
      { ...supplier, supplier_id: "hong", name: "홍콩" },
      { ...supplier, supplier_id: "kuga", name: "㈜쿠가" },
      { ...supplier, supplier_id: "kontron", name: "KONTRON" },
      { ...supplier, supplier_id: "cheon", name: "천우" },
      { ...supplier, supplier_id: "cei", name: "CEI" },
      { ...supplier, supplier_id: "gaon", name: "가온패드" },
      { ...supplier, supplier_id: "bgt", name: "BGT" },
    ]);
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId={null} onSelect={vi.fn()} variant="desktop" />);

    await screen.findByRole("button", { name: "㈜쿠가", exact: true });
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "BGT", "CEI", "KONTRON", "가온패드", "천우", "㈜쿠가", "홍콩",
    ]);
  });

  it("이름을 수정하면 공급처 순서를 다시 정렬한다", async () => {
    api.listSuppliers.mockResolvedValue([
      { ...supplier, name: "가온패드" },
      { ...supplier, supplier_id: "cheon", name: "천우" },
    ]);
    api.updateSupplier.mockResolvedValue({ ...supplier, name: "홍콩" });
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId={null} onSelect={vi.fn()} variant="desktop" />);

    fireEvent.click(await screen.findByRole("button", { name: "가온패드 이름 수정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "가온패드 이름 수정" }), { target: { value: "홍콩" } });
    fireEvent.click(screen.getByRole("button", { name: "이름 저장" }));

    await screen.findByRole("button", { name: "홍콩", exact: true });
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["천우", "홍콩"]);
  });

  it("공급처를 추가하면 알맞은 정렬 위치에 표시한다", async () => {
    api.listSuppliers.mockResolvedValue([{ ...supplier, name: "천우" }]);
    api.createSupplier.mockResolvedValue({ ...supplier, supplier_id: "bgt", name: "BGT" });
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId={null} onSelect={vi.fn()} variant="mobile" />);

    await screen.findByRole("button", { name: "천우", exact: true });
    fireEvent.change(screen.getByPlaceholderText("업체명을 입력하세요"), { target: { value: "BGT" } });
    fireEvent.click(screen.getByRole("button", { name: "추가하고 선택" }));

    await screen.findByRole("button", { name: "BGT", exact: true });
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["BGT", "천우"]);
  });

  it("새 공급업체를 등록하면 즉시 선택한다", async () => {
    const onSelect = vi.fn();
    api.createSupplier.mockResolvedValue({ ...supplier, supplier_id: "supplier-2", name: "새 공급업체" });
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId={null} onSelect={onSelect} variant="desktop" />);

    await screen.findByText("덕스윈상사");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText("업체명을 입력하세요"), { target: { value: "새 공급업체" } });
    fireEvent.click(screen.getByRole("button", { name: "추가하고 선택" }));

    await waitFor(() => expect(api.createSupplier).toHaveBeenCalledWith("warehouse-1", "새 공급업체", "warehouse"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ supplier_id: "supplier-2" }));
  });

  it("동일 이름은 추가하지 않고 숨김 업체는 관리 화면에서 복원하도록 안내한다", async () => {
    api.listSuppliers.mockResolvedValue([supplier, { ...supplier, supplier_id: "hidden", name: "Hidden Ltd", is_active: false }]);
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId={null} onSelect={vi.fn()} variant="desktop" />);
    await screen.findByText(supplier.name);
    const input = screen.getByPlaceholderText("업체명을 입력하세요");
    fireEvent.change(input, { target: { value: supplier.name } });
    expect(screen.queryByRole("button", { name: "추가하고 선택" })).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "  Ｈｉｄｄｅｎ Ltd  " } });
    expect(screen.queryByRole("button", { name: "추가하고 선택" })).not.toBeInTheDocument();
    expect(screen.getByText(/숨김 업체 관리에서 복원/)).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(api.createSupplier).not.toHaveBeenCalled();
  });

  it("선택된 공급업체를 숨기면 선택을 해제한다", async () => {
    const onSelect = vi.fn();
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId="supplier-1" onSelect={onSelect} variant="mobile" />);

    await screen.findByText("덕스윈상사");
    fireEvent.click(screen.getByRole("button", { name: "덕스윈상사 숨김" }));

    await waitFor(() => expect(api.updateSupplier).toHaveBeenCalledWith("supplier-1", "warehouse-1", { is_active: false }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("공급업체 검색은 일치하는 업체만 표시한다", async () => {
    api.listSuppliers.mockResolvedValue([
      supplier,
      { ...supplier, supplier_id: "supplier-2", name: "다른 상사" },
    ]);
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId={null} onSelect={vi.fn()} variant="desktop" />);

    await screen.findByText("다른 상사");
    fireEvent.change(screen.getByPlaceholderText("업체명을 입력하세요"), { target: { value: "다른" } });

    expect(screen.getByRole("button", { name: "다른 상사" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "덕스윈상사" })).not.toBeInTheDocument();
  });

  it("대시보드 검색처럼 공백과 구분 기호를 무시한다", async () => {
    api.listSuppliers.mockResolvedValue([
      { ...supplier, name: "브라우저 검증 공급업체" },
    ]);
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId={null} onSelect={vi.fn()} variant="desktop" />);

    await screen.findByRole("button", { name: "브라우저 검증 공급업체" });
    fireEvent.change(screen.getByPlaceholderText("업체명을 입력하세요"), {
      target: { value: "브라우저-검증/공급.업체" },
    });

    expect(screen.getByRole("button", { name: "브라우저 검증 공급업체" })).toBeInTheDocument();
  });

  it("활성 공급업체를 직접 선택한다", async () => {
    const onSelect = vi.fn();
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId={null} onSelect={onSelect} variant="mobile" />);

    fireEvent.click(await screen.findByRole("button", { name: "덕스윈상사" }));

    expect(onSelect).toHaveBeenCalledWith(supplier);
  });

  it("선택 전용 모드에서는 활성 목록만 조회하고 관리 기능을 숨긴다", async () => {
    render(
      <SupplierPickerStep
        employeeId="employee-1"
        selectedSupplierId={null}
        onSelect={vi.fn()}
        variant="desktop"
        mode="select"
      />,
    );

    await screen.findByRole("button", { name: "덕스윈상사" });
    expect(api.listSuppliers).toHaveBeenCalledWith("employee-1", false, "warehouse");
    expect(screen.queryByPlaceholderText("새 공급업체 이름")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "숨김 업체 관리" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "덕스윈상사 이름 수정" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "덕스윈상사 숨김" })).not.toBeInTheDocument();
  });

  it("선택된 공급업체의 이름을 수정하면 현재 선택 표시명도 갱신한다", async () => {
    const onSelect = vi.fn();
    const renamed = { ...supplier, name: "덕스윈 주식회사" };
    api.updateSupplier.mockResolvedValue(renamed);
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId="supplier-1" onSelect={onSelect} variant="desktop" />);

    fireEvent.click(await screen.findByRole("button", { name: "덕스윈상사 이름 수정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "덕스윈상사 이름 수정" }), { target: { value: "덕스윈 주식회사" } });
    fireEvent.click(screen.getByRole("button", { name: "이름 저장" }));

    await waitFor(() => expect(api.updateSupplier).toHaveBeenCalledWith("supplier-1", "warehouse-1", { name: "덕스윈 주식회사" }));
    expect(onSelect).toHaveBeenCalledWith(renamed);
  });

  it("숨김 업체를 관리 목록에서 복원한다", async () => {
    const inactiveSupplier = { ...supplier, is_active: false };
    api.listSuppliers.mockResolvedValue([inactiveSupplier]);
    api.updateSupplier.mockResolvedValue({ ...inactiveSupplier, is_active: true });
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId={null} onSelect={vi.fn()} variant="mobile" />);

    await screen.findByText("등록된 공급업체가 없습니다.");
    expect(screen.getByText("업체명을 입력해 새 업체를 추가하세요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "숨김 업체 관리" }));
    fireEvent.click(await screen.findByRole("button", { name: "덕스윈상사 복원" }));

    await waitFor(() => expect(api.updateSupplier).toHaveBeenCalledWith("supplier-1", "warehouse-1", { is_active: true }));
  });

  it("복원 초안의 활성 공급업체는 현재 이름으로 한 번만 동기화한다", async () => {
    const onSynced = vi.fn();
    api.listSuppliers.mockResolvedValue([{ ...supplier, name: "현재 마스터 이름" }]);
    render(<SnapshotNameHarness onSynced={onSynced} />);

    await waitFor(() => expect(screen.getByTestId("selected-supplier-name")).toHaveTextContent("현재 마스터 이름"));
    expect(onSynced).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "숨김 업체 관리" }));
    await waitFor(() => expect(api.listSuppliers).toHaveBeenLastCalledWith("warehouse-1", true, "warehouse"));
    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it("늦게 도착한 이전 목록 응답으로 최신 검색 상태를 덮어쓰지 않는다", async () => {
    const activeOnly = deferred<typeof supplier[]>();
    const includingInactive = deferred<typeof supplier[]>();
    api.listSuppliers.mockReturnValueOnce(activeOnly.promise).mockReturnValueOnce(includingInactive.promise);
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId={null} onSelect={vi.fn()} variant="desktop" />);

    await waitFor(() => expect(api.listSuppliers).toHaveBeenCalledWith("warehouse-1", true, "warehouse"));
    fireEvent.click(screen.getByRole("button", { name: "숨김 업체 관리" }));
    await act(async () => { includingInactive.resolve([{ ...supplier, name: "최신 목록 업체" }]); });
    await screen.findByRole("button", { name: "최신 목록 업체" });

    await act(async () => { activeOnly.resolve([{ ...supplier, name: "이전 목록 업체" }]); });
    await waitFor(() => expect(screen.queryByRole("button", { name: "이전 목록 업체" })).not.toBeInTheDocument());
  });

  it("기존 목록이 있으면 선택 변경 재조회 중에도 업체 행을 유지한다", async () => {
    const refresh = deferred<typeof supplier[]>();
    api.listSuppliers
      .mockResolvedValueOnce([supplier])
      .mockReturnValueOnce(refresh.promise);
    const { rerender } = render(
      <SupplierPickerStep employeeId="warehouse-1" selectedSupplierId={null} onSelect={vi.fn()} variant="desktop" />,
    );

    await screen.findByRole("button", { name: "덕스윈상사" });
    rerender(
      <SupplierPickerStep employeeId="warehouse-1" selectedSupplierId="supplier-1" onSelect={vi.fn()} variant="desktop" />,
    );
    await waitFor(() => expect(api.listSuppliers).toHaveBeenCalledTimes(2));

    expect(screen.getByText("덕스윈상사")).toBeInTheDocument();
    expect(screen.queryByText("공급업체 목록을 불러오는 중입니다.")).not.toBeInTheDocument();

    await act(async () => { refresh.resolve([supplier]); });
  });

  it("실패 뒤 재시도에서는 선택된 숨김 업체까지 조회하고 선택을 해제한다", async () => {
    const onSelect = vi.fn();
    api.listSuppliers
      .mockRejectedValueOnce(new Error("목록 오류"))
      .mockResolvedValueOnce([{ ...supplier, is_active: false }]);
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId="supplier-1" onSelect={onSelect} variant="desktop" />);

    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(api.listSuppliers).toHaveBeenLastCalledWith("warehouse-1", true, "warehouse"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("선택된 공급업체가 목록에서 사라지면 안전하게 선택을 해제한다", async () => {
    const onSelect = vi.fn();
    api.listSuppliers.mockResolvedValue([]);
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId="supplier-1" onSelect={onSelect} variant="desktop" />);

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(null));
  });
});
