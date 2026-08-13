import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ActivityAuditFileFixture {
  month: string;
  file_name: string;
  row_count: number;
  size_bytes: number;
}

const state = vi.hoisted(() => ({
  downloadActivityAuditFile: vi.fn(),
  updateCurrentAuditTerminal: vi.fn(),
  getAuditTerminalId: vi.fn(() => "terminal-123"),
  queryResult: {
    data: [] as ActivityAuditFileFixture[],
    isLoading: false,
    error: null as Error | null,
  },
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: {
    downloadActivityAuditFile: state.downloadActivityAuditFile,
    updateCurrentAuditTerminal: state.updateCurrentAuditTerminal,
  },
}));

vi.mock("@/lib/activity-audit-context", () => ({
  getAuditTerminalId: state.getAuditTerminalId,
}));

vi.mock("@/lib/queries/useSettingsQuery", () => ({
  useActivityAuditListQuery: () => state.queryResult,
}));

import { AdminActivityAuditControls } from "../AdminActivityAuditControls";

function stubObjectUrl(url = "blob:activity-audit-export") {
  const createObjectURL = vi.fn(() => url);
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  return { createObjectURL, revokeObjectURL };
}

describe("AdminActivityAuditControls", () => {
  beforeEach(() => {
    state.downloadActivityAuditFile.mockReset();
    state.updateCurrentAuditTerminal.mockReset();
    state.getAuditTerminalId.mockReset().mockReturnValue("terminal-123");
    state.queryResult.data = [
      { month: "2026-06", file_name: "activity_audit_2026-06.csv", row_count: 2, size_bytes: 128 },
      { month: "2026-08", file_name: "activity_audit_2026-08.csv", row_count: 4, size_bytes: 256 },
    ];
    state.queryResult.isLoading = false;
    state.queryResult.error = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("현재 브라우저 단말명을 등록한다", async () => {
    state.updateCurrentAuditTerminal.mockResolvedValue({ terminal_id: "terminal-123", name: "출하 PC-1" });
    render(<AdminActivityAuditControls />);

    fireEvent.change(screen.getByRole("textbox", { name: "현재 단말명" }), {
      target: { value: "  출하 PC-1  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "단말명 등록" }));

    await waitFor(() => expect(state.updateCurrentAuditTerminal).toHaveBeenCalledWith({
      terminal_id: "terminal-123",
      name: "출하 PC-1",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("현재 단말명을 출하 PC-1로 등록했습니다.");
  });

  it("최신 월을 기본 선택하고 선택한 월·형식으로 다운로드한다", async () => {
    stubObjectUrl();
    state.downloadActivityAuditFile.mockResolvedValue(new Blob(["xlsx"]));
    render(<AdminActivityAuditControls />);

    expect(screen.getByRole("combobox", { name: "작업 감사 대상 월" })).toHaveTextContent("2026년 8월");
    fireEvent.click(screen.getByRole("combobox", { name: "작업 감사 대상 월" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "2026년 6월" }));
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    fireEvent.click(screen.getByRole("button", { name: "2026년 6월 작업 감사 Excel 다운로드" }));

    await waitFor(() => expect(state.downloadActivityAuditFile).toHaveBeenCalledWith("2026-06", "xlsx"));
    expect(await screen.findByRole("status")).toHaveTextContent("2026년 6월 작업 감사 Excel 다운로드를 시작했습니다.");
  });

  it("목록 조회 오류와 단말 등록 오류를 각 제어 영역에 표시한다", async () => {
    state.queryResult.error = new Error("감사 목록 조회 실패");
    state.updateCurrentAuditTerminal.mockRejectedValue(new Error("단말 등록 실패"));
    render(<AdminActivityAuditControls />);

    expect(screen.getByRole("alert")).toHaveTextContent("감사 목록 조회 실패");
    fireEvent.change(screen.getByRole("textbox", { name: "현재 단말명" }), {
      target: { value: "조립 PC-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "단말명 등록" }));

    expect(await screen.findByText("단말 등록 실패")).toHaveAttribute("role", "alert");
  });

  it("다운로드 오류를 제어 영역 안에 표시한다", async () => {
    state.downloadActivityAuditFile.mockRejectedValue(new Error("감사 파일 다운로드 실패"));
    render(<AdminActivityAuditControls />);

    fireEvent.click(screen.getByRole("button", { name: "2026년 8월 작업 감사 CSV 다운로드" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("감사 파일 다운로드 실패");
  });
});
