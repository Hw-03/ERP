import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    getItems: vi.fn(),
    getTransactions: vi.fn(),
    getEmployees: vi.fn(),
    getAllBOM: vi.fn(),
  },
}));

import { AdminExportSection } from "../AdminExportSection";

const itemsExportUrl = "/api/items/export";
const transactionsExportUrl = "/api/transactions/export";

describe("AdminExportSection CSV 작업 블록", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
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
});
