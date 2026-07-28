import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  downloadAuditFile: vi.fn(),
  downloadF704Ledger: vi.fn(),
  downloadF705ProductionLog: vi.fn(),
  refetchAuditFiles: vi.fn(),
  triggerAuditBackfill: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getItems: vi.fn(),
    getTransactions: vi.fn(),
    getEmployees: vi.fn(),
    getAllBOM: vi.fn(),
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

describe("AdminExportSection CSV 작업 블록", () => {
  beforeEach(() => {
    sessionStorage.clear();
    state.downloadAuditFile.mockReset();
    state.downloadF704Ledger.mockReset();
    state.downloadF705ProductionLog.mockReset();
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
    expect(within(csvBlock).getByRole("checkbox", { name: "헤더 포함" })).toHaveClass("focus-visible:ring-2");

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

  it("품목·입출고 Excel 독립 카드에서 두 파일을 내려받는다", () => {
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

    const primaryExports = screen.getByRole("region", { name: "주요 내보내기" });
    const excelExports = screen.getByRole("region", { name: "품목·입출고 Excel" });
    expect(within(primaryExports).getByRole("button", { name: "F705-02 생산일지 다운로드" })).toBeEnabled();

    fireEvent.click(within(excelExports).getByRole("button", { name: "Excel 2개 다운로드" }));
    expect(clicks).toHaveLength(1);
    expect(clicks[0].href).toContain(itemsExportUrl);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(clicks).toHaveLength(2);
    expect(clicks[1].href).toContain(transactionsExportUrl);
  });

  it("최근 내보내기에는 중복 요약 카드 없이 세션 기록만 표시하고 지울 수 있다", () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(
      <AdminExportSection
        itemsExportUrl={itemsExportUrl}
        transactionsExportUrl={transactionsExportUrl}
      />,
    );

    const excelExports = screen.getByRole("region", { name: "품목·입출고 Excel" });
    const history = screen.getByRole("region", { name: "최근 내보내기" });

    fireEvent.click(within(excelExports).getByRole("button", { name: "Excel 2개 다운로드" }));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(within(history).getByText(/items_.*\.xlsx/)).toBeInTheDocument();
    expect(screen.queryByText("마지막 내보내기")).not.toBeInTheDocument();

    fireEvent.click(within(history).getByRole("button", { name: "기록 지우기" }));
    expect(within(history).getByText("아직 내보내기 기록이 없습니다")).toBeInTheDocument();
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

  it("embeds the F704 and original-log controls without a separate external-log heading", () => {
    render(
      <AdminExportSection
        itemsExportUrl={itemsExportUrl}
        transactionsExportUrl={transactionsExportUrl}
      />,
    );

    const f704Ledger = screen.getByRole("region", { name: "F704-02 연간 자재 입출고관리대장" });

    expect(f704Ledger).toContainElement(screen.getByRole("button", { name: "F704-02 대장 다운로드" }));
    expect(screen.getByRole("region", { name: "시스템 원본 로그 관리" })).toHaveTextContent("백필 재실행");
    expect(screen.getByRole("region", { name: "시스템 원본 로그 (월별)" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "외부 제출·원본 로그" })).not.toBeInTheDocument();
    expect(screen.queryByText("외부 심사용 F704-02 대장과 시스템 원본 로그를 관리합니다.")).not.toBeInTheDocument();
  });

  it("헤더 안 바로가기가 다섯 대상 영역을 정해진 순서로 부드럽게 스크롤한다", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    render(
      <AdminExportSection
        itemsExportUrl={itemsExportUrl}
        transactionsExportUrl={transactionsExportUrl}
      />,
    );

    const scrollContainer = screen.getByTestId("export-scroll-container");
    const scrollTo = vi.fn();
    Object.defineProperty(scrollContainer, "scrollTo", { value: scrollTo });
    Object.defineProperty(scrollContainer, "scrollTop", { value: 120, writable: true });
    vi.spyOn(scrollContainer, "getBoundingClientRect").mockReturnValue({ top: 30 } as DOMRect);

    const navigation = screen.getByRole("navigation", { name: "내보내기 바로가기" });
    const header = screen.getByRole("heading", { name: "내보내기" }).closest(".mb-4");
    const quickLinks = within(navigation).getAllByRole("button");
    expect(header).toContainElement(navigation);
    expect(header).toHaveClass("flex", "flex-wrap");
    expect(navigation.parentElement).toHaveClass("ml-auto", "shrink-0");
    expect(navigation).toHaveClass("flex", "w-fit", "max-w-[calc(100vw-2rem)]", "flex-wrap", "justify-end");
    expect(quickLinks).toHaveLength(5);
    quickLinks.forEach((button) => expect(button).toHaveClass("min-h-11"));
    expect(quickLinks.map((button) => button.textContent)).toEqual([
      "주요 내보내기",
      "원본 로그",
      "선택 CSV",
      "최근 내보내기",
      "품목·입출고 Excel",
    ]);

    const destinations = [
      ["주요 내보내기", screen.getByRole("region", { name: "주요 내보내기" })],
      ["원본 로그", screen.getByTestId("original-logs-section")],
      ["선택 CSV", screen.getByRole("region", { name: "선택 데이터 내보내기 (CSV)" })],
      ["최근 내보내기", screen.getByRole("region", { name: "최근 내보내기" })],
      ["품목·입출고 Excel", screen.getByRole("region", { name: "품목·입출고 Excel" })],
    ] as const;

    for (const [label, destination] of destinations) {
      const focus = vi.spyOn(destination, "focus");
      vi.spyOn(destination, "getBoundingClientRect").mockReturnValue({ top: 230 } as DOMRect);
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 320, behavior: "smooth" });
      expect(destination).toHaveAttribute("tabindex", "-1");
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(destination).toHaveFocus();
    }
  });

  it("동작 줄이기 설정에서는 바로가기를 즉시 스크롤한다", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(
      <AdminExportSection
        itemsExportUrl={itemsExportUrl}
        transactionsExportUrl={transactionsExportUrl}
      />,
    );

    const scrollContainer = screen.getByTestId("export-scroll-container");
    const scrollTo = vi.fn();
    Object.defineProperty(scrollContainer, "scrollTo", { value: scrollTo });
    vi.spyOn(scrollContainer, "getBoundingClientRect").mockReturnValue({ top: 10 } as DOMRect);
    const primaryExports = screen.getByRole("region", { name: "주요 내보내기" });
    vi.spyOn(primaryExports, "getBoundingClientRect").mockReturnValue({ top: 110 } as DOMRect);

    fireEvent.click(screen.getByRole("button", { name: "주요 내보내기" }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 100, behavior: "auto" });
  });

  it("F705, 원본 로그 전체, 선택 CSV, 최근 기록, Excel 순서로 스크롤 DOM을 배치한다", () => {
    render(
      <AdminExportSection
        itemsExportUrl={itemsExportUrl}
        transactionsExportUrl={transactionsExportUrl}
      />,
    );

    const f705Exports = screen.getByRole("region", { name: "F705-02 연간 생산일지" });
    const originalLogs = screen.getByTestId("original-logs-section");
    const selectedCsv = screen.getByRole("region", { name: "선택 데이터 내보내기 (CSV)" });
    const recentExports = screen.getByRole("region", { name: "최근 내보내기" });
    const excelExports = screen.getByRole("region", { name: "품목·입출고 Excel" });

    expect(f705Exports.compareDocumentPosition(originalLogs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(originalLogs.compareDocumentPosition(selectedCsv) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(selectedCsv.compareDocumentPosition(recentExports) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(recentExports.compareDocumentPosition(excelExports) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(originalLogs).getByRole("region", { name: "F704-02 연간 자재 입출고관리대장" })).toBeInTheDocument();
    expect(within(originalLogs).getByRole("region", { name: "시스템 원본 로그 관리" })).toBeInTheDocument();
    expect(within(originalLogs).getByRole("region", { name: "시스템 원본 로그 (월별)" })).toBeInTheDocument();
  });
});
