import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  downloadAuditFile: vi.fn(),
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: { downloadAuditFile: state.downloadAuditFile },
}));

vi.mock("@/lib/queries/useSettingsQuery", () => ({
  useAuditCsvListQuery: () => ({
    data: [{ month: "2026-05", file_name: "inout_2026-05.csv", row_count: 2, size_bytes: 128 }],
    isLoading: false,
    error: null,
  }),
}));

import { AdminAuditCsvSection } from "../AdminAuditCsvSection";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("AdminAuditCsvSection", () => {
  beforeEach(() => {
    state.downloadAuditFile.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("독립 카드에서 월별 원본 로그와 다운로드만 표시한다", () => {
    render(<AdminAuditCsvSection />);
    const auditPanel = screen.getByRole("region", { name: "내부 원본 로그 (월별)" });
    const title = within(auditPanel).getByRole("heading", { name: "내부 원본 로그 (월별)" });
    const header = screen.getByTestId("audit-log-header");
    const body = screen.getByTestId("audit-log-body");
    const scrollArea = screen.getByTestId("audit-log-scroll");

    expect(auditPanel).toHaveClass("flex", "min-h-0", "flex-col", "rounded-[20px]", "xl:h-full", "xl:overflow-hidden");
    expect(auditPanel.querySelector("details")).not.toBeInTheDocument();
    expect(auditPanel.querySelector("summary")).not.toBeInTheDocument();
    expect(body).toHaveClass("flex", "min-h-0", "flex-1", "flex-col", "xl:overflow-hidden");
    expect(scrollArea).toHaveClass("min-h-0", "flex-1", "overflow-x-auto", "xl:overflow-auto");
    expect(title).toHaveClass("text-[18px]", "font-black");
    expect(header).toHaveClass("flex", "min-h-11", "shrink-0", "flex-wrap", "items-center");
    expect(within(header).queryByRole("button", { name: "백필 재실행" })).not.toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: "새로고침" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "시스템 원본 로그 (월별)" })).not.toBeInTheDocument();
    expect(screen.queryByText(/월별 CSV\/XLSX는 내부 확인용으로 유지됩니다/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1개 파일 · 2행/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "F704-02 연간 자재 입출고관리대장" })).not.toBeInTheDocument();
  });

  it("인증 API로 XLSX와 CSV를 내려받고 오류를 표시한다", async () => {
    state.downloadAuditFile
      .mockRejectedValueOnce(new Error("다운로드 서버 오류"))
      .mockRejectedValueOnce(new Error("다운로드 서버 오류"));
    render(<AdminAuditCsvSection />);
    const auditPanel = screen.getByRole("region", { name: "내부 원본 로그 (월별)" });

    fireEvent.click(within(auditPanel).getByRole("button", { name: "엑셀" }));
    await waitFor(() => expect(state.downloadAuditFile).toHaveBeenCalledWith("2026-05", "xlsx"));
    expect(await within(auditPanel).findByRole("alert")).toHaveTextContent("다운로드 서버 오류");

    fireEvent.click(within(auditPanel).getByRole("button", { name: "CSV" }));
    await waitFor(() => expect(state.downloadAuditFile).toHaveBeenLastCalledWith("2026-05", "csv"));
  });

  it("동시 다운로드 중에는 각 형식 버튼 상태를 독립적으로 유지한다", async () => {
    const xlsx = deferred<Blob>();
    const csv = deferred<Blob>();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:audit-export"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    state.downloadAuditFile.mockImplementation((_month, format) =>
      format === "xlsx" ? xlsx.promise : csv.promise,
    );
    render(<AdminAuditCsvSection />);
    const auditPanel = screen.getByRole("region", { name: "내부 원본 로그 (월별)" });
    const xlsxButton = within(auditPanel).getByRole("button", { name: "엑셀" });
    const csvButton = within(auditPanel).getByRole("button", { name: "CSV" });

    fireEvent.click(xlsxButton);
    fireEvent.click(csvButton);
    xlsx.resolve(new Blob(["xlsx"]));

    await waitFor(() => expect(xlsxButton).not.toBeDisabled());
    expect(csvButton).toBeDisabled();

    csv.resolve(new Blob(["csv"]));
    await waitFor(() => expect(csvButton).not.toBeDisabled());
  });

  it("다운로드 클릭 실패에도 객체 URL과 앵커를 정리한다", async () => {
    const createObjectURL = vi.fn(() => "blob:audit-export");
    const revokeObjectURL = vi.fn();
    const removeChild = vi.spyOn(document.body, "removeChild");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("브라우저 다운로드 실패");
    });
    state.downloadAuditFile.mockResolvedValue(new Blob(["xlsx"]));
    render(<AdminAuditCsvSection />);
    const auditPanel = screen.getByRole("region", { name: "내부 원본 로그 (월별)" });

    fireEvent.click(within(auditPanel).getByRole("button", { name: "엑셀" }));

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:audit-export"));
    expect(removeChild).toHaveBeenCalled();
    expect(await within(auditPanel).findByRole("alert")).toHaveTextContent("브라우저 다운로드 실패");
  });
});
