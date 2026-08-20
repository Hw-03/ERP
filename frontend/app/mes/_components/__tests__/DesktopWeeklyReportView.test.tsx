import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  downloadF705ProductionLog: vi.fn(),
  useWeeklyReportQuery: vi.fn(),
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: { downloadF705ProductionLog: state.downloadF705ProductionLog },
}));

vi.mock("@/lib/queries/useWeeklyQuery", () => ({
  useWeeklyReportQuery: state.useWeeklyReportQuery,
}));

vi.mock("../_weekly_sections/WeeklyGroupCards", () => ({
  WeeklyGroupCards: () => <div>공정별 변화</div>,
}));

vi.mock("../_weekly_sections/WeeklyDetailTable", () => ({
  WeeklyDetailTable: () => <div>품목 상세</div>,
}));

vi.mock("../_weekly_sections/WeeklyProductionMatrix", () => ({
  WeeklyProductionMatrix: () => <div>생산 매트릭스</div>,
}));

import { DesktopWeeklyReportView } from "../DesktopWeeklyReportView";

function renderWeekly(weekMon = new Date("2025-12-29T00:00:00")) {
  return render(<DesktopWeeklyReportView weekMon={weekMon} />);
}

function stubObjectUrl(url = "blob:f705") {
  const createObjectURL = vi.fn(() => url);
  const revokeObjectURL = vi.fn();
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  return { createObjectURL, revokeObjectURL, click };
}

describe("DesktopWeeklyReportView F705-02 다운로드", () => {
  beforeEach(() => {
    state.downloadF705ProductionLog.mockReset();
    state.useWeeklyReportQuery.mockReturnValue({
      data: {
        groups: [],
        production_matrix: [{ model_key: "M1", model_label: "M1", total_qty: 1 }],
      },
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("선택한 주의 연도로 F705-02를 요청한다", async () => {
    state.downloadF705ProductionLog.mockResolvedValue(new Blob(["xlsx"]));
    stubObjectUrl();
    const { rerender } = renderWeekly();

    fireEvent.click(screen.getByRole("button", { name: "F705-02 생산일지 다운로드" }));
    await waitFor(() => expect(state.downloadF705ProductionLog).toHaveBeenLastCalledWith(2025));

    rerender(<DesktopWeeklyReportView weekMon={new Date("2026-01-05T00:00:00")} />);
    fireEvent.click(screen.getByRole("button", { name: "F705-02 생산일지 다운로드" }));
    await waitFor(() => expect(state.downloadF705ProductionLog).toHaveBeenLastCalledWith(2026));
  });

  it("생산 기록이 없는 주에도 생산 현황 헤더에 F705-02 버튼 하나를 표시한다", () => {
    state.useWeeklyReportQuery.mockReturnValue({
      data: { groups: [], production_matrix: [] },
      isLoading: false,
      error: null,
    });

    renderWeekly();

    expect(screen.getAllByRole("button", { name: "F705-02 생산일지 다운로드" })).toHaveLength(1);
  });

  it("생산 기록 유무와 관계없이 F705-02 버튼을 같은 데스크톱 우상단 앵커에 둔다", () => {
    const { rerender } = renderWeekly();
    const populatedCard = screen.getByTestId("weekly-production-card");
    const populatedAnchor = screen.getByTestId("weekly-f705-download-anchor");

    expect(populatedCard).toHaveClass("relative");
    expect(populatedAnchor).toHaveClass("lg:absolute", "lg:right-4", "lg:top-2");

    state.useWeeklyReportQuery.mockReturnValue({
      data: { groups: [], production_matrix: [] },
      isLoading: false,
      error: null,
    });
    rerender(<DesktopWeeklyReportView weekMon={new Date("2025-12-29T00:00:00")} />);

    const emptyCard = screen.getByTestId("weekly-production-card");
    const emptyAnchor = screen.getByTestId("weekly-f705-download-anchor");
    expect(emptyCard).toHaveClass("relative");
    expect(emptyAnchor).toHaveClass("lg:absolute", "lg:right-4", "lg:top-2");
  });

  it("성공하면 파일명을 설정한 앵커를 정리하고 Blob URL을 해제한다", async () => {
    state.downloadF705ProductionLog.mockResolvedValue(new Blob(["xlsx"]));
    const { createObjectURL, revokeObjectURL, click } = stubObjectUrl("blob:f705-success");
    renderWeekly();

    fireEvent.click(screen.getByRole("button", { name: "F705-02 생산일지 다운로드" }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
    expect(click).toHaveBeenCalledOnce();
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("F705-02 (R01) 2025 생산일지.xlsx");
    expect(anchor.parentNode).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:f705-success");
  });

  it("다운로드 중에는 중복 실행을 막는다", async () => {
    let resolveDownload!: (blob: Blob) => void;
    state.downloadF705ProductionLog.mockReturnValue(new Promise<Blob>((resolve) => { resolveDownload = resolve; }));
    stubObjectUrl();
    renderWeekly();
    const button = screen.getByRole("button", { name: "F705-02 생산일지 다운로드" });

    fireEvent.click(button);
    expect(await screen.findByRole("button", { name: "생산일지 생성 중..." })).toBeDisabled();
    fireEvent.click(button);
    expect(state.downloadF705ProductionLog).toHaveBeenCalledOnce();

    resolveDownload(new Blob(["xlsx"]));
    await waitFor(() => expect(screen.getByRole("button", { name: "F705-02 생산일지 다운로드" })).toBeEnabled());
  });

  it("다운로드 실패를 생산 현황 카드 안에 표시한다", async () => {
    state.downloadF705ProductionLog.mockRejectedValue(new Error("생산일지 생성 실패"));
    renderWeekly();

    fireEvent.click(screen.getByRole("button", { name: "F705-02 생산일지 다운로드" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("생산일지 생성 실패");
  });
});
