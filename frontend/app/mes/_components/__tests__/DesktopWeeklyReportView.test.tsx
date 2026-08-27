import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  WeeklyDetailTable: ({ stockBasis }: { stockBasis: string }) => (
    <div data-testid="weekly-detail-table" data-stock-basis={stockBasis}>품목 상세</div>
  ),
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

    expect(populatedCard).toHaveClass("weekly-card", "weekly-production");
    expect(populatedAnchor).toHaveClass("weekly-download");

    state.useWeeklyReportQuery.mockReturnValue({
      data: { groups: [], production_matrix: [] },
      isLoading: false,
      error: null,
    });
    rerender(<DesktopWeeklyReportView weekMon={new Date("2025-12-29T00:00:00")} />);

    const emptyCard = screen.getByTestId("weekly-production-card");
    const emptyAnchor = screen.getByTestId("weekly-f705-download-anchor");
    expect(emptyCard).toHaveClass("weekly-card", "weekly-production-empty");
    expect(emptyAnchor).toHaveClass("weekly-download");
  });

  it("성공하면 파일명을 설정한 앵커를 정리하고 Blob URL을 해제한다", async () => {
    state.downloadF705ProductionLog.mockResolvedValue(new Blob(["xlsx"]));
    const { createObjectURL, revokeObjectURL, click } = stubObjectUrl("blob:f705-success");
    renderWeekly();

    fireEvent.click(screen.getByRole("button", { name: "F705-02 생산일지 다운로드" }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
    expect(click).toHaveBeenCalledOnce();
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
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

  it("전환 주에는 확정 안내를 크게 표시한다", () => {
    state.useWeeklyReportQuery.mockReturnValue({
      data: {
        groups: [],
        production_matrix: [],
        report_status: "transition",
        transition_notice: "주간보고 계산 기준을 개선 중입니다. 이번 주 수치는 실제 재고와 다를 수 있으며, 다음 주부터 새 기준으로 정확한 정보가 표시됩니다.",
      },
      isLoading: false,
      error: null,
    });

    renderWeekly();

    expect(screen.getByRole("status")).toHaveTextContent("다음 주부터 새 기준으로 정확한 정보가 표시됩니다");
  });

  it("검증 보고만 정상재고 문구를 사용하고 상세 패널이 단일 스크롤 영역을 제공한다", () => {
    state.useWeeklyReportQuery.mockReturnValue({
      data: {
        groups: [{
          process_code: "TF",
          dept_name: "튜브",
          label: "튜브 완료품",
          item_count: 0,
          prev_qty: 0,
          increase_qty: 0,
          decrease_qty: 0,
          produce_qty: 0,
          receive_qty: 0,
          out_qty: 0,
          defect_qty: 0,
          current_qty: 0,
          delta: 0,
          items: [],
        }],
        production_matrix: [],
        report_status: "verified",
        basis_version: 2,
      },
      isLoading: false,
      error: null,
    });

    renderWeekly();

    expect(screen.getByTestId("weekly-detail-table")).toHaveAttribute("data-stock-basis", "normal");
    const region = screen.getByRole("region", { name: "튜브 품목 상세" });
    expect(region).toHaveClass("weekly-detail-content");
    expect(region).toHaveAttribute("tabindex", "0");

    const css = readFileSync(resolve(process.cwd(), "app", "globals.css"), "utf8");
    expect(css).toMatch(/\.weekly-detail-content\s*\{[^}]*padding:\s*0 1rem \.75rem;/);
  });

  it("전환 보고는 기존 재고 문구를 유지한다", () => {
    state.useWeeklyReportQuery.mockReturnValue({
      data: {
        groups: [],
        production_matrix: [],
        report_status: "transition",
      },
      isLoading: false,
      error: null,
    });

    renderWeekly();

    expect(screen.getByTestId("weekly-detail-table")).toHaveAttribute("data-stock-basis", "legacy");
  });

  it("검증 상태라도 정상재고 기준 버전이 아니면 기존 재고 문구를 유지한다", () => {
    state.useWeeklyReportQuery.mockReturnValue({
      data: {
        groups: [],
        production_matrix: [],
        report_status: "verified",
        basis_version: 1,
      },
      isLoading: false,
      error: null,
    });

    renderWeekly();

    expect(screen.getByTestId("weekly-detail-table")).toHaveAttribute("data-stock-basis", "legacy");
  });

  it("검산 실패 시 숫자 표를 숨기고 원인 거래 안내만 표시한다", () => {
    state.useWeeklyReportQuery.mockReturnValue({
      data: {
        groups: [],
        production_matrix: [],
        report_status: "failed",
        validation: {
          status: "failed",
          message: "집계 검산 실패: 잘못된 주간 표를 공개하지 않았습니다.",
          failures: [{ problem_id: "WEEKLY-ABC", item_id: "item-1", mes_code: "8-VF-0006", reason: "현재 재고 증감과 활동 열 합계가 일치하지 않습니다." }],
        },
      },
      isLoading: false,
      error: null,
    });

    renderWeekly();

    expect(screen.getByRole("alert")).toHaveTextContent("집계 검산 실패");
    expect(screen.getByRole("alert")).toHaveTextContent("8-VF-0006");
    expect(screen.queryByTestId("weekly-production-card")).not.toBeInTheDocument();
    expect(screen.queryByText("공정별 변화")).not.toBeInTheDocument();
  });
});
