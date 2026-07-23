import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  downloadAuditFile: vi.fn(),
  downloadF704Ledger: vi.fn(),
  refetch: vi.fn(),
  backfill: vi.fn(),
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    downloadAuditFile: state.downloadAuditFile,
    downloadF704Ledger: state.downloadF704Ledger,
  },
}));

vi.mock("@/lib/queries/useSettingsQuery", () => ({
  useAuditCsvListQuery: () => ({
    data: [{ month: "2026-05", file_name: "inout_2026-05.csv", row_count: 2, size_bytes: 128 }],
    isLoading: false,
    error: null,
    refetch: state.refetch,
  }),
  useTriggerAuditBackfillMutation: () => ({ isPending: false, mutate: state.backfill }),
}));

import { AdminAuditCsvSection } from "../AdminAuditCsvSection";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("AdminAuditCsvSection audit downloads", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    state.downloadAuditFile.mockReset();
    state.downloadF704Ledger.mockReset();
    state.refetch.mockReset();
    state.backfill.mockReset();
  });

  it("downloads XLSX and CSV through the authenticated API and shows a download error", async () => {
    state.downloadAuditFile
      .mockRejectedValueOnce(new Error("다운로드 서버 오류"))
      .mockRejectedValueOnce(new Error("다운로드 서버 오류"));
    render(<AdminAuditCsvSection />);

    const buttons = screen.getAllByRole("button");
    const xlsxButton = buttons[buttons.length - 2];
    const csvButton = buttons[buttons.length - 1];

    fireEvent.click(xlsxButton);
    await waitFor(() => {
      expect(state.downloadAuditFile).toHaveBeenCalledWith("2026-05", "xlsx");
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("다운로드 서버 오류");

    fireEvent.click(csvButton);
    await waitFor(() => {
      expect(state.downloadAuditFile).toHaveBeenLastCalledWith("2026-05", "csv");
    });
  });

  it("downloads the selected year as an F704-02 annual ledger", async () => {
    const createObjectURL = vi.fn(() => "blob:f704-ledger");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    state.downloadF704Ledger.mockResolvedValue(new Blob(["f704"]));
    render(<AdminAuditCsvSection />);

    expect(screen.getByText("시스템 원본 로그 (월별)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("대장 연도"), { target: { value: "2025" } });
    fireEvent.click(screen.getByRole("button", { name: "F704-02 대장 다운로드" }));

    await waitFor(() => {
      expect(state.downloadF704Ledger).toHaveBeenCalledWith(2025);
    });
    expect(createObjectURL).toHaveBeenCalledOnce();
  });

  it("keeps the CSV button disabled until its own concurrent download finishes", async () => {
    const xlsx = deferred<Blob>();
    const csv = deferred<Blob>();
    const createObjectURL = vi.fn(() => "blob:audit-export");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    state.downloadAuditFile.mockImplementation((_month, format) =>
      format === "xlsx" ? xlsx.promise : csv.promise,
    );
    render(<AdminAuditCsvSection />);

    const buttons = screen.getAllByRole("button");
    const xlsxButton = buttons[buttons.length - 2];
    const csvButton = buttons[buttons.length - 1];

    fireEvent.click(xlsxButton);
    fireEvent.click(csvButton);
    xlsx.resolve(new Blob(["xlsx"]));

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(csvButton).toBeDisabled();
    });

    csv.resolve(new Blob(["csv"]));
    await waitFor(() => {
      expect(csvButton).not.toBeDisabled();
    });
  });

  it("cleans up the object URL and anchor when a download click fails", async () => {
    const createObjectURL = vi.fn(() => "blob:audit-export");
    const revokeObjectURL = vi.fn();
    const removeChild = vi.spyOn(document.body, "removeChild");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("브라우저 다운로드 실패");
    });
    state.downloadAuditFile.mockResolvedValue(new Blob(["xlsx"]));
    render(<AdminAuditCsvSection />);

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 2]);

    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:audit-export");
    });
    expect(removeChild).toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("브라우저 다운로드 실패");
  });

  it("revokes the object URL and shows an error when appending the download anchor fails", async () => {
    const createObjectURL = vi.fn(() => "blob:audit-export");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    state.downloadAuditFile.mockResolvedValue(new Blob(["xlsx"]));
    render(<AdminAuditCsvSection />);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => {
      throw new Error("다운로드 링크를 만들 수 없습니다.");
    });

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 2]);

    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:audit-export");
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("다운로드 링크를 만들 수 없습니다.");
  });
});
