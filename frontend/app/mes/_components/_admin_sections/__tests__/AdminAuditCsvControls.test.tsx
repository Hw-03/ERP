import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AuditFileFixture {
  month: string;
  file_name: string;
  row_count: number;
  size_bytes: number;
}

const state = vi.hoisted(() => ({
  downloadAuditFile: vi.fn(),
  queryResult: {
    data: [] as AuditFileFixture[],
    isLoading: false,
    error: null as Error | null,
  },
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: { downloadAuditFile: state.downloadAuditFile },
}));

vi.mock("@/lib/queries/useSettingsQuery", () => ({
  useAuditCsvListQuery: () => state.queryResult,
}));

import { AdminAuditCsvControls } from "../AdminAuditCsvControls";

function stubObjectUrl(url = "blob:audit-export") {
  const createObjectURL = vi.fn(() => url);
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  return { createObjectURL, revokeObjectURL };
}

describe("AdminAuditCsvControls", () => {
  beforeEach(() => {
    state.downloadAuditFile.mockReset();
    state.queryResult.data = [
      { month: "2026-05", file_name: "inout_2026-05.csv", row_count: 2, size_bytes: 128 },
      { month: "2026-07", file_name: "inout_2026-07.csv", row_count: 3, size_bytes: 256 },
    ];
    state.queryResult.isLoading = false;
    state.queryResult.error = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("최신 월을 기본 선택하고 선택한 월·형식으로 한 번만 다운로드한다", async () => {
    stubObjectUrl();
    state.downloadAuditFile.mockResolvedValue(new Blob(["xlsx"]));
    render(<AdminAuditCsvControls />);

    expect(screen.getByRole("combobox", { name: "대상 월" })).toHaveTextContent("2026년 7월");
    expect(screen.getByRole("button", { name: "CSV" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("combobox", { name: "대상 월" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "2026년 5월" }));
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    fireEvent.click(screen.getByRole("button", { name: "2026년 5월 Excel 다운로드" }));

    await waitFor(() => expect(state.downloadAuditFile).toHaveBeenCalledWith("2026-05", "xlsx"));
    expect(state.downloadAuditFile).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent("2026년 5월 Excel 다운로드를 시작했습니다.");
  });

  it("목록을 불러오는 동안 진행 상태를 표시한다", () => {
    state.queryResult.data = [];
    state.queryResult.isLoading = true;

    render(<AdminAuditCsvControls />);

    expect(screen.getByRole("status")).toHaveTextContent("원본 로그를 불러오는 중입니다.");
  });

  it("파일이 없으면 빈 상태를 표시하고 다운로드를 막는다", () => {
    state.queryResult.data = [];

    render(<AdminAuditCsvControls />);

    expect(screen.getByText("아직 누적된 파일이 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /다운로드/ })).not.toBeInTheDocument();
  });

  it("목록 조회 오류를 제어 영역 안에 표시한다", () => {
    state.queryResult.error = new Error("목록 조회 실패");

    render(<AdminAuditCsvControls />);

    expect(screen.getByRole("alert")).toHaveTextContent("목록 조회 실패");
  });

  it("다운로드 오류를 제어 영역 안에 표시한다", async () => {
    state.downloadAuditFile.mockRejectedValue(new Error("다운로드 실패"));
    render(<AdminAuditCsvControls />);

    fireEvent.click(screen.getByRole("button", { name: "2026년 7월 CSV 다운로드" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("다운로드 실패");
  });

  it("브라우저 다운로드 실패에도 객체 URL과 앵커를 정리한다", async () => {
    const createObjectURL = vi.fn(() => "blob:audit-export");
    const revokeObjectURL = vi.fn();
    const removeChild = vi.spyOn(document.body, "removeChild");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("브라우저 다운로드 실패");
    });
    state.downloadAuditFile.mockResolvedValue(new Blob(["csv"]));
    render(<AdminAuditCsvControls />);

    fireEvent.click(screen.getByRole("button", { name: "2026년 7월 CSV 다운로드" }));

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:audit-export"));
    expect(removeChild).toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("브라우저 다운로드 실패");
  });
});
