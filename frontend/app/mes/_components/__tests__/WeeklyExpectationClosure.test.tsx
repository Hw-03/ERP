import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ report: {} as Record<string, unknown> }));
const report = {
  week_start: "2026-07-27", week_end: "2026-08-02", report_status: "verified", basis_version: 2,
  summary: { total_produce_qty: 2 }, groups: [{ process_code: "TF", dept_name: "튜브", label: "튜브", item_count: 1, prev_qty: 7, increase_qty: 5, decrease_qty: 2, produce_qty: 2, receive_qty: 3, out_qty: 1, defect_qty: 1, current_qty: 10, delta: 3, items: [{ item_id: "weekly-item", item_name: "주간 검수품", mes_code: "QA-TF-0001", prev_qty: 7, produce_qty: 2, receive_qty: 3, out_qty: 1, defect_qty: 1, current_qty: 10, delta: 3 }] }], warnings: [],
  production_matrix: [{ model_key: "1", model_label: "검수모델", tf_qty: 2, hf_qty: 0, vf_qty: 0, nf_qty: 0, af_qty: 0, pf_qty: 0, total_qty: 2 }],
  validation: { status: "verified", message: "재고 경계와 활동 원장 검산 완료", failures: [] },
};
vi.mock("@/lib/queries/useWeeklyQuery", () => ({ useWeeklyReportQuery: () => ({ data: state.report, isLoading: false, error: null }) }));
vi.mock("../DepartmentsContext", () => ({ useDeptColorLookup: () => () => "#64748b" }));
vi.mock("../_inventory_sections/BomDetailModal", () => ({ BomDetailModal: () => null }));

import { DesktopWeeklyReportView } from "../DesktopWeeklyReportView";

describe("동결 주간보고 승인 기대값 안내", () => {
  beforeEach(() => { state.report = structuredClone(report); });
  it("8.21-06 공정 전체 생산과 TF~AF/PF 모델별 집계 범위 차이를 화면에서 설명한다", () => {
    const { container } = render(<DesktopWeeklyReportView weekMon={new Date("2026-07-27T00:00:00")} />);
    expect(container.textContent).toMatch(/공정 생산 합계|전체 공정 생산/);
    expect(container.textContent).toMatch(/모델별.*TF.*AF|모델별.*튜브.*조립/);
    expect(screen.getByText("출하 완료", { exact: true })).toBeInTheDocument();
  });
  it("8.21-07 검산 완료의 재고 원장 범위를 화면에서 설명한다", () => {
    const { container } = render(<DesktopWeeklyReportView weekMon={new Date("2026-07-27T00:00:00")} />);
    expect(container.textContent).toMatch(/재고 경계.*원장.*검산|전주.*순변화.*현재/);
  });
  it("8.21-10 불량 격리·복귀·폐기·재작업의 열 분류와 전체 순증 포함을 안내한다", () => {
    const { container } = render(<DesktopWeeklyReportView weekMon={new Date("2026-07-27T00:00:00")} />);
    for (const name of ["격리", "복귀", "폐기", "재작업"]) expect(container.textContent).toContain(name);
    expect(container.textContent).toMatch(/순증|순변화|전체 검산/);
  });

  it("생산 0이어도 PF 픽업 완료가 있으면 모델표를 표시한다", () => {
    state.report.summary = { total_produce_qty: 0, total_current_qty: 17 };
    state.report.production_matrix = [{ ...report.production_matrix[0], tf_qty: 0, pf_qty: 3, total_qty: 3 }];
    render(<DesktopWeeklyReportView weekMon={new Date("2026-07-27T00:00:00")} />);
    expect(screen.getByRole("region", { name: "모델별 공정 생산 매트릭스" })).toHaveTextContent("검수모델");
    expect(screen.getByText("출하 완료", { exact: true })).toBeVisible();
    expect(screen.queryByText(/이번 주 생산 실적 없음/)).not.toBeInTheDocument();
    expect(screen.getByTestId("weekly-production-total")).toHaveTextContent("공정 생산 합계 0개");
  });

  it("서버의 전체 정상재고와 집계 범위를 공정 선택과 무관하게 표시한다", () => {
    state.report.summary = { total_produce_qty: 2, total_current_qty: 1234 };
    state.report.aggregation_scope = { inventory: "서버가 정한 완료품 범위", production_matrix: "서버가 정한 모델별 TF~AF 생산과 PF 픽업 범위", verified_rework: "입고와 불량 동시 표시 원칙" };
    render(<DesktopWeeklyReportView weekMon={new Date("2026-07-27T00:00:00")} />);
    expect(screen.getByTestId("weekly-stock-total")).toHaveTextContent("전체 정상재고 1,234개");
    const guide = screen.getByTestId("weekly-aggregation-guide");
    expect(guide).toHaveTextContent("서버가 정한 완료품 범위");
    expect(guide).toHaveTextContent("서버가 정한 모델별 TF~AF 생산과 PF 픽업 범위");
    expect(guide).toHaveTextContent("입고와 불량 동시 표시 원칙");
  });

  it.each(["legacy", "transition"])("%s 자료에는 정상재고·검산 완료로 오인할 안내를 표시하지 않는다", (status) => {
    state.report.report_status = status;
    state.report.basis_version = 1;
    state.report.summary = { total_produce_qty: 2, total_current_qty: 17 };
    state.report.aggregation_scope = { inventory: "기존 집계 범위", verified_rework: "새 기준 전용 설명" };
    render(<DesktopWeeklyReportView weekMon={new Date("2026-07-27T00:00:00")} />);
    expect(screen.getByTestId("weekly-stock-total")).toHaveTextContent("전체 재고 17개");
    const guide = screen.getByTestId("weekly-aggregation-guide");
    expect(guide).toHaveTextContent("기존 기준·검산 전");
    expect(guide).not.toHaveTextContent("새 기준 전용 설명");
    expect(guide).not.toHaveTextContent("검산 완료");
  });
});
