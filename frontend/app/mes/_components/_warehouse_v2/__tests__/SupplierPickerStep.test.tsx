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
  beforeEach(() => {
    vi.clearAllMocks();
    api.listSuppliers.mockResolvedValue([supplier]);
    api.updateSupplier.mockResolvedValue(supplier);
  });

  it("새 공급업체를 등록하면 즉시 선택한다", async () => {
    const onSelect = vi.fn();
    api.createSupplier.mockResolvedValue({ ...supplier, supplier_id: "supplier-2", name: "새 공급업체" });
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId={null} onSelect={onSelect} variant="desktop" />);

    await screen.findByText("덕스윈상사");
    fireEvent.change(screen.getByPlaceholderText("새 공급업체 이름"), { target: { value: "새 공급업체" } });
    fireEvent.click(screen.getByRole("button", { name: "추가하고 선택" }));

    await waitFor(() => expect(api.createSupplier).toHaveBeenCalledWith("warehouse-1", "새 공급업체"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ supplier_id: "supplier-2" }));
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
    expect(api.listSuppliers).toHaveBeenCalledWith("employee-1", false);
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

    await screen.findByText("등록된 공급업체가 없습니다. 위에서 새 업체를 추가하세요.");
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
    await waitFor(() => expect(api.listSuppliers).toHaveBeenLastCalledWith("warehouse-1", true));
    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it("늦게 도착한 이전 목록 응답으로 최신 검색 상태를 덮어쓰지 않는다", async () => {
    const activeOnly = deferred<typeof supplier[]>();
    const includingInactive = deferred<typeof supplier[]>();
    api.listSuppliers.mockImplementation((_employeeId: string, includeInactive: boolean) => (
      includeInactive ? includingInactive.promise : activeOnly.promise
    ));
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId={null} onSelect={vi.fn()} variant="desktop" />);

    await waitFor(() => expect(api.listSuppliers).toHaveBeenCalledWith("warehouse-1", false));
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

    await waitFor(() => expect(api.listSuppliers).toHaveBeenLastCalledWith("warehouse-1", true));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("선택된 공급업체가 목록에서 사라지면 안전하게 선택을 해제한다", async () => {
    const onSelect = vi.fn();
    api.listSuppliers.mockResolvedValue([]);
    render(<SupplierPickerStep employeeId="warehouse-1" selectedSupplierId="supplier-1" onSelect={onSelect} variant="desktop" />);

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(null));
  });
});
