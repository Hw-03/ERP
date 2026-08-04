import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  downloadAuditFile: vi.fn(),
  downloadF704Ledger: vi.fn(),
  downloadF705ProductionLog: vi.fn(),
  fetchBlob: vi.fn(),
  getAllBOM: vi.fn(),
  getEmployees: vi.fn(),
  getItems: vi.fn(),
  getItemsExportUrl: vi.fn(),
  getTransactions: vi.fn(),
  getTransactionsExportUrl: vi.fn(),
  useAuditCsvListQuery: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getItems: state.getItems,
    getTransactions: state.getTransactions,
    getEmployees: state.getEmployees,
    getAllBOM: state.getAllBOM,
    getItemsExportUrl: state.getItemsExportUrl,
    getTransactionsExportUrl: state.getTransactionsExportUrl,
  },
}));

vi.mock("@/lib/api-core", () => ({ fetchBlob: state.fetchBlob }));

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    downloadAuditFile: state.downloadAuditFile,
    downloadF704Ledger: state.downloadF704Ledger,
    downloadF705ProductionLog: state.downloadF705ProductionLog,
  },
}));

vi.mock("@/lib/queries/useSettingsQuery", () => ({
  useAuditCsvListQuery: state.useAuditCsvListQuery,
}));

import { AdminExportSection } from "../AdminExportSection";

function stubObjectUrl(url = "blob:export") {
  const createObjectURL = vi.fn(() => url);
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  return { createObjectURL, revokeObjectURL };
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("AdminExportSection", () => {
  beforeEach(() => {
    Object.values(state).forEach((mock) => mock.mockReset());
    state.getItems.mockResolvedValue([]);
    state.getTransactions.mockResolvedValue([]);
    state.getEmployees.mockResolvedValue([]);
    state.getAllBOM.mockResolvedValue([]);
    state.getItemsExportUrl.mockReturnValue("/api/items/export.xlsx");
    state.getTransactionsExportUrl.mockReturnValue("/api/inventory/transactions/export.xlsx");
    state.fetchBlob.mockResolvedValue(new Blob(["xlsx"]));
    state.useAuditCsvListQuery.mockReturnValue({
      data: [{ month: "2026-05", file_name: "inout_2026-05.csv", row_count: 2, size_bytes: 128 }],
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("F704·F705와 두 모드를 가진 데이터 내보내기 카드만 표시한다", () => {
    render(<AdminExportSection />);

    const section = screen.getByTestId("admin-export-section");
    const scrollContainer = screen.getByTestId("export-scroll-container");
    const officialGroup = screen.getByRole("group", { name: "공식 서식 내보내기" });
    const f704 = within(officialGroup).getByRole("region", { name: "F704-02 연간 자재 입출고관리대장" });
    const f705 = within(officialGroup).getByRole("region", { name: "F705-02 연간 생산일지" });
    const dataExport = screen.getByRole("region", { name: "데이터 내보내기" });
    const modeGroup = within(dataExport).getByRole("group", { name: "내보내기 유형" });
    const controlPanel = screen.getByTestId("export-control-panel");
    const downloadAction = screen.getByTestId("export-download-action");

    expect(section).toHaveClass("h-full", "min-h-0", "flex-1", "overflow-hidden");
    expect(scrollContainer).toHaveClass("min-h-0", "flex-1", "overflow-y-auto", "xl:overflow-hidden");
    expect(screen.queryByRole("banner", { name: "내보내기 페이지 제목" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "내보내기", level: 2 })).not.toBeInTheDocument();
    expect(officialGroup).toHaveClass("grid", "shrink-0", "xl:grid-cols-2");
    expect(within(officialGroup).getAllByRole("region")).toHaveLength(2);
    expect(f704).toHaveClass("h-full");
    expect(f705).toHaveClass("h-full");
    expect(f704.compareDocumentPosition(f705) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("region")).toHaveLength(3);
    expect(screen.queryByTestId("export-secondary-grid")).not.toBeInTheDocument();
    expect(dataExport).toHaveClass("min-h-0", "xl:flex-1", "xl:overflow-hidden");
    expect(controlPanel).toHaveClass("min-h-0", "xl:overflow-y-auto");
    expect(downloadAction).toHaveClass("mt-auto", "shrink-0");
    expect(within(modeGroup).getByRole("button", { name: "일반 데이터" })).toHaveAttribute("aria-pressed", "true");
    expect(within(modeGroup).getByRole("button", { name: "내부 원본 로그" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("audit-csv-controls")).not.toBeInTheDocument();
    expect(state.useAuditCsvListQuery).not.toHaveBeenCalled();

    for (const title of [
      "F704-02 연간 자재 입출고관리대장",
      "F705-02 연간 생산일지",
      "데이터 내보내기",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toHaveClass("text-[18px]", "font-black");
    }

    expect(dataExport).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "내보내기 바로가기" })).not.toBeInTheDocument();
    expect(screen.queryByText("주요 내보내기")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "최근 내보내기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "품목·입출고 Excel" })).not.toBeInTheDocument();
    expect(screen.queryByText("일반 데이터부터 공식 서식·원본 로그까지 목적별로 내려받습니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("선택 연도의 MES 생산 이력을 원본 F705-02 서식으로 내려받습니다.")).not.toBeInTheDocument();
    expect(screen.queryByText(/선택한 연도의 실제 창고 입·출고만/)).not.toBeInTheDocument();

    fireEvent.click(within(modeGroup).getByRole("button", { name: "내부 원본 로그" }));

    expect(within(dataExport).getByTestId("audit-csv-controls")).toBeInTheDocument();
    expect(within(dataExport).queryByTestId("export-control-panel")).not.toBeInTheDocument();
    expect(state.useAuditCsvListQuery).toHaveBeenCalledOnce();
  });

  it("범위에 맞는 형식·기간·비활성 옵션만 표시하고 비지원 형식은 CSV로 되돌린다", () => {
    render(<AdminExportSection />);
    const dataExport = screen.getByRole("region", { name: "데이터 내보내기" });

    expect(within(dataExport).getByRole("button", { name: "전체 데이터 CSV 4개 다운로드" })).toBeEnabled();
    expect(within(dataExport).getByTestId("export-period-settings")).toBeInTheDocument();
    expect(within(dataExport).getByTestId("export-inactive-option")).toBeInTheDocument();
    expect(within(dataExport).queryByTestId("export-format-settings")).not.toBeInTheDocument();
    expect(within(dataExport).queryByRole("checkbox", { name: "헤더 포함" })).not.toBeInTheDocument();

    fireEvent.click(within(dataExport).getByRole("button", { name: "품목" }));
    expect(within(dataExport).getByTestId("export-format-settings")).toBeInTheDocument();
    expect(within(dataExport).queryByTestId("export-period-settings")).not.toBeInTheDocument();
    expect(within(dataExport).queryByTestId("export-inactive-option")).not.toBeInTheDocument();

    fireEvent.click(within(dataExport).getByRole("button", { name: "Excel" }));
    expect(within(dataExport).getByRole("button", { name: "품목 Excel 다운로드" })).toBeEnabled();

    fireEvent.click(within(dataExport).getByRole("button", { name: "직원" }));
    expect(within(dataExport).queryByTestId("export-format-settings")).not.toBeInTheDocument();
    expect(within(dataExport).getByTestId("export-inactive-option")).toBeInTheDocument();
    expect(within(dataExport).getByRole("button", { name: "직원 CSV 다운로드" })).toBeEnabled();

    fireEvent.click(within(dataExport).getByRole("button", { name: "입출고" }));
    expect(within(dataExport).getByTestId("export-format-settings")).toBeInTheDocument();
    expect(within(dataExport).getByTestId("export-period-settings")).toBeInTheDocument();
    expect(within(dataExport).queryByTestId("export-inactive-option")).not.toBeInTheDocument();

    fireEvent.click(within(dataExport).getByRole("button", { name: "BOM" }));
    expect(within(dataExport).queryByTestId("export-format-settings")).not.toBeInTheDocument();
    expect(within(dataExport).queryByTestId("export-period-settings")).not.toBeInTheDocument();
    expect(within(dataExport).queryByTestId("export-inactive-option")).not.toBeInTheDocument();
  });

  it("품목 Excel을 인증 Blob 경로로 내려받고 성공 상태를 표시한다", async () => {
    const { createObjectURL, revokeObjectURL } = stubObjectUrl("blob:items-xlsx");
    render(<AdminExportSection />);
    const dataExport = screen.getByRole("region", { name: "데이터 내보내기" });

    fireEvent.click(within(dataExport).getByRole("button", { name: "품목" }));
    fireEvent.click(within(dataExport).getByRole("button", { name: "Excel" }));
    fireEvent.click(within(dataExport).getByRole("button", { name: "품목 Excel 다운로드" }));

    await waitFor(() => expect(state.fetchBlob).toHaveBeenCalledWith("/api/items/export.xlsx"));
    expect(state.getItemsExportUrl).toHaveBeenCalledWith();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:items-xlsx");
    expect(await within(dataExport).findByRole("status")).toHaveTextContent("품목 Excel 다운로드를 시작했습니다.");
  });

  it("입출고 Excel URL에 선택 기간을 전달한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T00:00:00.000Z"));
    stubObjectUrl("blob:transactions-xlsx");
    render(<AdminExportSection />);
    const dataExport = screen.getByRole("region", { name: "데이터 내보내기" });

    fireEvent.click(within(dataExport).getByRole("button", { name: "입출고" }));
    fireEvent.click(within(dataExport).getByRole("button", { name: "7일" }));
    fireEvent.click(within(dataExport).getByRole("button", { name: "Excel" }));
    fireEvent.click(within(dataExport).getByRole("button", { name: "입출고 Excel 다운로드" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(state.getTransactionsExportUrl).toHaveBeenCalledWith({
      start_date: "2026-07-27",
      end_date: "2026-08-03",
    });
    expect(state.fetchBlob).toHaveBeenCalledWith("/api/inventory/transactions/export.xlsx");
  });

  it("CSV에는 헤더를 항상 포함하고 카드 안에 성공 상태를 표시한다", async () => {
    const { createObjectURL } = stubObjectUrl("blob:items-csv");
    state.getItems.mockResolvedValue([
      {
        mes_code: "ITEM-001",
        item_name: "테스트 품목",
        unit: "EA",
        quantity: 3,
        min_stock: 1,
        department: "생산",
        supplier: "공급사",
      },
    ]);
    render(<AdminExportSection />);
    const dataExport = screen.getByRole("region", { name: "데이터 내보내기" });

    fireEvent.click(within(dataExport).getByRole("button", { name: "품목" }));
    fireEvent.click(within(dataExport).getByRole("button", { name: "품목 CSV 다운로드" }));

    expect(await within(dataExport).findByRole("status")).toHaveTextContent("품목 CSV 다운로드를 시작했습니다.");
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(await readBlobText(blob)).toContain('"품목 코드","품명","단위","현재고","안전재고","부서","공급처"');
  });

  it("품목과 입출고 CSV는 서버 최대 건수에 맞춰 모든 페이지를 조회한다", async () => {
    stubObjectUrl("blob:all-csv");
    const itemsPage = Array.from({ length: 2000 }, (_, index) => ({
      mes_code: `ITEM-${index}`,
      item_name: `품목 ${index}`,
      unit: "EA",
      quantity: 1,
      min_stock: 0,
    }));
    const transactionsPage = Array.from({ length: 2000 }, (_, index) => ({
      created_at: "2026-08-03T00:00:00",
      transaction_type: "RECEIVE",
      item_name: `품목 ${index}`,
      quantity_change: 1,
      item_unit: "EA",
    }));
    state.getItems.mockResolvedValueOnce(itemsPage).mockResolvedValueOnce([]);
    state.getTransactions.mockResolvedValueOnce(transactionsPage).mockResolvedValueOnce([]);
    render(<AdminExportSection />);
    const dataExport = screen.getByRole("region", { name: "데이터 내보내기" });

    fireEvent.click(within(dataExport).getByRole("button", { name: "전체 데이터 CSV 4개 다운로드" }));

    expect(await within(dataExport).findByRole("status")).toHaveTextContent("전체 데이터 CSV 4개 다운로드를 시작했습니다.");
    expect(state.getItems.mock.calls).toEqual([
      [{ skip: 0, limit: 2000 }],
      [{ skip: 2000, limit: 2000 }],
    ]);
    expect(state.getTransactions.mock.calls).toEqual([
      [{ skip: 0, limit: 2000 }],
      [{ skip: 2000, limit: 2000 }],
    ]);
  });

  it("데이터 내보내기 실패를 카드 안에 표시한다", async () => {
    state.getItems.mockRejectedValue(new Error("품목 조회 실패"));
    render(<AdminExportSection />);
    const dataExport = screen.getByRole("region", { name: "데이터 내보내기" });

    fireEvent.click(within(dataExport).getByRole("button", { name: "품목" }));
    fireEvent.click(within(dataExport).getByRole("button", { name: "품목 CSV 다운로드" }));

    expect(await within(dataExport).findByRole("alert")).toHaveTextContent("품목 조회 실패");
  });

  it("서버 조회 한도 오류를 사용자용 한국어로 표시한다", async () => {
    state.getItems.mockRejectedValue(new Error("Input should be less than or equal to 2000"));
    render(<AdminExportSection />);
    const dataExport = screen.getByRole("region", { name: "데이터 내보내기" });

    fireEvent.click(within(dataExport).getByRole("button", { name: "품목" }));
    fireEvent.click(within(dataExport).getByRole("button", { name: "품목 CSV 다운로드" }));

    expect(await within(dataExport).findByRole("alert")).toHaveTextContent("데이터 조회 범위가 허용 한도를 초과했습니다.");
  });

  it("선택 연도의 F704-02와 F705-02 파일을 내려받는다", async () => {
    const { createObjectURL, revokeObjectURL } = stubObjectUrl("blob:official-form");
    state.downloadF704Ledger.mockResolvedValue(new Blob(["f704"]));
    state.downloadF705ProductionLog.mockResolvedValue(new Blob(["f705"]));
    render(<AdminExportSection />);

    fireEvent.change(screen.getByLabelText("F704-02 연도"), { target: { value: "2025" } });
    fireEvent.click(screen.getByRole("button", { name: "F704-02 대장 다운로드" }));
    fireEvent.change(screen.getByLabelText("F705-02 연도"), { target: { value: "2024" } });
    fireEvent.click(screen.getByRole("button", { name: "F705-02 생산일지 다운로드" }));

    await waitFor(() => expect(state.downloadF704Ledger).toHaveBeenCalledWith(2025));
    await waitFor(() => expect(state.downloadF705ProductionLog).toHaveBeenCalledWith(2024));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("공식 서식 다운로드 오류를 해당 카드에 표시한다", async () => {
    state.downloadF704Ledger.mockRejectedValue(new Error("F704 다운로드 실패"));
    render(<AdminExportSection />);

    fireEvent.click(screen.getByRole("button", { name: "F704-02 대장 다운로드" }));

    const f704 = screen.getByRole("region", { name: "F704-02 연간 자재 입출고관리대장" });
    expect(await within(f704).findByRole("alert")).toHaveTextContent("F704 다운로드 실패");
  });

  it("모드 전환 후에도 일반 데이터 선택 상태를 보존한다", () => {
    render(<AdminExportSection />);
    const dataExport = screen.getByRole("region", { name: "데이터 내보내기" });

    fireEvent.click(within(dataExport).getByRole("button", { name: "품목" }));
    fireEvent.click(within(dataExport).getByRole("button", { name: "Excel" }));
    fireEvent.click(within(dataExport).getByRole("button", { name: "내부 원본 로그" }));
    fireEvent.click(within(dataExport).getByRole("button", { name: "일반 데이터" }));

    expect(within(dataExport).getByRole("button", { name: "품목 Excel 다운로드" })).toBeEnabled();
    expect(within(dataExport).getByRole("button", { name: "품목" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dataExport).getByRole("button", { name: "Excel" })).toHaveAttribute("aria-pressed", "true");
  });
});
