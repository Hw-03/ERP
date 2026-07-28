import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  downloadAuditFile: vi.fn(),
  downloadF704Ledger: vi.fn(),
  downloadF705ProductionLog: vi.fn(),
  getAllBOM: vi.fn(),
  getEmployees: vi.fn(),
  getItems: vi.fn(),
  getTransactions: vi.fn(),
  refetchAuditFiles: vi.fn(),
  triggerAuditBackfill: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getItems: state.getItems,
    getTransactions: state.getTransactions,
    getEmployees: state.getEmployees,
    getAllBOM: state.getAllBOM,
  },
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    downloadAuditFile: state.downloadAuditFile,
    downloadF704Ledger: state.downloadF704Ledger,
    downloadF705ProductionLog: state.downloadF705ProductionLog,
  },
}));

vi.mock("@/lib/queries/useSettingsQuery", () => ({
  useAuditCsvListQuery: () => ({
    data: [{ month: "2026-05", file_name: "inout_2026-05.csv", row_count: 2, size_bytes: 128 }],
    isLoading: false,
    error: null,
    refetch: state.refetchAuditFiles,
  }),
  useTriggerAuditBackfillMutation: () => ({ isPending: false, mutate: state.triggerAuditBackfill }),
}));

import { AdminExportSection } from "../AdminExportSection";

const itemsExportUrl = "/api/items/export";
const transactionsExportUrl = "/api/transactions/export";

function itemRow(index: number) {
  return {
    item_id: `item-${index}`,
    mes_code: `MES-${index}`,
    item_name: `품목 ${index}`,
    unit: "EA",
    quantity: index,
    min_stock: 0,
    department: "조립",
    supplier: "공급처",
  };
}

function transactionRow(index: number) {
  return {
    log_id: `tx-${index}`,
    created_at: new Date().toISOString(),
    transaction_type: "RECEIVE",
    item_name: `거래 품목 ${index}`,
    quantity_change: index,
    item_unit: "EA",
    notes: "",
  };
}

function captureCsvDownloads() {
  const blobsByUrl = new Map<string, Blob>();
  const downloads: Array<{ fileName: string; blob: Blob }> = [];
  const createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:csv-${blobsByUrl.size}`;
    blobsByUrl.set(url, blob);
    return url;
  });
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click() {
    const blob = blobsByUrl.get(this.href);
    if (blob) downloads.push({ fileName: this.download, blob });
  });
  return downloads;
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("AdminExportSection CSV 작업 블록", () => {
  beforeEach(() => {
    sessionStorage.clear();
    state.downloadAuditFile.mockReset();
    state.downloadF704Ledger.mockReset();
    state.downloadF705ProductionLog.mockReset();
    state.getAllBOM.mockReset();
    state.getEmployees.mockReset();
    state.getItems.mockReset();
    state.getTransactions.mockReset();
    state.refetchAuditFiles.mockReset();
    state.triggerAuditBackfill.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("범위별 CSV 설명과 조건부 기간·비활성 옵션을 표시한다", () => {
    render(
      <AdminExportSection
        itemsExportUrl={itemsExportUrl}
        transactionsExportUrl={transactionsExportUrl}
      />,
    );

    const csvBlock = screen.getByRole("region", { name: "선택 데이터 내보내기 (CSV)" });
    const scopeSummary = within(csvBlock).getByTestId("csv-scope-summary");

    expect(within(csvBlock).getByRole("button", { name: "선택 데이터 내보내기" })).toBeEnabled();
    expect(scopeSummary).toHaveTextContent("전체 범위 CSV 4개");
    expect(within(csvBlock).getByTestId("csv-period-settings")).toBeInTheDocument();
    expect(within(csvBlock).getByTestId("csv-inactive-option")).toBeInTheDocument();

    fireEvent.click(within(csvBlock).getByRole("button", { name: "품목" }));
    expect(scopeSummary).toHaveTextContent("품목");
    expect(within(csvBlock).queryByTestId("csv-period-settings")).not.toBeInTheDocument();
    expect(within(csvBlock).queryByTestId("csv-inactive-option")).not.toBeInTheDocument();

    fireEvent.click(within(csvBlock).getByRole("button", { name: "입출고" }));
    expect(scopeSummary).toHaveTextContent("입출고");
    expect(within(csvBlock).getByTestId("csv-period-settings")).toBeInTheDocument();
    expect(within(csvBlock).queryByTestId("csv-inactive-option")).not.toBeInTheDocument();

    fireEvent.click(within(csvBlock).getByRole("button", { name: "직원" }));
    expect(scopeSummary).toHaveTextContent("직원");
    expect(within(csvBlock).queryByTestId("csv-period-settings")).not.toBeInTheDocument();
    expect(within(csvBlock).getByTestId("csv-inactive-option")).toBeInTheDocument();

    fireEvent.click(within(csvBlock).getByRole("button", { name: "BOM" }));
    expect(scopeSummary).toHaveTextContent("BOM");
    expect(within(csvBlock).queryByTestId("csv-period-settings")).not.toBeInTheDocument();
    expect(within(csvBlock).queryByTestId("csv-inactive-option")).not.toBeInTheDocument();
  });

  it("Excel 전체 내보내기는 기존 두 다운로드를 유지한다", () => {
    vi.useFakeTimers();
    const clicks: Array<{ href: string; download: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click() {
      clicks.push({ href: this.href, download: this.download });
    });

    render(
      <AdminExportSection
        itemsExportUrl={itemsExportUrl}
        transactionsExportUrl={transactionsExportUrl}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "전체 데이터 내보내기" }));
    expect(clicks).toHaveLength(1);
    expect(clicks[0].href).toContain(itemsExportUrl);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(clicks).toHaveLength(2);
    expect(clicks[1].href).toContain(transactionsExportUrl);
  });

  it("downloads the selected year as an F705-02 annual production log", async () => {
    const createObjectURL = vi.fn(() => "blob:f705-production-log");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    state.downloadF705ProductionLog.mockResolvedValue(new Blob(["f705"]));
    render(
      <AdminExportSection
        itemsExportUrl={itemsExportUrl}
        transactionsExportUrl={transactionsExportUrl}
      />,
    );

    fireEvent.change(screen.getByLabelText("F705-02 연도"), { target: { value: "2025" } });
    fireEvent.click(screen.getByRole("button", { name: "F705-02 생산일지 다운로드" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(state.downloadF705ProductionLog).toHaveBeenCalledWith(2025);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:f705-production-log");
    expect(document.querySelector('a[download="F705-02 (R01) 2025 생산일지.xlsx"]')).toBeNull();
  });

  it("shows a download error for the F705-02 production log", async () => {
    state.downloadF705ProductionLog.mockRejectedValue(new Error("production log download failed"));
    render(
      <AdminExportSection
        itemsExportUrl={itemsExportUrl}
        transactionsExportUrl={transactionsExportUrl}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "F705-02 생산일지 다운로드" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("production log download failed");
  });

  it("embeds external submission logs after the data export controls", () => {
    render(
      <AdminExportSection
        itemsExportUrl={itemsExportUrl}
        transactionsExportUrl={transactionsExportUrl}
      />,
    );

    const externalLogs = screen.getByRole("region", { name: "외부 제출용 로그" });

    expect(externalLogs).toContainElement(screen.getByRole("button", { name: "F704-02 대장 다운로드" }));
    expect(externalLogs).toHaveTextContent("시스템 원본 로그 (월별)");
    expect(externalLogs).toHaveTextContent("백필 재실행");
  });

  it("품목 2001건을 2000건씩 페이지 수집해 마지막 행까지 CSV에 포함한다", async () => {
    state.getItems.mockImplementation(({ skip }: { skip?: number }) =>
      Promise.resolve(skip === 0 ? Array.from({ length: 2000 }, (_, index) => itemRow(index)) : [itemRow(2000)]),
    );
    const downloads = captureCsvDownloads();
    render(
      <AdminExportSection
        itemsExportUrl={itemsExportUrl}
        transactionsExportUrl={transactionsExportUrl}
      />,
    );

    const csvBlock = screen.getByRole("region", { name: "선택 데이터 내보내기 (CSV)" });
    fireEvent.click(within(csvBlock).getByRole("button", { name: "품목" }));
    fireEvent.click(within(csvBlock).getByRole("button", { name: "선택 데이터 내보내기" }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(state.getItems.mock.calls.map(([params]) => params)).toEqual([
      { limit: 2000, skip: 0 },
      { limit: 2000, skip: 2000 },
    ]);
    expect(await readBlob(downloads[0].blob)).toContain('"MES-2000","품목 2000"');
  });

  it("거래가 정확히 2000건이면 같은 기간으로 빈 다음 페이지까지 확인한다", async () => {
    state.getTransactions.mockImplementation(({ skip }: { skip?: number }) =>
      Promise.resolve(skip === 0 ? Array.from({ length: 2000 }, (_, index) => transactionRow(index)) : []),
    );
    const downloads = captureCsvDownloads();
    render(
      <AdminExportSection
        itemsExportUrl={itemsExportUrl}
        transactionsExportUrl={transactionsExportUrl}
      />,
    );

    const csvBlock = screen.getByRole("region", { name: "선택 데이터 내보내기 (CSV)" });
    fireEvent.click(within(csvBlock).getByRole("button", { name: "입출고" }));
    fireEvent.click(within(csvBlock).getByRole("button", { name: "선택 데이터 내보내기" }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    const calls = state.getTransactions.mock.calls.map(([params]) => params);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      dateFrom: expect.any(String),
      dateTo: expect.any(String),
      limit: 2000,
      skip: 0,
    });
    expect(calls[1]).toEqual({ ...calls[0], skip: 2000 });
  });

  it("전체 범위는 품목·입출고·직원·BOM CSV 네 파일을 모두 생성한다", async () => {
    state.getItems.mockResolvedValue([]);
    state.getTransactions.mockResolvedValue([]);
    state.getEmployees.mockResolvedValue([]);
    state.getAllBOM.mockResolvedValue([]);
    const downloads = captureCsvDownloads();
    render(
      <AdminExportSection
        itemsExportUrl={itemsExportUrl}
        transactionsExportUrl={transactionsExportUrl}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "선택 데이터 내보내기" }));

    await waitFor(() => expect(downloads).toHaveLength(4));
    expect(downloads.map(({ fileName }) => fileName)).toEqual([
      expect.stringMatching(/^items_.*\.csv$/),
      expect.stringMatching(/^transactions_.*\.csv$/),
      expect.stringMatching(/^employees_.*\.csv$/),
      expect.stringMatching(/^bom_.*\.csv$/),
    ]);
  });
});
